// Θυμάται σε αυτή τη συσκευή τον τελευταίο χρήστη (τύπο λογαριασμού και μικρό όνομα),
// ώστε όσο φορτώνει η σελίδα να δείχνει αμέσως το σωστό «Γεια σου, …» και τον σωστό σκελετό.
// Δεν κρατάει τίποτα ευαίσθητο και σβήνεται με την αποσύνδεση.

const KEY = 'formlog:lastUser';

export function getLastUser() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && (v.type === 'coach' || v.type === 'personal') ? v : null;
  } catch {
    return null;
  }
}

export function saveLastUser({ type, name }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ type, firstName: (name || '').split(' ')[0] }));
  } catch {}
}

// «Να με θυμάσαι»: το email συμπληρώνεται μόνο του στην επόμενη είσοδο.
const EMAIL_KEY = 'formlog:rememberedEmail';

export function getRememberedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function setRememberedEmail(email) {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {}
}

export function clearLastUser() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
