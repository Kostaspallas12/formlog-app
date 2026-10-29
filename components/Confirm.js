'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertIcon, EditIcon, QuestionIcon } from './Icons';

// Δικά μας παράθυρα στο στυλ του site, αντί για τα confirm()/prompt() του browser.
// Χρήση:  if (await confirmDialog('Κείμενο;')) { ... }   ή   confirmDialog({ text, danger, confirmLabel })
//         const name = await promptDialog({ text: 'Νέο όνομα', value: 'παλιό' });  // null = άκυρο
let opener = null;
const DANGER = /διαγρα|οριστικ|αφαίρεσ|αφαιρεσ|διακοπ|αποχώρησ|αποχωρησ|ακύρωσ|ακυρωσ|σβήσ|σβησ/i;

export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { text: opts } : (opts || {});
  const text = o.text || o.title || '';
  return new Promise((resolve) => {
    if (!opener) {
      resolve(typeof window !== 'undefined' ? window.confirm(text) : false);
      return;
    }
    opener({
      text,
      danger: o.danger != null ? o.danger : DANGER.test(text),
      confirmLabel: o.confirmLabel || 'Ναι',
      cancelLabel: o.cancelLabel || 'Άκυρο',
      resolve,
    });
  });
}

// Ζητά ένα κείμενο (π.χ. νέο όνομα). Επιστρέφει το κείμενο (κομμένο) ή null αν πατηθεί «Άκυρο».
export function promptDialog(opts = {}) {
  return new Promise((resolve) => {
    if (!opener) { resolve(null); return; }
    opener({
      text: opts.text || '',
      input: { value: opts.value ?? '', maxLength: opts.maxLength || 80, placeholder: opts.placeholder || '' },
      confirmLabel: opts.confirmLabel || 'Αποθήκευση',
      cancelLabel: opts.cancelLabel || 'Άκυρο',
      resolve: (v) => resolve(v === false ? null : String(v ?? '').trim() || null),
    });
  });
}

export default function ConfirmHost() {
  const [state, setState] = useState(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    opener = (s) => { setValue(s.input ? s.input.value : ''); setState(s); };
    return () => { opener = null; };
  }, []);

  const close = (ok) => {
    if (!state) return;
    state.resolve(state.input ? (ok ? value : false) : ok);
    setState(null);
  };
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter' && !state.input) close(true); // (στο πεδίο κειμένου το Enter το χειρίζεται η φόρμα)
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!state) return null;
  return createPortal(
    <div className="confirm" role="dialog" aria-modal="true" aria-label={state.text} onClick={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <form className="confirm-box" onSubmit={(e) => { e.preventDefault(); close(true); }}>
        <span className="confirm-icon" data-danger={state.danger || undefined}>
          {state.input ? <EditIcon size={26} /> : state.danger ? <AlertIcon size={26} /> : <QuestionIcon size={26} />}
        </span>
        <p className="confirm-text">{state.text}</p>
        {state.input && (
          <input
            className="confirm-input" value={value} maxLength={state.input.maxLength} placeholder={state.input.placeholder}
            onChange={(e) => setValue(e.target.value)} autoFocus onFocus={(e) => e.target.select()} aria-label={state.text}
          />
        )}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => close(false)}>{state.cancelLabel}</button>
          <button
            type="submit" className={state.danger ? 'btn danger-solid' : 'btn primary'}
            disabled={!!state.input && !value.trim()} autoFocus={!state.input}
          >
            {state.confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
