'use client';

import { useCallback, useRef, useState } from 'react';
import { useFloating } from './Floating';
import { ChevronIcon } from './Icons';

// Λίστα επιλογής με την εμφάνιση του site (αντί για το <select> του browser).
// options: [{ value, label }] · placeholder: όταν δεν έχει επιλεγεί τίποτα.
export default function Select({ value, options, onChange, placeholder = 'Διάλεξε…', label }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const pop = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const style = useFloating(open, btn, pop, close);
  const current = options.find((o) => o.value === value);

  const pick = (v) => { onChange(v); setOpen(false); btn.current?.focus(); };
  // Βελάκια πάνω/κάτω ανάμεσα στις επιλογές
  const key = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...pop.current.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button
        ref={btn} type="button" className="selectfield" aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={current ? '' : 'placeholder'}>{current ? current.label : placeholder}</span>
        <ChevronIcon size={18} />
      </button>
      {open && (
        <div className="select-pop" ref={pop} style={style} role="listbox" aria-label={label} onKeyDown={key}>
          {options.map((o) => (
            <button
              key={o.value} type="button" role="option" aria-selected={o.value === value}
              autoFocus={o.value === value} onClick={() => pick(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
