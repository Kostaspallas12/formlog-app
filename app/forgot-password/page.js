'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await requestPasswordReset(email);
    setBusy(false);
    setError(res.error || '');
    if (res.ok) setSent(true);
  };

  return (
    <main className="wrap">
      <div className="auth">
        <h1>Ξέχασες τον κωδικό;</h1>

        {!sent ? (
          <form onSubmit={submit}>
            <p className="auth-sub">Γράψε το email σου και θα σου στείλουμε σύνδεσμο για να ορίσεις νέο κωδικό.</p>
            <label className="f">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary big full" type="submit" disabled={busy}>
              {busy ? 'Αποστολή...' : 'Αποστολή συνδέσμου'}
            </button>
          </form>
        ) : (
          // Ίδιο μήνυμα είτε υπάρχει λογαριασμός είτε όχι, ώστε να μη φαίνεται ποια email είναι εγγεγραμμένα.
          <>
            <p className="auth-sub">
              Αν υπάρχει λογαριασμός με το <b>{email.trim()}</b>, θα λάβεις email με σύνδεσμο για νέο κωδικό.
            </p>
            <p className="meta">Δεν το βρίσκεις; Κοίτα και στα ανεπιθύμητα (spam).</p>
          </>
        )}

        <p className="auth-foot"><Link href="/login">← Πίσω στην είσοδο</Link></p>
      </div>
    </main>
  );
}
