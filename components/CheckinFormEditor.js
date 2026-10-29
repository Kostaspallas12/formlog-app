'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { setCheckinForm } from '@/lib/storage';
import { DEFAULT_FORM, KINDS, MAX_QUESTIONS, formOf, newQuestionId } from '@/lib/checkinForm';
import { TrashIcon } from './Icons';

// Οι ερωτήσεις του check-in (ο προπονητής, ή ο ίδιος αν δεν έχει προπονητή):
// οι έτοιμες ανοίγουν/κλείνουν, όλες μετονομάζονται, και προστίθενται δικές του.
export default function CheckinFormEditor({ athlete, onClose, onSaved }) {
  const current = formOf(athlete);
  // Όλες οι ερωτήσεις: πρώτα όσες ισχύουν (με τη σειρά τους), μετά οι έτοιμες που είναι κλειστές.
  const [rows, setRows] = useState(() => [
    ...current.map((q) => ({ ...q, on: true })),
    ...DEFAULT_FORM.filter((d) => !current.some((q) => q.id === d.id)).map((q) => ({ ...q, on: false })),
  ]);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('scale');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const isDefault = (id) => DEFAULT_FORM.some((d) => d.id === id);
  const update = (id, patch) => setRows((r) => r.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const active = rows.filter((q) => q.on).length;

  const add = () => {
    const text = label.trim();
    if (!text) return;
    if (active >= MAX_QUESTIONS) return setError(`Έως ${MAX_QUESTIONS} ερωτήσεις.`);
    setRows((r) => [...r, { id: newQuestionId(), label: text.slice(0, 80), kind, better: kind === 'scale' ? 'up' : null, on: true }]);
    setLabel('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (rows.some((q) => q.on && !q.label.trim())) return setError('Κάθε ερώτηση χρειάζεται κείμενο.');
    if (active > MAX_QUESTIONS) return setError(`Έως ${MAX_QUESTIONS} ερωτήσεις.`);
    const form = rows.filter((q) => q.on).map(({ on, ...q }) => ({ ...q, label: q.label.trim().slice(0, 80) })); // eslint-disable-line no-unused-vars
    setBusy(true);
    try {
      await setCheckinForm(athlete.id, form);
      onSaved(form);
    } catch {
      setError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="confirm" role="dialog" aria-modal="true" aria-label="Ερωτήσεις check-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="confirm-box cf-editor" onSubmit={submit}>
        <h2>Ερωτήσεις check-in</h2>
        <div className="cf-list">
          {rows.map((q) => (
            <div key={q.id} className={`cf-row${q.on ? '' : ' off'}`}>
              <input
                value={q.label} maxLength={80} onChange={(e) => update(q.id, { label: e.target.value })}
                aria-label="Κείμενο ερώτησης" disabled={!q.on}
              />
              <span className="cf-kind">{KINDS.find((k) => k.id === q.kind)?.label}</span>
              {isDefault(q.id) ? (
                <button
                  type="button" role="switch" aria-checked={q.on} className="switch" aria-label={q.label}
                  onClick={() => update(q.id, { on: !q.on })}
                />
              ) : (
                <button type="button" className="icon-btn" aria-label={`Διαγραφή: ${q.label}`} onClick={() => setRows((r) => r.filter((x) => x.id !== q.id))}>
                  <TrashIcon size={20} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="cf-add">
          <input
            value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Νέα ερώτηση, π.χ. Πόσα γεύματα έφαγες έξω;"
            aria-label="Νέα ερώτηση" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <div className="seg" role="group" aria-label="Είδος απάντησης">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>
            ))}
          </div>
          <button type="button" className="btn small" onClick={add} disabled={!label.trim()}>Προσθήκη</button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onClose}>Ακύρωση</button>
          <button type="submit" className="btn primary" disabled={busy}>Αποθήκευση</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
