'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MIN_PASSWORD, useAuth } from '@/lib/AuthContext';

export default function ResetForm() {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Οι δύο κωδικοί δεν ταιριάζουν.');
    setBusy(true);
    const res = await resetPassword(password);
    setBusy(false);
    setError(res.error || '');
    setExpired(!!res.expired);
    if (res.ok) setDone(true);
  };

  return (
    <main className="wrap">
      <div className="auth">
        <h1>Νέος κωδικός</h1>

        {done ? (
          <>
            <p className="auth-sub">Ο κωδικός σου άλλαξε και είσαι συνδεδεμένος.</p>
            <Link href="/dashboard" className="btn primary big full">Συνέχεια</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="auth-sub">Διάλεξε έναν νέο κωδικό για τον λογαριασμό σου.</p>
            <label className="f">
              Νέος κωδικός
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
              <small>Τουλάχιστον {MIN_PASSWORD} χαρακτήρες</small>
            </label>
            <label className="f">
              Επανάληψη νέου κωδικού
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            {error && (
              <p className="error" role="alert">
                {error} {expired && <Link href="/forgot-password">Νέος σύνδεσμος</Link>}
              </p>
            )}
            <button className="btn primary big full" type="submit" disabled={busy}>
              {busy ? 'Αποθήκευση...' : 'Αποθήκευση κωδικού'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
