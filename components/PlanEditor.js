'use client';

import { useMemo, useState } from 'react';
import { useGuard } from '@/lib/useGuard';
import { uuid } from '@/lib/storage';
import { MACROS, isText } from './PlanView';
import { PlusIcon, TrashIcon } from './Icons';

const blankExercise = () => ({ id: uuid(), name: '', sets: '', reps: '', rest: '', note: '' });
const blankDay = (n) => ({ id: uuid(), name: `Ημέρα ${n}`, exercises: [blankExercise()] });
const blankMeal = (name = '') => ({ id: uuid(), name, text: '' });

// Το περιεχόμενο ενός καινούριου προγράμματος (ημέρες/γεύματα — το κείμενο είναι στο text).
export const emptyContent = (kind) => (kind === 'training'
  ? { notes: '', days: [blankDay(1)] }
  : { notes: '', kcal: '', protein: '', carbs: '', fat: '', meals: ['Πρωινό', 'Μεσημεριανό', 'Βραδινό'].map(blankMeal) });

// Κάθε γραμμή χρειάζεται σταθερό id για τη λίστα (και τα παλιά δεδομένα να μη σπάνε).
const withIds = (kind, c) => (kind === 'training'
  ? { ...c, days: (c.days || []).map((d) => ({ ...d, id: d.id || uuid(), exercises: (d.exercises || []).map((e) => ({ ...e, id: e.id || uuid() })) })) }
  : { ...c, meals: (c.meals || []).map((m) => ({ ...m, id: m.id || uuid() })) });

// Χωρίς τις κενές ασκήσεις/γεύματα, πριν την αποθήκευση. (Κείμενο: μόνο το κείμενο.)
const cleaned = (kind, c) => (c.mode === 'text'
  ? { mode: 'text', text: (c.text || '').replace(/\s+$/, '') }
  : kind === 'training'
  ? { ...c, days: c.days.map((d) => ({ ...d, exercises: d.exercises.filter((e) => e.name.trim()) })) }
  : { ...c, meals: c.meals.filter((m) => m.name.trim() || m.text.trim()) });

// Επεξεργασία προγράμματος (τίτλος + προπόνηση ή διατροφή). Το κουμπί «Αποθήκευση» ανάβει μόνο όταν κάτι άλλαξε.
export default function PlanEditor({ kind, initial, busy, onSave, onCancel, saveLabel = 'Αποθήκευση' }) {
  // Πρόγραμμα που έχει μόνο αρχεία: ξεκινά με κενή φόρμα.
  const hasContent = initial && Object.keys(initial.content || {}).length > 0;
  // Νέο πρόγραμμα: ξεκινά ως κείμενο (επικόλληση από σημειώσεις) · υπάρχον: όπως ήταν γραμμένο.
  const start = useMemo(() => {
    const c = hasContent ? initial.content : null;
    const content = c && isText(c)
      ? { ...emptyContent(kind), ...c }
      : { ...withIds(kind, c || emptyContent(kind)), mode: c ? 'structured' : 'text', text: '' };
    return { title: initial?.title ?? '', content: withIds(kind, content) };
  }, [kind, initial, hasContent]);
  const [title, setTitle] = useState(start.title);
  const [content, setContent] = useState(start.content);
  const [error, setError] = useState('');
  const dirty = title !== start.title || JSON.stringify(content) !== JSON.stringify(start.content);
  const textMode = content.mode === 'text';
  const set = (patch) => setContent((c) => ({ ...c, ...patch }));

  const guard = useGuard();
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onSave({ title, content: cleaned(kind, content) });
    } catch {
      setError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.');
    }
  };

  return (
    <form className="plan-editor" onSubmit={guard(submit)}>
      <label className="f">
        Τίτλος
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
          placeholder={kind === 'training' ? 'π.χ. Πρόγραμμα 4 ημερών · Upper / Lower' : 'π.χ. Απώλεια λίπους · 2.000 kcal'}
        />
      </label>

      <div className="seg plan-mode" role="group" aria-label="Πώς γράφεται">
        <button type="button" aria-pressed={textMode} onClick={() => set({ mode: 'text' })}>Κείμενο</button>
        <button type="button" aria-pressed={!textMode} onClick={() => set({ mode: 'structured' })}>Φόρμα</button>
      </div>

      {textMode ? (
        <label className="f">
          <span className="sr-only">Πρόγραμμα</span>
          <textarea
            className="plan-paste" rows={16} value={content.text || ''} maxLength={20000} autoFocus={!content.text}
            onChange={(e) => set({ text: e.target.value })} aria-label="Πρόγραμμα"
            placeholder={kind === 'training'
              ? 'Επικόλλησε εδώ το πρόγραμμα, όπως το έχεις στις σημειώσεις σου. π.χ.\n\nΗμέρα 1 – Πόδια\nLeg extension 3 x 12\nLeg press 4 x 10\n\nΗμέρα 2 – Πάνω σώμα\nΠιέσεις στήθους 4 x 8'
              : 'Επικόλλησε εδώ τη διατροφή, όπως την έχεις στις σημειώσεις σου. π.χ.\n\nΠρωινό:\nΒρώμη 80 g με γάλα, 1 μπανάνα\n\nΜεσημεριανό:\nΚοτόπουλο 200 g, ρύζι 150 g'}
          />
        </label>
      ) : (
        <>
          {kind === 'training'
            ? <TrainingEditor days={content.days} onChange={(days) => set({ days })} />
            : <NutritionEditor c={content} set={set} />}
          <label className="f">
            Σημειώσεις
            <textarea rows={3} value={content.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={4000}
              placeholder={kind === 'training' ? 'π.χ. Ζέσταμα 10 λεπτά πριν από κάθε προπόνηση' : 'π.χ. 2,5 λίτρα νερό την ημέρα'} />
          </label>
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end plan-actions">
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Ακύρωση</button>}
        <button type="submit" className="btn primary" disabled={busy || !dirty}>{busy ? 'Αποθήκευση...' : saveLabel}</button>
      </div>
    </form>
  );
}

/* ---------- Προπόνηση: ημέρες με ασκήσεις ---------- */

function TrainingEditor({ days, onChange }) {
  const setDay = (i, patch) => onChange(days.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const setEx = (i, j, patch) => setDay(i, { exercises: days[i].exercises.map((e, k) => (k === j ? { ...e, ...patch } : e)) });

  return (
    <div className="plan-days">
      {days.map((d, i) => (
        <section className="plan-day edit" key={d.id}>
          <div className="plan-day-head">
            <input className="plan-day-name" value={d.name} onChange={(e) => setDay(i, { name: e.target.value })} maxLength={80}
              placeholder={`Ημέρα ${i + 1}`} aria-label="Όνομα ημέρας" />
            {days.length > 1 && (
              <button type="button" className="icon-btn" aria-label="Αφαίρεση ημέρας" title="Αφαίρεση ημέρας"
                onClick={() => onChange(days.filter((_, k) => k !== i))}><TrashIcon size={18} /></button>
            )}
          </div>
          <div className="ex-grid" role="table" aria-label={d.name || `Ημέρα ${i + 1}`}>
            <div className="ex-row ex-labels" role="row">
              <span>Άσκηση</span><span>Σετ</span><span>Επαναλήψεις</span><span>Διάλειμμα</span><span>Σημείωση</span><span />
            </div>
            {d.exercises.map((e, j) => (
              <div className="ex-row" role="row" key={e.id}>
                <input className="ex-name" value={e.name} onChange={(ev) => setEx(i, j, { name: ev.target.value })} maxLength={80} placeholder="π.χ. Πιέσεις πάγκου" aria-label="Άσκηση" />
                {/* Στη στενή οθόνη δεν υπάρχει η γραμμή με τους τίτλους: κάθε κουτί δείχνει τον δικό του. */}
                <label className="ex-cell"><small>Σετ</small>
                  <input value={e.sets} onChange={(ev) => setEx(i, j, { sets: ev.target.value })} maxLength={10} placeholder="4" aria-label="Σετ" inputMode="numeric" />
                </label>
                <label className="ex-cell"><small>Επαναλήψεις</small>
                  <input value={e.reps} onChange={(ev) => setEx(i, j, { reps: ev.target.value })} maxLength={20} placeholder="8-10" aria-label="Επαναλήψεις" />
                </label>
                <label className="ex-cell"><small>Διάλειμμα</small>
                  <input value={e.rest} onChange={(ev) => setEx(i, j, { rest: ev.target.value })} maxLength={20} placeholder="90''" aria-label="Διάλειμμα" />
                </label>
                <input className="ex-note" value={e.note} onChange={(ev) => setEx(i, j, { note: ev.target.value })} maxLength={200} placeholder="προαιρετικά" aria-label="Σημείωση" />
                <button type="button" className="icon-btn" aria-label="Αφαίρεση άσκησης" title="Αφαίρεση άσκησης"
                  onClick={() => setDay(i, { exercises: d.exercises.length > 1 ? d.exercises.filter((_, k) => k !== j) : [blankExercise()] })}>
                  <TrashIcon size={17} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn small" onClick={() => setDay(i, { exercises: [...d.exercises, blankExercise()] })}>
            <PlusIcon size={16} /> Άσκηση
          </button>
        </section>
      ))}
      <button type="button" className="btn add-day" onClick={() => onChange([...days, blankDay(days.length + 1)])}>
        <PlusIcon size={18} /> Νέα ημέρα
      </button>
    </div>
  );
}

/* ---------- Διατροφή: στόχοι ημέρας + γεύματα ---------- */

function NutritionEditor({ c, set }) {
  const setMeal = (i, patch) => set({ meals: c.meals.map((m, k) => (k === i ? { ...m, ...patch } : m)) });
  return (
    <>
      <div className="macro-fields">
        {MACROS.map((m) => (
          <label className="f" key={m.id}>
            {m.label}
            <span className="unit-input">
              <input value={c[m.id] ?? ''} onChange={(e) => set({ [m.id]: e.target.value })} maxLength={10} inputMode="decimal"
                placeholder={{ kcal: '2000', protein: '150', carbs: '200', fat: '60' }[m.id]} />
              <small>{m.unit}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="plan-meals">
        {c.meals.map((m, i) => (
          <section className="plan-meal edit" key={m.id}>
            <div className="plan-day-head">
              <input className="plan-day-name" value={m.name} onChange={(e) => setMeal(i, { name: e.target.value })} maxLength={60}
                placeholder={`Γεύμα ${i + 1}`} aria-label="Όνομα γεύματος" />
              <button type="button" className="icon-btn" aria-label="Αφαίρεση γεύματος" title="Αφαίρεση γεύματος"
                onClick={() => set({ meals: c.meals.filter((_, k) => k !== i) })}><TrashIcon size={18} /></button>
            </div>
            <textarea rows={3} value={m.text} onChange={(e) => setMeal(i, { text: e.target.value })} maxLength={2000}
              placeholder="π.χ. 3 αυγά, 2 φέτες ψωμί ολικής, 1 φρούτο" aria-label={`Τι περιλαμβάνει: ${m.name || `Γεύμα ${i + 1}`}`} />
          </section>
        ))}
        <button type="button" className="btn add-day" onClick={() => set({ meals: [...c.meals, blankMeal(`Γεύμα ${c.meals.length + 1}`)] })}>
          <PlusIcon size={18} /> Νέο γεύμα
        </button>
      </div>
    </>
  );
}
