'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { saveDailyFields, setAthleteJournal } from '@/lib/storage';
import { todayISO } from '@/lib/utils';
import { BackIcon, DownloadIcon, MoonIcon, SlidersIcon } from './Icons';

// Ημερολόγιο: όλη η μέρα σε μία γραμμή — ύπνος (ώρες + ποιότητα), νερό, θερμίδες, βήματα, προπόνηση.
// Υπολογιστής: πίνακας εβδομάδας που γράφεται κατευθείαν (σαν υπολογιστικό φύλλο) με μέσους όρους.
// Κινητό: λωρίδα ημερών + κάρτα της ημέρας.
// Τα πεδία και οι στόχοι ορίζονται ανά αθλούμενο (athlete.journal).

export const JOURNAL_FIELDS = [
  { id: 'sleep', label: 'Ύπνος' },
  { id: 'sleepQuality', label: 'Ποιότητα ύπνου', short: 'Ποιότητα' },
  { id: 'water', label: 'Νερό', unit: 'L', type: 'dec', max: 15, step: 0.25, placeholder: '2,5' },
  { id: 'calories', label: 'Θερμίδες', unit: 'kcal', type: 'int', max: 15000, placeholder: '2.200' },
  { id: 'steps', label: 'Βήματα', type: 'int', max: 200000, placeholder: '8.000' },
  { id: 'workout', label: 'Προπόνηση', type: 'text', max: 100, placeholder: 'π.χ. Πόδια' },
];
// Στόχοι (ο ύπνος σε ώρες). Θερμίδες: χωρίς στόχο εκτός αν τον ορίσει ο προπονητής.
const DEFAULT_TARGETS = { sleep: 8, water: 3, steps: 8000, calories: null };
const TARGET_FIELDS = [
  { id: 'sleep', label: 'Ύπνος', unit: 'ώρες', max: 14 },
  { id: 'water', label: 'Νερό', unit: 'L', max: 15 },
  { id: 'steps', label: 'Βήματα', unit: '', max: 200000 },
  { id: 'calories', label: 'Θερμίδες', unit: 'kcal', max: 15000 },
];

export const journalSettings = (journal = {}) => ({
  on: JOURNAL_FIELDS.filter((f) => !(journal.off || []).includes(f.id)).map((f) => f.id),
  targets: { ...DEFAULT_TARGETS, ...(journal.targets || {}) },
});

/* ---------- Ημερομηνίες (τοπικές, χωρίς ώρα) ---------- */
const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return toYmd(d); };
const mondayOf = (s) => { const d = fromYmd(s); return addDays(s, -((d.getDay() + 6) % 7)); };
const DAY_SHORT = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];
const DAY_LETTER = ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ'];
const MONTHS = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const DAY_LONG = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
const dm = (s) => { const d = fromYmd(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
const weekLabel = (start) => {
  const a = fromYmd(start); const b = fromYmd(addDays(start, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
};

/* ---------- Ύπνος ---------- */
// «2330», «23.30», «23:30», «7» → «23:30» / «07:00» · κενό → null · λάθος → undefined
export function parseTime(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?:[:.,\s]?(\d{2}))?$/);
  if (!m) return undefined;
  const h = Number(m[1]); const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
const mins = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
// Λεπτά ύπνου (και όταν κοιμήθηκε πριν τα μεσάνυχτα και ξύπνησε μετά).
export const sleepMinutes = (e) => {
  if (!e?.sleepStart || !e?.sleepEnd) return null;
  let d = mins(e.sleepEnd) - mins(e.sleepStart);
  if (d <= 0) d += 24 * 60;
  return d;
};
export const fmtDur = (m) => (m == null ? '—' : `${Math.floor(m / 60)}ω${m % 60 ? ` ${m % 60}'` : ''}`);

/* ---------- Αριθμοί ---------- */
const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtDec = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const show = (f, v) => (v == null || v === '' ? '' : f.type === 'int' ? fmtInt(v) : f.type === 'dec' ? fmtDec(v) : String(v));
function parseNum(f, s) {
  const t = String(s ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  const v = Number(f.type === 'int' ? t.replace(/\./g, '') : t.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0 || v > f.max) return undefined;
  return f.type === 'int' ? Math.round(v) : Math.round(v * 100) / 100;
}
const isRest = (w) => /ξεκούρασ|ρεπό|rest|off/i.test(w || '');

// Χρώμα τιμής σε σχέση με τον στόχο: 'good' (τον πιάνει) · 'low' (πολύ κάτω) · ''.
function tone(id, v, targets) {
  if (v == null) return '';
  if (id === 'sleep') {
    const t = (targets.sleep || 8) * 60;
    if (v > 14 * 60) return 'low'; // απίθανο (π.χ. ώρες ανάποδα: 07:00 → 02:00 = 19ω): να φαίνεται
    return v >= t ? 'good' : v < Math.min(360, t - 120) ? 'low' : '';
  }
  if (id === 'water' && targets.water) return v >= targets.water ? 'good' : v < targets.water * 0.66 ? 'low' : '';
  if (id === 'steps' && targets.steps) return v >= targets.steps ? 'good' : v < targets.steps * 0.6 ? 'low' : '';
  if (id === 'calories' && targets.calories) return Math.abs(v - targets.calories) <= targets.calories * 0.08 ? 'good' : '';
  if (id === 'sleepQuality') return v >= 4 ? 'good' : v <= 2 ? 'low' : '';
  return '';
}
const valueOf = (id, e) => (id === 'sleep' ? sleepMinutes(e) : e?.[id] ?? null);

/* ---------- Κοινά πεδία ---------- */

// Πεδίο που αποθηκεύει όταν φεύγεις από αυτό (ή με Enter)· Esc: πίσω στην αποθηκευμένη τιμή.
function CommitInput({ value, toText, parse, onSave, className = 'cell', ...rest }) {
  const [text, setText] = useState(toText(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(toText(value)); }, [value, toText]);
  const commit = () => {
    focused.current = false;
    const v = parse(text);
    if (v === undefined) { setBad(true); setText(toText(value)); setTimeout(() => setBad(false), 1200); return; }
    setText(toText(v));
    if ((v ?? null) !== (value ?? null)) onSave(v);
  };
  return (
    <input
      {...rest} className={`${className}${bad ? ' bad' : ''}`} value={text}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setText(toText(value)); focused.current = false; e.currentTarget.blur(); }
      }}
    />
  );
}
const timeText = (v) => v || '';

// Ποιότητα ύπνου 1–5 (ξανά πάτημα στην ίδια = καθαρισμός).
function Quality({ value, onSave, big = false, date }) {
  return (
    <span className={`jr-quality${big ? ' big' : ''}${value == null ? ' blank' : ''}`} role="group" aria-label={`Ποιότητα ύπνου ${date}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" aria-pressed={value === n} aria-label={`${n} από 5`}
          // τελείες (πίνακας): γεμίζουν ως την τιμή · αριθμοί (κινητό): τονίζεται μόνο η επιλογή
          className={value != null && (big ? n === value : n <= value) ? `on ${tone('sleepQuality', value, {})}` : ''}
          onClick={() => onSave(value === n ? null : n)}
        >
          {big ? n : null}
        </button>
      ))}
    </span>
  );
}

/* ---------- Το Ημερολόγιο ---------- */

export default function Journal({ athlete, entries, onChange, canConfigure = false, onAthleteChange }) {
  const listId = useId();
  const today = todayISO();
  const [week, setWeek] = useState(() => mondayOf(today));
  const [day, setDay] = useState(today); // κινητό: η μέρα που επεξεργάζεσαι
  const [metric, setMetric] = useState('sleep');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const { on, targets } = journalSettings(athlete.journal);
  const fields = JOURNAL_FIELDS.filter((f) => on.includes(f.id));
  const has = (id) => on.includes(id);

  // Αλλαγές που φαίνονται ΑΜΕΣΩΣ (πριν απαντήσει η βάση) και αποθηκεύονται με τη σειρά ανά ημέρα,
  // ώστε γρήγορα πατήματα (π.χ. + + + στο νερό) να μη χάνονται.
  const [pending, setPending] = useState({}); // ημερομηνία → αλλαγές που δεν έχουν φανεί ακόμα από τη βάση
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const queue = useRef({}); // ημερομηνία → η τελευταία αποθήκευση σε εξέλιξη
  const byDate = useMemo(() => {
    const m = new Map(entries.map((e) => [e.date, e]));
    for (const [d, p] of Object.entries(pending)) m.set(d, { ...(m.get(d) || { date: d }), ...p });
    return m;
  }, [entries, pending]);
  // Ό,τι έφτασε πλέον από τη βάση δεν χρειάζεται να κρατιέται εδώ.
  useEffect(() => {
    setPending((cur) => {
      let changed = false;
      const next = {};
      for (const [d, p] of Object.entries(cur)) {
        const e = entries.find((x) => x.date === d);
        const rest = Object.fromEntries(Object.entries(p).filter(([k, v]) => (e?.[k] || null) !== (v || null)));
        if (Object.keys(rest).length !== Object.keys(p).length) changed = true;
        if (Object.keys(rest).length) next[d] = rest;
      }
      return changed ? next : cur;
    });
  }, [entries]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const workouts = [...new Set([...entries].reverse().map((e) => e.workout).filter(Boolean))].slice(0, 30);

  const save = (date, patch) => {
    setError('');
    setPending((p) => ({ ...p, [date]: { ...p[date], ...patch } }));
    const run = async () => {
      const server = entriesRef.current.find((e) => e.date === date);
      const current = { ...(server || {}), ...pendingRef.current[date] };
      await saveDailyFields(athlete.id, date, current, patch);
    };
    queue.current[date] = (queue.current[date] || Promise.resolve())
      .then(run)
      .then(() => onChange())
      .catch(() => {
        setError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.');
        setPending((p) => { const { [date]: _, ...rest } = p; return rest; });
        onChange();
      });
  };
  const goWeek = (n) => { const w = addDays(week, 7 * n); setWeek(w); setDay(n === 0 ? today : w); };
  const thisWeek = week === mondayOf(today);

  // Μέσοι όροι της εβδομάδας (μόνο από τις μέρες που έχουν τιμή).
  const avg = (id) => {
    const vals = days.map((d) => valueOf(id, byDate.get(d))).filter((v) => v != null && v !== '');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const trainings = days.filter((d) => { const w = byDate.get(d)?.workout; return w && !isRest(w); }).length;

  const metrics = JOURNAL_FIELDS.filter((f) => has(f.id) && f.id !== 'workout');
  const chartMetric = metrics.some((m) => m.id === metric) ? metric : metrics[0]?.id;

  return (
    <div className="journal">
      <datalist id={listId}>{workouts.map((w) => <option key={w} value={w} />)}</datalist>

      <div className="jr-toolbar">
        <div className="jr-week">
          <button type="button" className="icon-btn jr-nav" onClick={() => goWeek(-1)} aria-label="Προηγούμενη εβδομάδα"><BackIcon size={18} /></button>
          <b>{weekLabel(week)}</b>
          <button type="button" className="icon-btn jr-nav next" onClick={() => goWeek(1)} aria-label="Επόμενη εβδομάδα"><BackIcon size={18} /></button>
          {!thisWeek && <button type="button" className="chip" onClick={() => goWeek(0)}>Σήμερα</button>}
        </div>
        <span className="jr-spacer" />
        {canConfigure && (
          <button type="button" className="btn small jr-tool" onClick={() => setSettingsOpen(true)}>
            <SlidersIcon size={16} /> <span>Πεδία &amp; στόχοι</span>
          </button>
        )}
        <button type="button" className="btn small jr-tool" onClick={() => exportCsv(athlete, entries, fields)} disabled={!entries.length}>
          <DownloadIcon size={16} /> <span>Λήψη</span>
        </button>
      </div>

      {/* Κινητό: λωρίδα ημερών */}
      <div className="jr-strip" role="tablist" aria-label="Ημέρες της εβδομάδας">
        {days.map((d, i) => (
          <button
            key={d} type="button" role="tab" aria-selected={d === day} onClick={() => setDay(d)}
            className={`${d === day ? 'on' : ''}${d === today ? ' today' : ''}`} aria-label={`${DAY_LONG[i]} ${dm(d)}`}
          >
            <small>{DAY_LETTER[i]}</small><b>{fromYmd(d).getDate()}</b><i className={byDate.has(d) ? 'dot' : ''} />
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {fields.length === 0 ? (
        <p className="meta">Δεν παρακολουθείται κανένα πεδίο.</p>
      ) : (
        <>
          {/* Κινητό: η κάρτα της ημέρας */}
          <DayCard
            date={day} entry={byDate.get(day)} has={has} targets={targets} listId={listId}
            onSave={(patch) => save(day, patch)}
          />

          {chartMetric && (
            <section className="panel jr-chart">
              <div className="jr-chips" role="group" aria-label="Τι δείχνει το διάγραμμα">
                {metrics.map((m) => (
                  <button key={m.id} type="button" className="chip" aria-pressed={chartMetric === m.id} onClick={() => setMetric(m.id)}>{m.short || m.label}</button>
                ))}
                <span className="jr-avg">
                  Μ.Ο. <b>{fmtAvg(chartMetric, avg(chartMetric))}</b>
                  {targetText(chartMetric, targets) && <> · στόχος {targetText(chartMetric, targets)}</>}
                </span>
              </div>
              {avg(chartMetric) == null
                ? <p className="jr-chart-empty">Καμία τιμή αυτή την εβδομάδα.</p>
                : <Bars metric={chartMetric} days={days} byDate={byDate} targets={targets} />}
            </section>
          )}

          {/* Υπολογιστής: ο πίνακας της εβδομάδας */}
          <section className="panel jr-table" style={{ '--jr-cols': fields.map((f) => COL_W[f.id]).join(' ') }}>
            <div className="jr-row jr-head">
              <span>Ημέρα</span>
              {fields.map((f) => (
                <span key={f.id}>{f.short || f.label}{targetText(f.id, targets) && <em> · {targetText(f.id, targets)}</em>}</span>
              ))}
            </div>
            {days.map((d, i) => {
              const e = byDate.get(d);
              return (
                <div key={d} className={`jr-row${d === today ? ' today' : ''}`}>
                  <span className="jr-day"><b>{DAY_SHORT[i]}</b> {dm(d)}</span>
                  {fields.map((f) => <Cell key={f.id} f={f} e={e} date={dm(d)} targets={targets} listId={listId} onSave={(p) => save(d, p)} />)}
                </div>
              );
            })}
            <div className="jr-row jr-foot">
              <b>Μ.Ο. εβδομάδας</b>
              {fields.map((f) => (
                <b key={f.id}>{f.id === 'workout' ? `${trainings} ${trainings === 1 ? 'προπόνηση' : 'προπονήσεις'}` : fmtAvg(f.id, avg(f.id))}</b>
              ))}
            </div>
          </section>

          {/* Κινητό: σύνοψη εβδομάδας */}
          <section className="panel jr-week-sum">
            <h3>Μ.Ο. εβδομάδας</h3>
            <div className="jr-sum-grid">
              {fields.filter((f) => f.id !== 'workout').map((f) => (
                <div key={f.id}><small>{f.short || f.label}</small><b>{fmtAvg(f.id, avg(f.id))}</b></div>
              ))}
              {has('workout') && <div><small>Προπονήσεις</small><b>{trainings}</b></div>}
            </div>
          </section>
        </>
      )}

      {settingsOpen && (
        <JournalSettings
          journal={athlete.journal} onClose={() => setSettingsOpen(false)}
          onSave={async (j) => { await setAthleteJournal(athlete.id, j); onAthleteChange?.({ ...athlete, journal: j }); setSettingsOpen(false); }}
        />
      )}
    </div>
  );
}

const COL_W = { sleep: 'minmax(150px, 1.4fr)', sleepQuality: '112px', water: 'minmax(70px, 0.8fr)', calories: 'minmax(80px, 0.9fr)', steps: 'minmax(80px, 0.9fr)', workout: 'minmax(120px, 1.4fr)' };

function fmtAvg(id, v) {
  if (v == null) return '—';
  if (id === 'sleep') return fmtDur(Math.round(v));
  if (id === 'sleepQuality') return `${fmtDec(Math.round(v * 10) / 10)} / 5`;
  if (id === 'water') return `${fmtDec(Math.round(v * 100) / 100)} L`;
  return fmtInt(v);
}
function targetText(id, t) {
  if (id === 'sleep' && t.sleep) return `${fmtDec(t.sleep)}ω`;
  if (id === 'water' && t.water) return `${fmtDec(t.water)} L`;
  if (id === 'steps' && t.steps) return fmtInt(t.steps);
  if (id === 'calories' && t.calories) return fmtInt(t.calories);
  return '';
}

// Ένα κελί του πίνακα (υπολογιστής).
function Cell({ f, e, date, targets, listId, onSave }) {
  if (f.id === 'sleep') {
    const m = sleepMinutes(e);
    return (
      <span className={`jr-sleep${!e?.sleepStart && !e?.sleepEnd ? ' blank' : ''}`}>
        <b className={`jr-v ${tone('sleep', m, targets)}`}>{fmtDur(m)}</b>
        <span className="jr-times">
          <CommitInput className="cell jr-time" value={e?.sleepStart} toText={timeText} parse={parseTime} placeholder="--:--" inputMode="numeric" aria-label={`Ώρα ύπνου ${date}`} onSave={(v) => onSave({ sleepStart: v })} />
          <span aria-hidden="true">→</span>
          <CommitInput className="cell jr-time" value={e?.sleepEnd} toText={timeText} parse={parseTime} placeholder="--:--" inputMode="numeric" aria-label={`Ώρα ξυπνήματος ${date}`} onSave={(v) => onSave({ sleepEnd: v })} />
        </span>
      </span>
    );
  }
  if (f.id === 'sleepQuality') return <Quality value={e?.sleepQuality ?? null} date={date} onSave={(v) => onSave({ sleepQuality: v })} />;
  if (f.type === 'text') {
    return (
      <CommitInput
        value={e?.workout || ''} toText={(v) => v || ''} parse={(s) => String(s ?? '').trim().slice(0, f.max)}
        placeholder="—" list={listId} maxLength={f.max} aria-label={`${f.label} ${date}`}
        className={`cell${isRest(e?.workout) ? ' rest' : ''}`} onSave={(v) => onSave({ workout: v })}
      />
    );
  }
  return (
    <CommitInput
      value={e?.[f.id] ?? null} toText={(v) => show(f, v)} parse={(s) => parseNum(f, s)} placeholder="—"
      inputMode={f.type === 'int' ? 'numeric' : 'decimal'} aria-label={`${f.label} ${date}`}
      className={`cell num ${tone(f.id, e?.[f.id] ?? null, targets)}`} onSave={(v) => onSave({ [f.id]: v })}
    />
  );
}

// Κινητό: όλη η μέρα σε μία κάρτα, με μεγάλα πεδία.
function DayCard({ date, entry: e, has, targets, listId, onSave }) {
  const d = fromYmd(date);
  const wd = (d.getDay() + 6) % 7;
  const m = sleepMinutes(e);
  const water = e?.water ?? null;
  const stepWater = (n) => onSave({ water: Math.max(0, Math.min(15, Math.round(((water || 0) + n) * 100) / 100)) || null });
  const f = (id) => JOURNAL_FIELDS.find((x) => x.id === id);
  return (
    <section className="jr-daycard" aria-label={`${DAY_LONG[wd]} ${d.getDate()}`}>
      <h3>{date === todayISO() ? 'Σήμερα · ' : ''}{DAY_LONG[wd]} {d.getDate()} {MONTHS[d.getMonth()]}</h3>
      {(has('sleep') || has('sleepQuality')) && (
        <div className="panel jr-card">
          <div className="jr-card-head">
            <MoonIcon size={18} /> Ύπνος
            {has('sleep') && m != null && <span className={`jr-pill ${tone('sleep', m, targets)}`}>{fmtDur(m)}</span>}
          </div>
          {has('sleep') && (
            <div className="jr-two">
              <label>Κοιμήθηκα
                <CommitInput className="jr-input" value={e?.sleepStart} toText={timeText} parse={parseTime} placeholder="23:30" inputMode="numeric" onSave={(v) => onSave({ sleepStart: v })} />
              </label>
              <label>Ξύπνησα
                <CommitInput className="jr-input" value={e?.sleepEnd} toText={timeText} parse={parseTime} placeholder="07:00" inputMode="numeric" onSave={(v) => onSave({ sleepEnd: v })} />
              </label>
            </div>
          )}
          {has('sleepQuality') && (
            <div className="jr-q-row"><span>Πώς κοιμήθηκες;</span><Quality big value={e?.sleepQuality ?? null} date={DAY_LONG[wd]} onSave={(v) => onSave({ sleepQuality: v })} /></div>
          )}
        </div>
      )}
      <div className="jr-two">
        {has('water') && (
          <div className="panel jr-card">
            <span className="jr-label">Νερό{targets.water ? ` · στόχος ${fmtDec(targets.water)} L` : ''}</span>
            <div className="jr-stepper">
              <button type="button" onClick={() => stepWater(-0.25)} disabled={!water} aria-label="Λιγότερο νερό">−</button>
              <b className={tone('water', water, targets)}>{water == null ? '0' : fmtDec(water)} L</b>
              <button type="button" className="plus" onClick={() => stepWater(0.25)} aria-label="Περισσότερο νερό">+</button>
            </div>
          </div>
        )}
        {['calories', 'steps'].filter(has).map((id) => (
          <label key={id} className="panel jr-card">
            <span className="jr-label">{f(id).label}{targets[id] ? ` · στόχος ${fmtInt(targets[id])}` : ''}</span>
            <CommitInput
              className={`jr-input big ${tone(id, e?.[id] ?? null, targets)}`} value={e?.[id] ?? null} toText={(v) => show(f(id), v)}
              parse={(s) => parseNum(f(id), s)} placeholder={`π.χ. ${f(id).placeholder}`} inputMode="numeric" onSave={(v) => onSave({ [id]: v })}
            />
          </label>
        ))}
      </div>
      {has('workout') && (
        <label className="panel jr-card">
          <span className="jr-label">Προπόνηση</span>
          <CommitInput
            className="jr-input" value={e?.workout || ''} toText={(v) => v || ''} parse={(s) => String(s ?? '').trim().slice(0, 100)}
            placeholder="π.χ. Πόδια ή Ξεκούραση" list={listId} maxLength={100} onSave={(v) => onSave({ workout: v })}
          />
        </label>
      )}
    </section>
  );
}

// Διάγραμμα της εβδομάδας για ένα πεδίο: μπάρες, διακεκομμένη γραμμή στον στόχο.
function Bars({ metric, days, byDate, targets }) {
  const vals = days.map((d) => valueOf(metric, byDate.get(d)));
  const target = metric === 'sleep' ? (targets.sleep ? targets.sleep * 60 : null) : metric === 'sleepQuality' ? null : targets[metric] || null;
  const top = Math.max(target || 0, ...vals.map((v) => v || 0), metric === 'sleepQuality' ? 5 : 1) * 1.12;
  const label = (v) => (v == null ? '' : metric === 'sleep' ? fmtDur(v) : metric === 'water' ? fmtDec(v) : metric === 'sleepQuality' ? String(v) : fmtInt(v));
  const H = 130;
  return (
    <div className="jr-bars" role="img" aria-label="Διάγραμμα εβδομάδας">
      {target && <div className="jr-target" style={{ bottom: 22 + (target / top) * H }} aria-hidden="true" />}
      {days.map((d, i) => {
        const v = vals[i];
        return (
          <div key={d} className="jr-bar-col">
            <small>{label(v)}</small>
            <span className={`jr-bar ${tone(metric, v, targets) || 'mid'}`} style={{ height: v == null ? 0 : Math.max(3, (v / top) * H) }} />
            <em>{DAY_SHORT[i]}</em>
          </div>
        );
      })}
    </div>
  );
}

// Πεδία & στόχοι (ο προπονητής, ή ο ίδιος αν δεν έχει προπονητή).
function JournalSettings({ journal = {}, onClose, onSave }) {
  const cur = journalSettings(journal);
  const [on, setOn] = useState(cur.on);
  const [targets, setTargets] = useState(Object.fromEntries(TARGET_FIELDS.map((t) => [t.id, cur.targets[t.id] == null ? '' : String(cur.targets[t.id]).replace('.', ',')])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const t = {};
    for (const f of TARGET_FIELDS) {
      const s = targets[f.id].trim().replace(',', '.');
      if (!s) { t[f.id] = null; continue; }
      const v = Number(s.replace(/\.(?=\d{3}\b)/g, ''));
      if (!Number.isFinite(v) || v <= 0 || v > f.max) return setError(`Μη έγκυρος στόχος: ${f.label}.`);
      t[f.id] = Math.round(v * 100) / 100;
    }
    setBusy(true);
    try {
      await onSave({ off: JOURNAL_FIELDS.map((f) => f.id).filter((id) => !on.includes(id)), targets: t });
    } catch {
      setError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="confirm" role="dialog" aria-modal="true" aria-label="Πεδία και στόχοι" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="confirm-box jr-settings" onSubmit={submit}>
        <h2>Πεδία &amp; στόχοι</h2>
        <div className="jr-set-list">
          {JOURNAL_FIELDS.map((f) => {
            const tf = TARGET_FIELDS.find((x) => x.id === f.id);
            const active = on.includes(f.id);
            return (
              <div key={f.id} className="jr-set-row">
                <b>{f.label}</b>
                {tf && active && (
                  <label className="jr-set-target">στόχος
                    <input value={targets[f.id]} onChange={(e) => setTargets((x) => ({ ...x, [f.id]: e.target.value }))} inputMode="decimal" placeholder="—" aria-label={`Στόχος: ${f.label}`} />
                    {tf.unit}
                  </label>
                )}
                <button
                  type="button" role="switch" aria-checked={active} className="switch" aria-label={f.label}
                  onClick={() => setOn((x) => (active ? x.filter((y) => y !== f.id) : [...x, f.id]))}
                />
              </div>
            );
          })}
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

// Λήψη όλου του Ημερολογίου ως αρχείο πίνακα CSV (ελληνικά σωστά, «;» για τα ελληνικά προγράμματα πινάκων).
function exportCsv(athlete, entries, fields) {
  const safe = (v) => {
    const s = String(v ?? '');
    const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // όχι τύποι πίνακα από κείμενο χρήστη
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const cols = [['Ημερομηνία', (e) => e.date.split('-').reverse().join('/')]];
  for (const f of fields) {
    if (f.id === 'sleep') cols.push(['Ώρα ύπνου', (e) => e.sleepStart], ['Ώρα ξυπνήματος', (e) => e.sleepEnd], ['Ώρες ύπνου', (e) => { const m = sleepMinutes(e); return m == null ? '' : fmtDec(Math.round((m / 60) * 100) / 100); }]);
    else if (f.id === 'sleepQuality') cols.push(['Ποιότητα ύπνου (1-5)', (e) => e.sleepQuality]);
    else cols.push([`${f.label}${f.unit ? ` (${f.unit})` : ''}`, (e) => (f.type === 'dec' && e[f.id] != null ? fmtDec(e[f.id]) : e[f.id])]);
  }
  const rows = [cols.map((c) => c[0]), ...[...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => cols.map((c) => c[1](e)))];
  const csv = '﻿' + rows.map((r) => r.map(safe).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ημερολόγιο - ${athlete.name.replace(/[\\/:*?"<>|]+/g, ' ')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
