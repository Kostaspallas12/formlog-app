'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtDate, todayISO } from '@/lib/utils';
import { useFloating } from './Floating';
import { BackIcon, DailyIcon } from './Icons';

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const DAYS = ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ']; // η εβδομάδα ξεκινά Δευτέρα
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const shift = (value, days) => {
  const d = new Date(value + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
};

// Πεδίο ημερομηνίας με δικό μας ημερολόγιο (ελληνικά, Δευτέρα πρώτη, χωρίς μελλοντικές ημερομηνίες).
// value/onChange: 'YYYY-MM-DD' · compact: για κελί πίνακα.
export default function DateField({ value, onChange, max = todayISO(), label = 'Ημερομηνία', compact = false }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value || max).slice(0, 7)); // 'YYYY-MM' που φαίνεται
  const [focus, setFocus] = useState(value || max); // η μέρα με το «πληκτρολόγιο»
  const btn = useRef(null);
  const pop = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const style = useFloating(open, btn, pop, close);

  // Ανοίγοντας, δείχνει τον μήνα της τιμής και εστιάζει στη μέρα της.
  useEffect(() => {
    if (!open) return;
    const v = value || max;
    setView(v.slice(0, 7));
    setFocus(v);
  }, [open, value, max]);
  useEffect(() => {
    if (open) pop.current?.querySelector(`[data-day="${focus}"]`)?.focus();
  }, [open, focus, view]);

  const pick = (d) => {
    if (d > max) return;
    onChange(d);
    setOpen(false);
    btn.current?.focus();
  };

  const [y, m] = view.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // κενά πριν την 1η (Δευτέρα = 0)
  const days = new Date(y, m, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(y, m - 1, i + 1))];
  const moveMonth = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    setView(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextDisabled = view >= max.slice(0, 7); // όχι μελλοντικοί μήνες

  // Βελάκια: μέρα/εβδομάδα · Enter: επιλογή
  const key = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      const n = shift(focus, step);
      if (n > max) return;
      setFocus(n);
      setView(n.slice(0, 7));
    }
  };

  return (
    <>
      <button
        ref={btn} type="button" className={`datefield${compact ? ' compact' : ''}`} aria-label={`${label}: ${value ? fmtDate(value) : 'καμία'}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}
      >
        <span>{value ? fmtDate(value, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Διάλεξε ημερομηνία'}</span>
        {!compact && <DailyIcon size={18} />}
      </button>
      {open && (
        <div className="calendar" ref={pop} style={style} role="dialog" aria-label={label} onKeyDown={key}>
          <div className="cal-head">
            <button type="button" className="icon-btn" onClick={() => moveMonth(-1)} aria-label="Προηγούμενος μήνας"><BackIcon size={18} /></button>
            <b>{MONTHS[m - 1]} {y}</b>
            <button type="button" className="icon-btn cal-next" onClick={() => moveMonth(1)} disabled={nextDisabled} aria-label="Επόμενος μήνας"><BackIcon size={18} /></button>
          </div>
          <div className="cal-grid">
            {DAYS.map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
            {cells.map((d, i) => (d ? (
              <button
                key={d} type="button" data-day={d} className="cal-day" disabled={d > max}
                aria-pressed={d === value} data-today={d === todayISO() || undefined}
                tabIndex={d === focus ? 0 : -1} onClick={() => pick(d)}
              >
                {Number(d.slice(8))}
              </button>
            ) : <span key={`e${i}`} />))}
          </div>
          <div className="cal-foot">
            <button type="button" className="btn small" onClick={() => pick(max < todayISO() ? max : todayISO())}>Σήμερα</button>
          </div>
        </div>
      )}
    </>
  );
}
