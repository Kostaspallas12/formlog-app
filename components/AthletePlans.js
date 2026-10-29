'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmDialog } from '@/components/Confirm';
import {
  deleteAthletePlan, getAthletePlans, PLAN_FILE_TYPES, removePlanFiles, saveAthletePlan, uploadPlanFile,
} from '@/lib/storage';
import { fmtDate } from '@/lib/utils';
import PlanView, { hasWritten, PLAN_KINDS } from './PlanView';
import PlanEditor from './PlanEditor';
import EmptyState from './EmptyState';
import Menu from './Menu';
import PlanFiles from './PlanFiles';
import { DownloadIcon, PlanIcon, UploadIcon } from './Icons';
import { useSignal } from './Live';

const MAX_FILES = 10;
const ACCEPT = Object.keys(PLAN_FILE_TYPES).map((x) => `.${x}`).join(',');
// Αρχεία που ανοίγουν στον browser (τα υπόλοιπα κατεβαίνουν).


// Η καρτέλα «Πρόγραμμα» ενός αθλούμενου: προπόνηση / διατροφή, μόνο δικά του.
// coach: ο προπονητής γράφει το πρόγραμμα ή ανεβάζει αρχεία από τον υπολογιστή · αλλιώς μόνο ανάγνωση.
// names: { athlete, coach } για την κεφαλίδα του PDF.
export default function AthletePlans({ athleteId, coach = false, names = {} }) {
  const [plans, setPlans] = useState(null); // { training, nutrition }
  const [kind, setKind] = useState('training');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    try {
      const p = await getAthletePlans(athleteId);
      setPlans(p);
      setLoadError(false);
      return p;
    } catch {
      setLoadError(true);
    }
  }, [athleteId]);
  useEffect(() => {
    // Αν υπάρχει μόνο διατροφή, ανοίγει σε αυτή.
    load().then((p) => { if (p && !p.training && p.nutrition) setKind('nutrition'); });
  }, [load]);
  // Ζωντανά: οι αλλαγές προγράμματος εμφανίζονται χωρίς ανανέωση (όχι ενώ ο coach γράφει τώρα).
  const editingRef = useRef(false);
  editingRef.current = editing;
  useSignal('plan', athleteId, () => { if (!editingRef.current) load(); });

  if (loadError && !plans) return <EmptyState title="Δεν φόρτωσε το πρόγραμμα" text="Έλεγξε τη σύνδεσή σου και ανανέωσε τη σελίδα." />;
  if (!plans) return <div className="panel"><span className="sk" style={{ display: 'block', width: '40%', height: 18 }} /><span className="sk" style={{ display: 'block', width: '70%', height: 14, marginTop: 14 }} /></div>;

  const current = plans[kind];
  const files = current?.files ?? [];
  const written = hasWritten(current);
  const k = PLAN_KINDS[kind];
  const setOne = (p) => setPlans((all) => ({ ...all, [kind]: p }));

  const save = async ({ title, content }) => {
    setBusy(true);
    try {
      setOne(await saveAthletePlan(athleteId, kind, { title, content, files }));
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (list) => {
    const picked = [...list];
    if (!picked.length) return;
    setError('');
    if (files.length + picked.length > MAX_FILES) return setError(`Έως ${MAX_FILES} αρχεία ανά πρόγραμμα.`);
    setBusy(true);
    const added = [];
    try {
      for (const f of picked) added.push(await uploadPlanFile(athleteId, f));
      setOne(await saveAthletePlan(athleteId, kind, { title: current?.title, content: current?.content, files: [...files, ...added] }));
    } catch (e) {
      await removePlanFiles(added.map((f) => f.path)).catch(() => {});
      setError(e.message === 'type' ? 'Επιτρέπονται PDF, έγγραφα, πίνακες, κείμενο και φωτογραφίες.'
        : e.message === 'size' ? 'Κάθε αρχείο μπορεί να είναι έως 10 MB.'
          : 'Το αρχείο δεν ανέβηκε. Δοκίμασε ξανά.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeFile = async (f) => {
    if (!(await confirmDialog(`Αφαίρεση του «${f.name}»;`))) return;
    setBusy(true);
    try {
      const rest = files.filter((x) => x.path !== f.path);
      if (!rest.length && !written) {
        await deleteAthletePlan(athleteId, kind, [f]);
        setOne(null);
      } else {
        setOne(await saveAthletePlan(athleteId, kind, { title: current.title, content: current.content, files: rest }));
        await removePlanFiles([f.path]).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    if (!(await confirmDialog(`Διαγραφή όλου του ${k.long}; Θα σβηστούν και τα αρχεία του.`))) return;
    setBusy(true);
    try {
      await deleteAthletePlan(athleteId, kind, files);
      setOne(null);
    } finally {
      setBusy(false);
    }
  };

  // Το γραμμένο πρόγραμμα ως PDF (για να το έχει στο κινητό του).
  const pdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      const { downloadPlanPdf } = await import('@/lib/planPdf');
      await downloadPlanPdf(current, names);
    } catch {
      setError('Δεν δημιουργήθηκε το PDF. Δοκίμασε ξανά.');
    } finally {
      setPdfBusy(false);
    }
  };
  const pdfBtn = written && (
    <button type="button" className="btn" disabled={pdfBusy} onClick={pdf}>
      <DownloadIcon size={18} /><span className="long">{pdfBusy ? 'Ετοιμάζεται…' : 'Λήψη PDF'}</span><span className="short">{pdfBusy ? 'Ετοιμάζεται…' : 'Λήψη PDF'}</span>
    </button>
  );

  const uploadBtn = coach && (
    <>
      <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
      <button type="button" className="btn" disabled={busy || files.length >= MAX_FILES} onClick={() => fileInput.current?.click()}>
        <UploadIcon size={18} /><span className="long">Ανέβασμα αρχείου</span><span className="short">Αρχείο</span>
      </button>
    </>
  );

  return (
    <div className="athlete-plans">
      <div className="plan-bar">
        <div className="seg plan-kinds" role="group" aria-label="Είδος προγράμματος">
          {Object.entries(PLAN_KINDS).map(([id, x]) => (
            <button key={id} type="button" aria-pressed={kind === id} disabled={editing} onClick={() => { setKind(id); setError(''); }}>
              <x.Icon size={18} /> {x.label}
            </button>
          ))}
        </div>
        {coach && current && !editing && (
          <div className="row plan-tools">
            <button type="button" className="btn" onClick={() => setEditing(true)}>{written ? 'Επεξεργασία' : 'Γράψε πρόγραμμα'}</button>
            {uploadBtn}
            {pdfBtn}
            <Menu items={[{ label: 'Διαγραφή προγράμματος', danger: true, onClick: removeAll }]} />
          </div>
        )}
        {!coach && pdfBtn && !editing && <div className="row plan-tools">{pdfBtn}</div>}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {editing ? (
        <PlanEditor key={kind} kind={kind} initial={current} busy={busy} onSave={save} onCancel={() => setEditing(false)} />
      ) : !current ? (
        <EmptyState icon={coach ? k.Icon : PlanIcon} title={coach ? `Δεν έχει ${k.long} ακόμα` : `Δεν έχεις ${k.long} ακόμα`}>
          {coach && (
            <div className="row">
              <button type="button" className="btn primary" onClick={() => setEditing(true)}>Γράψε πρόγραμμα</button>
              {uploadBtn}
            </div>
          )}
        </EmptyState>
      ) : (
        <>
          {written && <div className="panel"><PlanView plan={current} /></div>}
          {!written && current.title && <h3 className="plan-title">{current.title}</h3>}
          {files.length > 0 && <PlanFiles files={files} coach={coach} busy={busy} onRemove={removeFile} setError={setError} />}
          <p className="meta plan-updated">Ενημερώθηκε {fmtDate(current.updatedAt.slice(0, 10))}</p>
        </>
      )}
    </div>
  );
}
