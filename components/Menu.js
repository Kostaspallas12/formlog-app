'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreIcon } from './Icons';

// Μενού «⋮»: οι λιγότερο συχνές ενέργειες, ώστε να μη γεμίζει η οθόνη κουμπιά.
// items: [{ label, onClick, danger }] (τα κενά αγνοούνται)
export default function Menu({ items, label = 'Περισσότερα' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const shown = items.filter(Boolean);
  if (!shown.length) return null;

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {shown.map((it) => (
            <button
              key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
