'use client';

import { useEffect, useRef, useState } from 'react';
import { useGuard } from '@/lib/useGuard';
import { confirmDialog } from '@/components/Confirm';
import { deleteWeighIn, setWeighIn, updateWeighIn } from '@/lib/storage';
import { fmtDate, fmtDelta, fmtKg, parseDecimal, todayISO } from '@/lib/utils';
import EmptyState from './EmptyState';
import DateField from './DateField';
import { CloseIcon, PlusIcon, WeightIcon } from './Icons';

// Πίνακας βάρους σαν υπολογιστικό φύλλο: γρήγορη προσθήκη πάνω, και κάθε κελί αλλάζει με κλικ.
// Enter ή κλικ έξω = αποθήκευση, Esc = ακύρωση.

const parseKg = (s) => {
  const v = parseDecimal(s);
  return v > 20 && v < 400 ? Math.round(v * 10) / 10 : null;
};

export default function WeightLog({ athleteId, entries, onChange }) {
  const [date, setDate] = useState(todayISO());
  const [kg, setKg] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'error' | 'ok', text }
  const kgRef = useRef(null);

  const flash = (type, text) => {
    setMsg({ type, text });
    if (type === 'ok') setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 2500);
  };

  const guard = useGuard();
  const add = async (e) => {
    e.preventDefault();
    const weight = parseKg(kg);
    if (weight == null) return flash('error', 'Γράψε ένα έγκυρο βάρος σε κιλά, π.χ. 78,5.');
    const existing = entries.find((x) => x.date === date);
    if (existing && !(await confirmDialog(`Υπάρχει ήδη βάρος για ${fmtDate(date)} (${fmtKg(existing.weight)} kg). Να αντικατασταθεί;`))) return;
    setBusy(true);
    try {
      await setWeighIn({ athleteId, date, weight, note: note.trim() });
      await onChange();
      setKg('');
      setNote('');
      flash('ok', `Αποθηκεύτηκε: ${fmtDate(date)} · ${fmtKg(weight)} kg`);
      kgRef.current?.focus();
    } catch {
      flash('error', 'Η αποθήκευση απέτυχε. Έλεγξε τη σύνδεσή σου.');
    }
    setBusy(false);
  };

  // Νεότερο πρώτα, με τη διαφορά από την προηγούμενη μέτρηση.
  const rows = entries.map((w, i) => ({ w, delta: i > 0 ? w.weight - entries[i - 1].weight : null })).reverse();

  return (
    <div className="weightlog">
      <form className="wl-add" onSubmit={guard(add)}>
        <div className="field">
          <span>Ημερομηνία</span>
          <DateField value={date} onChange={setDate} />
        </div>
        <label>
          <span>Βάρος (kg)</span>
          <input
            ref={kgRef} type="text" inputMode="decimal" placeholder="π.χ. 78,5" autoComplete="off"
            value={kg} onChange={(e) => setKg(e.target.value)}
          />
        </label>
        <label className="wl-add-note">
          <span>Σημείωση</span>
          <input value={note} maxLength={300} placeholder="προαιρετικά" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn primary wl-add-btn" type="submit" disabled={busy}><PlusIcon size={18} /> Προσθήκη</button>
      </form>

      {msg && <p className={msg.type === 'error' ? 'error' : 'wl-ok'} role={msg.type === 'error' ? 'alert' : 'status'}>{msg.text}</p>}

      {rows.length === 0 ? (
        <EmptyState icon={WeightIcon} title="Καμία μέτρηση βάρους ακόμα" />
      ) : (
        <div className="table-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th>Ημερομηνία</th>
                <th className="num">Βάρος (kg)</th>
                <th className="num">Αλλαγή</th>
                <th>Σημείωση</th>
                <th aria-label="Ενέργειες" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, delta }) => (
                <Row key={w.id} entry={w} delta={delta} onChange={onChange} flash={flash} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ entry, delta, onChange, flash }) {
  const [date, setDate] = useState(entry.date);
  const [kg, setKg] = useState(fmtKg(entry.weight));
  const [note, setNote] = useState(entry.note);
  const [saving, setSaving] = useState(false);

  // Όταν αλλάξει η γραμμή από αλλού (π.χ. από καταγραφή με φωτογραφίες), ενημερώνουμε τα κελιά.
  useEffect(() => {
    setDate(entry.date);
    setKg(fmtKg(entry.weight));
    setNote(entry.note);
  }, [entry.date, entry.weight, entry.note]);

  const save = async (patch, revert) => {
    setSaving(true);
    try {
      await updateWeighIn(entry.id, patch);
      await onChange();
    } catch (e) {
      revert();
      flash('error', e?.code === '23505'
        ? 'Υπάρχει ήδη βάρος για αυτή την ημερομηνία.'
        : 'Η αποθήκευση απέτυχε. Έλεγξε τη σύνδεσή σου.');
    }
    setSaving(false);
  };

  const saveKg = () => {
    const v = parseKg(kg);
    if (v == null) {
      setKg(fmtKg(entry.weight));
      return flash('error', 'Μη έγκυρο βάρος. Κράτησα την προηγούμενη τιμή.');
    }
    if (v !== entry.weight) save({ weight: v }, () => setKg(fmtKg(entry.weight)));
    else setKg(fmtKg(v));
  };

  const saveNote = () => {
    if (note.trim() !== entry.note) save({ note: note.trim() }, () => setNote(entry.note));
  };

  // Enter = αποθήκευση (βγαίνει από το κελί), Esc = επαναφορά.
  const keys = (reset) => (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      reset();
      setTimeout(() => e.target.blur(), 0);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog(`Διαγραφή του βάρους της ${fmtDate(entry.date)};`))) return;
    try {
      await deleteWeighIn(entry.id);
      await onChange();
    } catch {
      flash('error', 'Η διαγραφή απέτυχε.');
    }
  };

  return (
    <tr className={saving ? 'saving' : ''}>
      <td>
        <DateField
          compact value={date} label="Ημερομηνία"
          onChange={(d) => { setDate(d); if (d !== entry.date) save({ date: d }, () => setDate(entry.date)); }}
        />
      </td>
      <td className="num">
        <input
          className="cell num" type="text" inputMode="decimal" value={kg} aria-label={`Βάρος ${fmtDate(entry.date)}`}
          onChange={(e) => setKg(e.target.value)} onBlur={saveKg} onFocus={(e) => e.target.select()}
          onKeyDown={keys(() => setKg(fmtKg(entry.weight)))}
        />
      </td>
      <td className={`num ${delta == null ? 'meta' : delta < 0 ? 'down' : delta > 0 ? 'up' : ''}`}>
        {delta == null ? 'Πρώτη' : fmtDelta(delta)}
      </td>
      <td>
        <input
          className="cell" value={note} maxLength={300} placeholder="Σημείωση" aria-label={`Σημείωση ${fmtDate(entry.date)}`}
          onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
          onKeyDown={keys(() => setNote(entry.note))}
        />
      </td>
      <td className="actions">
        <button className="x" onClick={remove} aria-label={`Διαγραφή ${fmtDate(entry.date)}`}><CloseIcon size={18} /></button>
      </td>
    </tr>
  );
}
