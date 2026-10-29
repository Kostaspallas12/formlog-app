'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Αναδυόμενο μενού με εικονίδια (ίδια εμφάνιση με το μενού αθλούμενου στη λίστα).
// at: { x, y } σημείο οθόνης · align: 'right' = η δεξιά άκρη του μενού στο x
// items: [{ Icon, label, run, danger }] ή 'sep' (τα κενά αγνοούνται)
export default function PopMenu({ at, items, onClose, align = 'left', label = 'Μενού' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y, visibility: 'hidden' });

  // Θέση: ολόκληρο μέσα στην οθόνη (κάτω/πάνω, δεξιά/αριστερά).
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect();
    const x = align === 'right' ? at.x - r.width : at.x;
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = at.y + r.height + 8 > window.innerHeight ? Math.max(8, at.y - r.height) : at.y;
    setPos({ left, top, visibility: 'visible' });
  }, [at, align]);

  // Κλείνει με κλικ έξω, Esc ή αλλαγή μεγέθους.
  useEffect(() => {
    const out = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', out);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="row-menu" ref={ref} style={pos} role="menu" aria-label={label} onContextMenu={(e) => e.preventDefault()}>
      {items.filter(Boolean).map((it, i) => (it === 'sep' ? <hr key={`s${i}`} /> : (
        <button
          key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''}
          onClick={() => { onClose(); it.run(); }}
        >
          <it.Icon size={20} /> <span>{it.label}</span>
        </button>
      )))}
    </div>,
    document.body,
  );
}
