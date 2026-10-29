// Το ερωτηματολόγιο του check-in: οι ερωτήσεις (τις ορίζει ο προπονητής) και οι προεπιλεγμένες της εφαρμογής.
// Ερώτηση: { id, label, short (για τον πίνακα), kind: 'scale' (1–10) | 'yesno' | 'text', better }
//   better: τι είναι καλό — 'up'/'down' για κλίμακα (το άγχος: 'down'), 'yes'/'no' για ναι/όχι, null = ουδέτερο.

export const DEFAULT_FORM = [
  { id: 'energy', label: 'Ενέργεια', kind: 'scale', better: 'up' },
  { id: 'sleep', label: 'Ποιότητα ύπνου', short: 'Ύπνος', kind: 'scale', better: 'up' },
  { id: 'stress', label: 'Άγχος', kind: 'scale', better: 'down' },
  { id: 'hunger', label: 'Πείνα', kind: 'scale', better: null },
  { id: 'diet', label: 'Τήρηση διατροφής', short: 'Διατροφή', kind: 'scale', better: 'up' },
  { id: 'training', label: 'Τήρηση προπόνησης', short: 'Προπόνηση', kind: 'scale', better: 'up' },
  { id: 'workouts', label: 'Έκανες όλες τις προπονήσεις;', kind: 'yesno', better: 'yes' },
  { id: 'pain', label: 'Πόνος ή τραυματισμός;', kind: 'yesno', better: 'no' },
];

export const KINDS = [
  { id: 'scale', label: 'Κλίμακα 1–10' },
  { id: 'yesno', label: 'Ναι / Όχι' },
  { id: 'text', label: 'Κείμενο' },
];

export const MAX_QUESTIONS = 15;

// Έγκυρη ερώτηση: ό,τι άλλο αγνοείται (ώστε μια «χαλασμένη» λίστα να μη «σπάει» τη σελίδα).
const validQuestion = (q) => !!q && typeof q === 'object' && typeof q.id === 'string' && typeof q.label === 'string'
  && KINDS.some((k) => k.id === q.kind);

// Οι ερωτήσεις ενός αθλούμενου (αν δεν έχουν οριστεί: οι προεπιλεγμένες).
export const formOf = (athlete) => (Array.isArray(athlete?.checkinForm) ? athlete.checkinForm.filter(validQuestion) : DEFAULT_FORM);

// Μόνο έγκυρες απαντήσεις (1–10, ναι/όχι, κείμενο ως 500 χαρακτήρες) και μόνο για υπαρκτές ερωτήσεις.
export function cleanAnswers(form, answers) {
  const out = {};
  for (const q of form) {
    const v = answers?.[q.id];
    if (q.kind === 'scale' && Number.isInteger(v) && v >= 1 && v <= 10) out[q.id] = v;
    if (q.kind === 'yesno' && typeof v === 'boolean') out[q.id] = v;
    if (q.kind === 'text' && typeof v === 'string' && v.trim()) out[q.id] = v.trim().slice(0, 500);
  }
  return out;
}

// Πώς δείχνεται μια απάντηση σε κείμενο.
export function answerText(q, v) {
  if (v == null) return '–';
  if (q.kind === 'yesno') return v ? 'Ναι' : 'Όχι';
  return String(v);
}

// Βελτίωση/χειροτέρευση από την προηγούμενη απάντηση: 1 καλύτερα, -1 χειρότερα, 0 ίδιο/ουδέτερο, null άγνωστο.
export function trend(q, prev, now) {
  if (prev == null || now == null || prev === now) return prev == null || now == null ? null : 0;
  if (q.kind === 'scale') {
    if (!q.better) return 0;
    return (now > prev) === (q.better === 'up') ? 1 : -1;
  }
  if (q.kind === 'yesno') {
    if (!q.better) return 0;
    return now === (q.better === 'yes') ? 1 : -1;
  }
  return 0;
}

// Νέο μοναδικό id για ερώτηση του προπονητή.
export const newQuestionId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
