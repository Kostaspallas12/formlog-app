'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRedirectIfLoggedIn } from '@/lib/useAuthRedirect';

const TYPES = [
  { id: 'personal', title: 'Προσωπική χρήση' },
  { id: 'coach', title: 'Προπονητής' },
];

// fromInvite: ήρθε από πρόσκληση προπονητή (μόνο προσωπικός λογαριασμός, μετά επιστρέφει στην πρόσκληση).
export default function SignupForm({ initialType, fromInvite = false, next = null }) {
  const { signup } = useRedirectIfLoggedIn();
  const [type, setType] = useState(initialType);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  // Μετά την επιτυχή εγγραφή: αν θέλει επιβεβαίωση email δείχνουμε μήνυμα,
  // αλλιώς το useRedirectIfLoggedIn στέλνει στο /dashboard.
  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
    if (!terms || !health) return setError('Για να συνεχίσεις χρειάζεται να αποδεχτείς και τα δύο.');
    setBusy(true);
    const res = await signup({ name, email, password, type, redirectTo: next || '/dashboard' });
    setBusy(false);
    setError(res.error || '');
    if (res.confirm) setConfirmSent(true);
  };

  if (confirmSent) {
    return (
      <main className="wrap">
        <div className="auth">
          <h1>Έλεγξε το email σου</h1>
          <p className="auth-sub">
            Στείλαμε σύνδεσμο επιβεβαίωσης στο <b>{email.trim()}</b>. Πάτα τον για να ενεργοποιηθεί ο λογαριασμός σου.
          </p>
          <p className="meta">Δεν το βρίσκεις; Κοίτα και στα ανεπιθύμητα (spam).</p>
          <p className="auth-foot"><Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>Πήγαινε στην είσοδο</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <form className="auth" onSubmit={submit}>
        <h1>Δημιουργία λογαριασμού</h1>
        {fromInvite ? (
          <p className="auth-sub">Φτιάξε τον λογαριασμό σου για να συνδεθείς με τον προπονητή σου.</p>
        ) : (
          <>
            <p className="auth-sub">Πώς θα χρησιμοποιήσεις το FormLog;</p>
            <div className="types" role="radiogroup" aria-label="Τύπος λογαριασμού">
              {TYPES.map((t) => (
                <button
                  key={t.id} type="button" role="radio" className="type"
                  aria-checked={type === t.id} onClick={() => setType(t.id)}
                >
                  <b>{t.title}</b>
                </button>
              ))}
            </div>
          </>
        )}

        <label className="f">
          {type === 'coach' ? 'Όνομα ή όνομα γυμναστηρίου' : 'Όνομα'}
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="f">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="f">
          Κωδικός
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" required
          />
          <small>Τουλάχιστον 8 χαρακτήρες</small>
        </label>

        {/* Η συγκατάθεση δίνεται ρητά, με κουτάκια που δεν είναι ήδη τσεκαρισμένα (GDPR). */}
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            Είμαι τουλάχιστον 15 ετών και αποδέχομαι τους{' '}
            <Link href="/terms" target="_blank">Όρους χρήσης</Link> και την{' '}
            <Link href="/privacy" target="_blank">Πολιτική απορρήτου</Link>.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} />
          <span>
            {type === 'coach'
              ? 'Δηλώνω ότι θα καταχωρώ φωτογραφίες σώματος και βάρος αθλούμενων μόνο με τη ρητή συγκατάθεσή τους, και ότι θα τα διαγράφω όταν μου το ζητήσουν.'
              : 'Συναινώ στην επεξεργασία των φωτογραφιών σώματος και του βάρους μου, με σκοπό την παρακολούθηση της προόδου μου. Μπορώ να ανακαλέσω τη συγκατάθεση διαγράφοντας τον λογαριασμό μου.'}
          </span>
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn primary big full" type="submit" disabled={busy}>
          {busy ? 'Δημιουργία...' : 'Δημιουργία λογαριασμού'}
        </button>
        <p className="auth-foot">
          Έχεις ήδη λογαριασμό; <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>Είσοδος</Link>
        </p>
      </form>
    </main>
  );
}
