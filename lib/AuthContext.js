'use client';

// Λογαριασμοί μέσω Supabase Auth: εγγραφή, είσοδος, αποσύνδεση, αλλαγές στοιχείων, επαναφορά κωδικού.
// Οι σελίδες χρησιμοποιούν μόνο το useAuth().

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { setRemember, supabase } from './supabase';
import { clearMyAvatar, deleteMyAccount, getProfile, setMyAvatar, updateProfileName, updateProfileSettings } from './storage';
import { SITE } from './site';
import { clearLastUser, saveLastUser, setRememberedEmail } from './lastUser';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export const MIN_PASSWORD = 8;

const origin = () => window.location.origin;

// Μεταφράζει τα συνηθισμένα σφάλματα του Supabase σε ελληνικά.
function message(error) {
  const code = error?.code;
  const text = error?.message ?? '';
  if (code === 'invalid_credentials') return 'Λάθος email ή κωδικός.';
  if (code === 'email_not_confirmed') return 'Δεν έχεις επιβεβαιώσει ακόμα το email σου. Πάτα τον σύνδεσμο που σου στείλαμε.';
  if (code === 'user_already_exists' || code === 'email_exists') return 'Υπάρχει ήδη λογαριασμός με αυτό το email.';
  if (code === 'same_password') return 'Ο νέος κωδικός πρέπει να είναι διαφορετικός από τον προηγούμενο.';
  if (code === 'weak_password') return `Ο κωδικός είναι πολύ αδύναμος. Χρησιμοποίησε τουλάχιστον ${MIN_PASSWORD} χαρακτήρες.`;
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(text)) return 'Έγιναν πολλές προσπάθειες. Δοκίμασε ξανά σε λίγα λεπτά.';
  if (code === 'email_address_invalid') return 'Αυτό το email δεν είναι έγκυρο.';
  if (/fetch|network/i.test(text)) return 'Δεν υπάρχει σύνδεση με τον server. Έλεγξε το internet σου.';
  return 'Κάτι πήγε στραβά. Δοκίμασε ξανά.';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, name, type: 'personal' | 'coach' }
  const [ready, setReady] = useState(false);

  // Ποιος χρήστης έχει ήδη φορτωθεί, ώστε η είσοδος και τα γεγονότα του Supabase
  // να μη φέρνουν το ίδιο προφίλ δύο φορές. Μια δεύτερη κλήση για τον ίδιο χρήστη
  // ΠΕΡΙΜΕΝΕΙ την ίδια φόρτωση (δεν την προσπερνά). force = ξαναφόρτωση (π.χ. αλλαγή email).
  const loaded = useRef({ id: null, promise: null });

  const loadUser = useCallback((authUser, force = false) => {
    if (!authUser) {
      loaded.current = { id: null, promise: null };
      setUser(null);
      clearLastUser();
      return Promise.resolve();
    }
    if (!force && loaded.current.id === authUser.id && loaded.current.promise) return loaded.current.promise;
    const promise = (async () => {
      try {
        const p = await getProfile(authUser.id);
        const u = {
          id: authUser.id,
          email: authUser.email,
          name: p?.name ?? authUser.email.split('@')[0],
          type: p?.type ?? 'personal',
          createdAt: p?.created_at,
          consent: p?.consent,
          notifyCheckins: p?.notify_checkins ?? true,
          notifyMessages: p?.notify_messages ?? true,
          avatar: p?.avatar ?? null,
        };
        setUser(u);
        saveLastUser(u);
      } catch {
        loaded.current = { id: null, promise: null };
        setUser(null);
      }
    })();
    loaded.current = { id: authUser.id, promise };
    return promise;
  }, []);

  // Συνεδρία: φόρτωση στην αρχή και παρακολούθηση αλλαγών (είσοδος, έξοδος, ανανέωση, σύνδεσμοι email).
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      await loadUser(data.session?.user ?? null);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Εκτός του callback, όπως προτείνει το Supabase, για να μην μπλοκάρει.
        setTimeout(() => loadUser(session?.user ?? null, event === 'USER_UPDATED'), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUser]);

  // Ελέγχει τον κωδικό του συνδεδεμένου χρήστη (για ευαίσθητες αλλαγές).
  const verifyPassword = async (password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    return !error;
  };

  // Επιστρέφουν { error } ή { ok, ... }

  // redirectTo: πού οδηγεί ο σύνδεσμος επιβεβαίωσης (π.χ. πίσω στην πρόσκληση του προπονητή).
  const signup = async ({ name, email, password, type, redirectTo = '/dashboard' }) => {
    setRemember(true); // ο νέος χρήστης μένει συνδεδεμένος
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${origin()}${redirectTo}`,
        data: {
          name: name.trim(),
          type,
          // Απόδειξη συγκατάθεσης (GDPR). Η βάση απορρίπτει εγγραφή χωρίς αυτή και βάζει η ίδια την ώρα.
          consent: { terms: true, healthData: true, version: SITE.legalVersion },
        },
      },
    });
    if (error) return { error: message(error) };
    // Αν είναι ενεργή η επιβεβαίωση email, δεν υπάρχει ακόμα συνεδρία.
    if (!data.session) return { ok: true, confirm: true };
    await loadUser(data.user);
    return { ok: true };
  };

  // remember: «Να με θυμάσαι» – μένεις συνδεδεμένος και το email συμπληρώνεται την επόμενη φορά.
  const login = async ({ email, password, remember = true }) => {
    setRemember(remember);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: message(error) };
    setRememberedEmail(remember ? email.trim() : null);
    await loadUser(data.user);
    return { ok: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    loaded.current = { id: null, promise: null };
    clearLastUser();
    setUser(null);
  };

  // Ειδοποιήσεις (ναι/όχι): kind = 'checkins' (νέο check-in, για προπονητές) ή 'messages' (νέο μήνυμα).
  const setNotify = async (kind, on) => {
    try {
      await updateProfileSettings(user.id, { [`notify_${kind}`]: on });
    } catch (e) {
      return { error: message(e) };
    }
    setUser((u) => ({ ...u, [kind === 'checkins' ? 'notifyCheckins' : 'notifyMessages']: on }));
    return { ok: true };
  };

  const updateName = async (name) => {
    name = name.trim();
    if (!name) return { error: 'Γράψε ένα όνομα.' };
    try {
      await updateProfileName(user.id, name);
    } catch (e) {
      return { error: message(e) };
    }
    setUser((u) => ({ ...u, name }));
    saveLastUser({ type: user.type, name });
    return { ok: true };
  };

  const updateAvatar = async (blob) => {
    const path = await setMyAvatar(user, blob);
    setUser((u) => ({ ...u, avatar: path }));
    return { ok: true };
  };
  const removeAvatar = async () => {
    await clearMyAvatar(user);
    setUser((u) => ({ ...u, avatar: null }));
  };

  // Το Supabase στέλνει email επιβεβαίωσης· το email αλλάζει όταν πατηθεί ο σύνδεσμος.
  const changeEmail = async ({ newEmail, password }) => {
    newEmail = newEmail.trim().toLowerCase();
    if (newEmail === user.email) return { error: 'Αυτό είναι ήδη το email σου.' };
    if (!(await verifyPassword(password))) return { error: 'Λάθος κωδικός.' };
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${origin()}/account` }
    );
    if (error) return { error: message(error) };
    return { ok: true, pending: true };
  };

  const changePassword = async ({ current, next }) => {
    if (next.length < MIN_PASSWORD) return { error: `Ο νέος κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD} χαρακτήρες.` };
    if (!(await verifyPassword(current))) return { error: 'Ο τρέχων κωδικός είναι λάθος.' };
    if (next === current) return { error: 'Ο νέος κωδικός πρέπει να είναι διαφορετικός από τον τρέχοντα.' };
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return { error: message(error) };
    return { ok: true };
  };

  // Ξέχασα τον κωδικό: το Supabase στέλνει email με σύνδεσμο προς το /reset-password.
  const requestPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin()}/reset-password`,
    });
    // Για λόγους ασφαλείας δεν λέμε αν υπάρχει λογαριασμός· δείχνουμε μόνο σφάλματα δικτύου/ορίων.
    if (error && error.code !== 'user_not_found') return { error: message(error) };
    return { ok: true };
  };

  // Καλείται από τη σελίδα /reset-password, αφού ο σύνδεσμος του email έχει ανοίξει συνεδρία.
  const resetPassword = async (password) => {
    if (password.length < MIN_PASSWORD) return { error: `Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD} χαρακτήρες.` };
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { error: 'Ο σύνδεσμος έχει λήξει ή δεν είναι έγκυρος. Ζήτησε νέο.', expired: true };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: message(error) };
    return { ok: true };
  };

  // Οριστική διαγραφή λογαριασμού, με επιβεβαίωση κωδικού.
  const deleteAccount = async (password) => {
    if (!(await verifyPassword(password))) return { error: 'Λάθος κωδικός.' };
    try {
      await deleteMyAccount();
    } catch (e) {
      return { error: e.message?.startsWith('Δεν') ? e.message : message(e) };
    }
    await supabase.auth.signOut({ scope: 'local' });
    clearLastUser();
    setRememberedEmail(null);
    return { ok: true };
  };

  return (
    <Ctx.Provider
      value={{
        user, ready, signup, login, logout,
        updateName, updateAvatar, removeAvatar, setNotify, changeEmail, changePassword, requestPasswordReset, resetPassword, deleteAccount,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
