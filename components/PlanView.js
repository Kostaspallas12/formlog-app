import { DumbbellIcon, FoodIcon } from './Icons';

// Τα δύο είδη προγράμματος.
export const PLAN_KINDS = {
  training: { label: 'Προπόνηση', long: 'πρόγραμμα προπόνησης', Icon: DumbbellIcon },
  nutrition: { label: 'Διατροφή', long: 'πρόγραμμα διατροφής', Icon: FoodIcon },
};

// Τα πεδία διατροφής (μακροθρεπτικά) με τη μονάδα τους.
export const MACROS = [
  { id: 'kcal', label: 'Θερμίδες', unit: 'kcal' },
  { id: 'protein', label: 'Πρωτεΐνη', unit: 'g' },
  { id: 'carbs', label: 'Υδατάνθρακες', unit: 'g' },
  { id: 'fat', label: 'Λιπαρά', unit: 'g' },
];

// Η μορφή του περιεχομένου:
//   προπόνηση: { notes, days: [{ name, exercises: [{ name, sets, reps, rest, note }] }] }
//   διατροφή:  { notes, kcal, protein, carbs, fat, meals: [{ name, text }] }
const filled = (s) => String(s ?? '').trim() !== '';
const days = (c) => (c.days || []).filter((d) => d.exercises?.some((e) => filled(e.name)));
const meals = (c) => (c.meals || []).filter((m) => filled(m.text));
const macros = (c) => MACROS.filter((m) => filled(c[m.id]));

// Πρόγραμμα γραμμένο ως ελεύθερο κείμενο (επικόλληση από σημειώσεις) αντί για ημέρες/γεύματα.
export const isText = (c) => c?.mode === 'text';

// Μια γραμμή κειμένου που μοιάζει με επικεφαλίδα: «Ημέρα 1 – Πόδια», «Πρωινό:», «ΕΒΔΟΜΑΔΑ 2».
const HEADING = /^(ημέρα|ημερα|μέρα|μερα|day|εβδομάδα|εβδομαδα|week|γεύμα|γευμα|πρωινό|πρωινο|δεκατιανό|μεσημεριανό|μεσημεριανο|απογευματινό|βραδινό|βραδινο|σνακ|snack|upper|lower|push|pull|legs|πόδια|ποδια)(?=[\s\d:.,–—-]|$)/i; // (όχι \b: δεν «βλέπει» ελληνικά γράμματα)
export function textLines(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map((raw) => {
    const t = raw.trim();
    if (!t) return { kind: 'gap' };
    const letters = t.replace(/[^A-Za-zΑ-Ωα-ωΆ-Ώά-ώ]/g, '');
    const heading = t.length <= 60 && (HEADING.test(t) || /:$/.test(t) || (letters.length >= 3 && letters === letters.toUpperCase()));
    return { kind: heading ? 'h' : 'p', text: t.replace(/:$/, heading ? '' : ':') };
  });
}

// Έχει γραμμένο περιεχόμενο (όχι μόνο αρχεία);
export const hasWritten = (plan) => {
  const c = plan?.content || {};
  if (isText(c)) return filled(c.text);
  return filled(c.notes) || (plan?.kind === 'training' ? days(c).length > 0 : meals(c).length + macros(c).length > 0);
};

// Το κείμενο όπως το επικόλλησε ο προπονητής, με τις γραμμές του (και επικεφαλίδες όπου ταιριάζει).
function TextView({ text }) {
  return (
    <div className="plan-text">
      {textLines(text).map((l, i) => (l.kind === 'gap' ? <div key={i} className="plan-text-gap" /> : l.kind === 'h' ? <h4 key={i}>{l.text}</h4> : <p key={i}>{l.text}</p>))}
    </div>
  );
}

// Ένα πρόγραμμα όπως το βλέπει ο αθλούμενος (μόνο ανάγνωση).
export default function PlanView({ plan }) {
  const c = plan.content || {};
  return (
    <div className="plan-view">
      {filled(plan.title) && <h3 className="plan-title">{plan.title}</h3>}
      {isText(c) ? <TextView text={c.text} /> : plan.kind === 'training' ? <TrainingView c={c} /> : <NutritionView c={c} />}
      {!isText(c) && filled(c.notes) && (
        <div className="plan-notes">
          <b>Σημειώσεις</b>
          <p>{c.notes}</p>
        </div>
      )}
    </div>
  );
}

function TrainingView({ c }) {
  return days(c).map((d, i) => (
    <section className="plan-day" key={d.id || i}>
      <h4>{filled(d.name) ? d.name : `Ημέρα ${i + 1}`}</h4>
      <ol className="ex-list">
        {d.exercises.filter((e) => filled(e.name)).map((e, j) => (
          <li key={e.id || j}>
            <span className="ex-name">
              <b>{e.name}</b>
              {filled(e.note) && <small>{e.note}</small>}
            </span>
            <span className="ex-dose">
              {(filled(e.sets) || filled(e.reps)) && <b>{[e.sets, e.reps].filter(filled).join(' × ')}</b>}
              {filled(e.rest) && <small>διάλειμμα {e.rest}</small>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  ));
}

function NutritionView({ c }) {
  const m = macros(c);
  return (
    <>
      {m.length > 0 && (
        <div className="macro-stats">
          {m.map((x) => <div key={x.id}><b>{c[x.id]} <small>{x.unit}</small></b><span>{x.label}</span></div>)}
        </div>
      )}
      {meals(c).map((x, i) => (
        <section className="plan-meal" key={x.id || i}>
          <h4>{filled(x.name) ? x.name : `Γεύμα ${i + 1}`}</h4>
          <p>{x.text}</p>
        </section>
      ))}
    </>
  );
}
