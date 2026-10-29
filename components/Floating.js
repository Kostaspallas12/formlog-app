'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

// Θέση για ένα αναδυόμενο (ημερολόγιο, λίστα) κάτω από το κουμπί του — ή πάνω, αν δεν χωράει —
// πάντα ολόκληρο μέσα στην οθόνη. Κλείνει με κλικ έξω, Esc, κύλιση ή αλλαγή μεγέθους.
export function useFloating(open, anchor, pop, onClose) {
  const [style, setStyle] = useState({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchor.current || !pop.current) return;
    const a = anchor.current.getBoundingClientRect();
    const w = pop.current.offsetWidth;
    const h = pop.current.offsetHeight;
    const below = a.bottom + 6 + h <= window.innerHeight - 8;
    setStyle({
      left: Math.max(8, Math.min(a.left, window.innerWidth - w - 8)),
      top: below ? a.bottom + 6 : Math.max(8, a.top - h - 6),
      minWidth: a.width,
    });
  }, [open, anchor, pop]);

  useEffect(() => {
    if (!open) { setStyle({ visibility: 'hidden' }); return; }
    const out = (e) => {
      if (!pop.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose();
    };
    const esc = (e) => { if (e.key === 'Escape') { onClose(); anchor.current?.focus(); } };
    const close = () => onClose();
    // Κύλιση έξω από το αναδυόμενο το κλείνει (αλλιώς θα έμενε «ξεκρέμαστο»).
    const scroll = (e) => { if (!pop.current?.contains(e.target)) onClose(); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', out);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open, anchor, pop, onClose]);

  return style;
}
