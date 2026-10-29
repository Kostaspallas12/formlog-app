'use client';

import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from './Icons';
import { useGuard } from '@/lib/useGuard';
import { addAthlete, addPhoto, createInvite, deleteAthlete, inviteErrorCode, putCheckin, setWeighIn, uuid } from '@/lib/storage';
import { processImage } from '@/lib/images';
import { ANGLES, parseDecimal, todayISO } from '@/lib/utils';

// Νέος αθλούμενος (για τον προπονητή): όνομα, ηλικία, ύψος, αρχικό βάρος και αρχικές φωτογραφίες.
// (Τη συγκατάθεση των αθλούμενων την έχει δηλώσει ο προπονητής στην εγγραφή του.)
// Το βάρος μπαίνει στον πίνακα βάρους και οι φωτογραφίες ως η πρώτη καταγραφή, με σημερινή ημερομηνία.
// Μαζί δημιουργείται αμέσως και ο σύνδεσμος πρόσκλησης (με προαιρετικό κλείδωμα στο email).
export default function AthleteForm({ onDone, onCancel }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [email, setEmail] = useState('');
  const [files, setFiles] = useState({}); // { front: { file, preview }, … }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Καθαρισμός των προσωρινών URL των φωτογραφιών όταν κλείνει η φόρμα
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => Object.values(filesRef.current).forEach((f) => URL.revokeObjectURL(f.preview)), []);

  const pick = (angle, file) => {
    if (!file) return;
    setFiles((prev) => {
      if (prev[angle]) URL.revokeObjectURL(prev[angle].preview);
      return { ...prev, [angle]: { file, preview: URL.createObjectURL(file) } };
    });
  };

  const clear = (angle) =>
    setFiles((prev) => {
      if (prev[angle]) URL.revokeObjectURL(prev[angle].preview);
      const { [angle]: _, ...rest } = prev;
      return rest;
    });

  const guard = useGuard();
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Γράψε το όνομα του αθλούμενου.');
    const ageNum = age.trim() ? parseInt(age, 10) : null;
    if (ageNum != null && !(ageNum >= 5 && ageNum <= 120)) return setError('Γράψε μια έγκυρη ηλικία.');
    const cm = height.trim() ? parseInt(height, 10) : null;
    if (cm != null && !(cm >= 80 && cm <= 250)) return setError('Γράψε ένα έγκυρο ύψος σε εκατοστά.');
    const kg = weight.trim() ? parseDecimal(weight) : null;
    if (kg != null && !(kg > 20 && kg < 400)) return setError('Γράψε ένα έγκυρο βάρος σε κιλά.');

    setBusy(true);
    setError('');
    let athlete = null;
    try {
      // Πρώτα μικραίνουμε τις φωτογραφίες, ώστε αν μία αποτύχει να μη δημιουργηθεί τίποτα μισό.
      const shrunk = {};
      for (const a of ANGLES) {
        if (!files[a.id]) continue;
        try {
          shrunk[a.id] = await processImage(files[a.id].file);
        } catch {
          throw new Error(`Δεν διαβάστηκε η φωτογραφία «${a.label}». Δοκίμασε αρχείο JPG ή PNG.`);
        }
      }

      athlete = await addAthlete(name, { age: ageNum, height: cm, asCoach: true });
      const date = todayISO();
      if (kg != null) await setWeighIn({ athleteId: athlete.id, date, weight: Math.round(kg * 10) / 10 });

      if (Object.keys(shrunk).length) {
        const photos = {};
        for (const [angle, versions] of Object.entries(shrunk)) photos[angle] = await addPhoto(versions, athlete.id);
        await putCheckin({
          id: uuid(), athleteId: athlete.id, date, weight: null, photos, note: '',
          createdAt: new Date().toISOString(),
        });
      }
      // Η πρόσκληση· αν δεν σταλεί (π.χ. έχει ήδη άλλον προπονητή), ο προπονητής βλέπει τον λόγο στη σελίδα του αθλούμενου.
      let inviteProblem = null;
      await createInvite(athlete.id, email.trim()).catch((e) => { inviteProblem = inviteErrorCode(e); });
      onDone(athlete, inviteProblem);
    } catch (err) {
      // Αν κόπηκε στη μέση, δεν αφήνουμε μισό αθλούμενο.
      if (athlete) await deleteAthlete(athlete.id).catch(() => {});
      setError(err.message?.startsWith('Δεν') ? err.message : 'Η αποθήκευση απέτυχε. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.');
      setBusy(false);
    }
  };

  return (
    <form className="panel athlete-form" onSubmit={guard(submit)}>
      <div className="athlete-fields">
        <label className="f">
          Όνομα
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off" required autoFocus />
        </label>
        <label className="f">
          Ηλικία
          <input inputMode="numeric" value={age} maxLength={3} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="f">
          Ύψος (cm)
          <input inputMode="numeric" placeholder="π.χ. 172" value={height} maxLength={3} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="f">
          Αρχικό βάρος (kg)
          <input inputMode="decimal" placeholder="π.χ. 78,5" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="f athlete-email">
          Email αθλούμενου (προαιρετικό)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="μόνο αυτό το email θα μπορεί να μπει" />
        </label>
      </div>

      <p className="athlete-photos-label">Αρχικές φωτογραφίες</p>
      <div className="slots">
        {ANGLES.map((a) => (
          <div className="slot" key={a.id}>
            {files[a.id] ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={files[a.id].preview} alt={a.label} />
                <span className="slot-label">{a.label}</span>
                <button type="button" className="slot-x" onClick={() => clear(a.id)} aria-label={`Αφαίρεση: ${a.label}`}><CloseIcon size={18} /></button>
              </>
            ) : (
              <label className="slot-empty">
                <span className="plus" aria-hidden="true">+</span>
                {a.label}
                <input type="file" accept="image/*" onChange={(e) => { pick(a.id, e.target.files[0]); e.target.value = ''; }} />
              </label>
            )}
          </div>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>Ακύρωση</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Αποθήκευση...' : 'Προσθήκη αθλούμενου'}</button>
      </div>
    </form>
  );
}
