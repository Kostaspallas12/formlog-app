'use client';

import { useEffect, useRef, useState } from 'react';
import { useGuard } from '@/lib/useGuard';
import { addPhoto, deleteWeighInOn, putCheckin, removePhotos, setWeighIn, uuid } from '@/lib/storage';
import { processImage } from '@/lib/images';
import { ANGLES, fmtKg, parseDecimal, todayISO } from '@/lib/utils';
import { CloseIcon, ImageIcon } from './Icons';
import Photo from './Photo';
import DateField from './DateField';
import { cleanAnswers } from '@/lib/checkinForm';

// Νέα καταγραφή ή επεξεργασία υπάρχουσας: ημερομηνία, βάρος, έως 3 φωτογραφίες, σημείωση.
// Γρήγορα: «Διάλεξε φωτογραφίες» (και τις 3 μαζί) ή σύρσιμο από τον υπολογιστή πάνω στη φόρμα·
// μπαίνουν με τη σειρά που τραβήχτηκαν (Μπροστά → Πλάγια → Πίσω). Σύρσιμο ανάμεσα στις θέσεις = αλλαγή θέσης.
// lastWeight: το τελευταίο βάρος (φαίνεται ως υπόδειξη).
// form: οι ερωτήσεις του check-in (μόνο όταν το συμπληρώνει ο ίδιος ο αθλούμενος).
export default function CheckinForm({ athleteId, initial, onDone, onCancel, lastWeight = null, form = null }) {
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [weight, setWeight] = useState(initial?.weight != null ? String(initial.weight) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [answers, setAnswers] = useState(() => initial?.answers ?? {});
  const answer = (id, v) => setAnswers((a) => ({ ...a, [id]: a[id] === v ? undefined : v })); // ξανά κλικ = σβήσιμο
  // Για κάθε πλευρά: { id: αποθηκευμένη φωτογραφία, file: νέο αρχείο, preview: URL του νέου αρχείου }
  const [slots, setSlots] = useState(() =>
    Object.fromEntries(ANGLES.map((a) => [a.id, { id: initial?.photos?.[a.id] ?? null, file: null, preview: null }]))
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Καθαρισμός των προσωρινών URL όταν κλείνει η φόρμα
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  useEffect(() => () => Object.values(slotsRef.current).forEach((s) => s.preview && URL.revokeObjectURL(s.preview)), []);

  const setSlot = (angle, next) =>
    setSlots((prev) => {
      if (prev[angle].preview) URL.revokeObjectURL(prev[angle].preview);
      return { ...prev, [angle]: next };
    });

  const pick = (angle, file) => {
    if (!file) return;
    setSlot(angle, { id: null, file, preview: URL.createObjectURL(file) });
  };

  const clear = (angle) => setSlot(angle, { id: null, file: null, preview: null });

  // Πολλές φωτογραφίες μαζί: με τη σειρά λήψης. Αν είναι 3 (ή όλες οι θέσεις άδειες), γεμίζουν από την αρχή·
  // αλλιώς μπαίνουν στις άδειες θέσεις.
  const pickMany = (list) => {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name))
      .sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0));
    if (!files.length) return setError('Διάλεξε αρχεία εικόνας (JPG ή PNG).');
    setError('');
    const cur = slotsRef.current;
    const empty = ANGLES.filter((a) => !cur[a.id].id && !cur[a.id].file).map((a) => a.id);
    const targets = files.length >= ANGLES.length || empty.length === ANGLES.length ? ANGLES.map((a) => a.id) : empty;
    targets.slice(0, files.length).forEach((angle, i) => pick(angle, files[i]));
  };
  // Δύο θέσεις αλλάζουν μεταξύ τους (σύρσιμο φωτογραφίας πάνω σε άλλη θέση).
  const swap = (a, b) => { if (a !== b) setSlots((prev) => ({ ...prev, [a]: prev[b], [b]: prev[a] })); };

  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const dropProps = {
    onDragEnter: (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragOver: (e) => { if (hasFiles(e) || e.dataTransfer.types.includes('text/x-formlog-slot')) e.preventDefault(); },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragging(false); pickMany(e.dataTransfer.files); },
  };

  const guard = useGuard();
  const submit = async (e) => {
    e.preventDefault();
    const kg = weight.trim() ? parseDecimal(weight) : null;
    if (kg != null && !(kg > 20 && kg < 400)) return setError('Γράψε ένα έγκυρο βάρος σε κιλά.');
    const hasPhoto = Object.values(slots).some((s) => s.id || s.file);
    if (!hasPhoto && kg == null) return setError('Πρόσθεσε τουλάχιστον μία φωτογραφία ή το βάρος.');

    setBusy(true);
    setError('');
    try {
      // Πρώτα μικραίνουμε όλες τις νέες φωτογραφίες (ταυτόχρονα), ώστε αν μία αποτύχει να μη σωθεί τίποτα μισό.
      const shrunk = {};
      await Promise.all(ANGLES.filter((a) => slots[a.id].file).map(async (a) => {
        try {
          shrunk[a.id] = await processImage(slots[a.id].file);
        } catch {
          throw new Error(`Δεν διαβάστηκε η φωτογραφία «${a.label}». Δοκίμασε αρχείο JPG ή PNG.`);
        }
      }));

      // Ανέβασμα όλων μαζί (όχι μία-μία): πολύ πιο γρήγορα, ειδικά στο κινητό.
      const photos = {};
      const obsolete = [];
      await Promise.all(ANGLES.map(async (a) => {
        if (shrunk[a.id]) photos[a.id] = await addPhoto(shrunk[a.id], athleteId);
        else if (slots[a.id].id) photos[a.id] = slots[a.id].id;
      }));
      for (const a of ANGLES) {
        const old = initial?.photos?.[a.id] ?? null;
        if (old && photos[a.id] !== old) obsolete.push(old);
      }

      const checkin = {
        id: initial?.id ?? uuid(),
        athleteId,
        date: date || todayISO(),
        weight: kg,
        photos,
        note: note.trim(),
        answers: form ? cleanAnswers(form, answers) : (initial?.answers ?? {}),
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      };
      await putCheckin(checkin);

      // Το βάρος γράφεται στον πίνακα βάρους, στην ημέρα της καταγραφής.
      // Αν άλλαξε η ημερομηνία ή σβήστηκε το βάρος, φεύγει από την παλιά μέρα.
      if (initial?.weight != null && (initial.date !== checkin.date || kg == null)) {
        await deleteWeighInOn(athleteId, initial.date);
      }
      if (kg != null) await setWeighIn({ athleteId, date: checkin.date, weight: kg });

      await removePhotos(obsolete);
      onDone(checkin);
    } catch (err) {
      setError(err.message?.startsWith('Δεν') ? err.message : 'Η αποθήκευση απέτυχε. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.');
      setBusy(false);
    }
  };

  return (
    <form className={`panel checkin-form${dragging ? ' dropping' : ''}`} onSubmit={guard(submit)} {...dropProps}>
      {dragging && <div className="drop-hint" aria-hidden="true"><ImageIcon size={28} /> Άφησε τις φωτογραφίες εδώ</div>}
      <div className="panel-head">
        <h2>{initial ? 'Επεξεργασία καταγραφής' : 'Νέα καταγραφή'}</h2>
        <button type="button" className="x" onClick={onCancel} aria-label="Κλείσιμο"><CloseIcon size={18} /></button>
      </div>

      <div className="form-row">
        <div className="f">
          Ημερομηνία λήψης
          <DateField value={date} onChange={setDate} label="Ημερομηνία λήψης" />
        </div>
        <label className="f">
          Βάρος (kg)
          <input
            type="text" inputMode="decimal" placeholder={!initial && lastWeight ? `τελευταίο: ${fmtKg(lastWeight)}` : 'π.χ. 78,5'}
            value={weight} onChange={(e) => setWeight(e.target.value)}
          />
        </label>
      </div>
      {!initial && (
        <p className="hint">Για παλιές φωτογραφίες, βάλε την ημερομηνία που τραβήχτηκαν. Μπαίνουν αυτόματα στη σωστή θέση.</p>
      )}

      <div className="slots-bar">
        <label className="btn small slots-pick">
          <ImageIcon size={16} /> Διάλεξε φωτογραφίες
          <input type="file" accept="image/*" multiple onChange={(e) => { pickMany(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      <div className="slots">
        {ANGLES.map((a) => {
          const s = slots[a.id];
          const filled = s.preview || s.id;
          return (
            <div
              className="slot" key={a.id}
              draggable={!!filled} onDragStart={(e) => { e.dataTransfer.setData('text/x-formlog-slot', a.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-formlog-slot') || hasFiles(e)) e.preventDefault(); }}
              onDrop={(e) => {
                const from = e.dataTransfer.getData('text/x-formlog-slot');
                if (from) { e.preventDefault(); e.stopPropagation(); swap(from, a.id); return; }
                if (hasFiles(e) && e.dataTransfer.files.length === 1) { // μία φωτογραφία πάνω σε θέση: μπαίνει εκεί
                  e.preventDefault(); e.stopPropagation(); dragDepth.current = 0; setDragging(false); pick(a.id, e.dataTransfer.files[0]);
                }
              }}
            >
              {filled ? (
                <>
                  {s.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.preview} alt={a.label} title={s.file?.name} />
                  ) : (
                    <Photo id={s.id} alt={a.label} />
                  )}
                  <span className="slot-label">{a.label}</span>
                  {/* Πατώντας πάνω στη φωτογραφία, την αλλάζεις απευθείας με άλλη. */}
                  <label className="slot-replace" title={`Αλλαγή: ${a.label}`}>
                    <input
                      type="file" accept="image/*" aria-label={`Αλλαγή φωτογραφίας: ${a.label}`}
                      onChange={(e) => { pick(a.id, e.target.files[0]); e.target.value = ''; }}
                    />
                  </label>
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
          );
        })}
      </div>

      {form?.length > 0 && <Questions form={form} answers={answers} onAnswer={answer} />}

      <label className="f">
        Σημείωση (προαιρετικά)
        <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="π.χ. αρχή νέου προγράμματος" />
      </label>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>Ακύρωση</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
      </div>
    </form>
  );
}

// Το ερωτηματολόγιο: κλίμακα 1–10 (κουκκίδες), Ναι/Όχι, κείμενο. Όλα προαιρετικά.
function Questions({ form, answers, onAnswer }) {
  return (
    <fieldset className="questions">
      <legend>Πώς πήγε η εβδομάδα; <small>(προαιρετικά)</small></legend>
      {form.map((q) => {
        const labelId = `q-${q.id}`;
        return (
          <div className="question" key={q.id}>
            <span className="question-label" id={labelId}>{q.label}</span>
            {q.kind === 'scale' && (
              <div className="scale" role="group" aria-labelledby={labelId}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n} type="button" aria-pressed={answers[q.id] === n} aria-label={`${n} από 10`}
                    className={answers[q.id] >= n ? 'filled' : ''} onClick={() => onAnswer(q.id, n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {q.kind === 'yesno' && (
              <div className="seg yesno" role="group" aria-labelledby={labelId}>
                <button type="button" aria-pressed={answers[q.id] === true} onClick={() => onAnswer(q.id, true)}>Ναι</button>
                <button type="button" aria-pressed={answers[q.id] === false} onClick={() => onAnswer(q.id, false)}>Όχι</button>
              </div>
            )}
            {q.kind === 'text' && (
              <input
                aria-labelledby={labelId} maxLength={500} value={answers[q.id] ?? ''}
                onChange={(e) => onAnswer(q.id, e.target.value || undefined)}
              />
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
