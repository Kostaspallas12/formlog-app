import { createClient } from '@supabase/supabase-js';

// «Να με θυμάσαι»: αν είναι τσεκαρισμένο, η σύνδεση κρατιέται στον browser και μετά το κλείσιμό του
// (localStorage). Αν όχι, κρατιέται μόνο όσο είναι ανοιχτός (sessionStorage) – για κοινόχρηστους υπολογιστές.
const REMEMBER_KEY = 'formlog:remember';

const rememberOn = () => {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== '0';
  } catch {
    return true;
  }
};

export function setRemember(on) {
  try {
    localStorage.setItem(REMEMBER_KEY, on ? '1' : '0');
  } catch {}
}

const sessionStore = {
  getItem: (k) => {
    try {
      return (rememberOn() ? localStorage : sessionStorage).getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      (rememberOn() ? localStorage : sessionStorage).setItem(k, v);
    } catch {}
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {}
  },
};

// Ποιον αθλούμενο άλλαξε πρόσφατα ΑΥΤΗ η καρτέλα (για να αγνοεί την «ηχώ» μόνο των δικών της αλλαγών —
// όχι αλλαγές από άλλη συσκευή ή σε άλλον αθλούμενο).
const recentWrites = new Map(); // athlete id → πότε
const ATHLETE_ID = /athlete_id(?:=eq\.|"\s*:\s*")([0-9a-f-]{36})/gi;
export const wroteRecently = (athleteId, ms = 3000) => Date.now() - (recentWrites.get(athleteId) || 0) < ms;
let anyWriteAt = 0;
const READ_RPC = /\/rpc\/(my_|get_|group_people|invite_info|can_)/;
export const wroteAnythingRecently = (ms = 2500) => Date.now() - anyWriteAt < ms;
const trackedFetch = (url, opts) => {
  const m = (opts?.method || 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD' && String(url).includes('/rest/v1/') && !READ_RPC.test(String(url))) anyWriteAt = Date.now();
  if (m !== 'GET' && m !== 'HEAD' && String(url).includes('/rest/v1/') && !String(url).includes('/rest/v1/rpc/')) {
    const text = decodeURIComponent(String(url)) + ' ' + (typeof opts?.body === 'string' ? opts.body : '');
    for (const hit of text.matchAll(ATHLETE_ID)) recentWrites.set(hit[1].toLowerCase(), Date.now());
  }
  return fetch(url, opts);
};

// Ένας client για όλο το site. Τα στοιχεία έρχονται από το .env.local.
// Η συνεδρία ανανεώνεται αυτόματα. Οι σύνδεσμοι από τα email (επιβεβαίωση, επαναφορά κωδικού)
// διαβάζονται αυτόματα από το URL.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: sessionStore },
    // Η ζωντανή σύνδεση κρατιέται και όταν η καρτέλα είναι στο παρασκήνιο (ο browser «παγώνει» τους χρονομετρητές της).
    realtime: { worker: true },
    global: { fetch: trackedFetch },
  }
);

// Το id του συνδεδεμένου χρήστη (από τη συνεδρία, χωρίς αίτημα στον server).
export async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('not authenticated');
  return id;
}
