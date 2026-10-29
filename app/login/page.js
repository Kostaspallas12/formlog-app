'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRedirectIfLoggedIn } from '@/lib/useAuthRedirect';
import { getRememberedEmail } from '@/lib/lastUser';

export default function LoginPage() {
  const { login } = useRedirectIfLoggedIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);
  const [next, setNext] = useState(null); // από πρόσκληση προπονητή: /join/…

  // «Να με θυμάσαι»: αν υπάρχει αποθηκευμένο email, το συμπληρώνουμε και πάμε κατευθείαν στον κωδικό.
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('next');
    if (n?.startsWith('/join/')) setNext(n);
    const saved = getRememberedEmail();
    if (saved) {
      setEmail(saved);
      passwordRef.current?.focus();
    }
  }, []);

  // Μετά την επιτυχή είσοδο, το useRedirectIfLoggedIn στέλνει στο /dashboard.
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await login({ email, password, remember });
    setBusy(false);
    setError(res.error || '');
  };

  return (
    <main className="wrap">
      <form className="auth" onSubmit={submit}>
        <h1>Καλώς ήρθες πίσω</h1>
        <p className="auth-sub">Μπες για να δεις το αρχείο σου.</p>

        <label className="f">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="f">
          Κωδικός
          <input
            ref={passwordRef} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required
          />
        </label>

        <div className="login-options">
          <label className="check remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Να με θυμάσαι</span>
          </label>
          <Link href="/forgot-password" className="forgot">Ξέχασες τον κωδικό;</Link>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn primary big full" type="submit" disabled={busy}>
          {busy ? 'Είσοδος...' : 'Είσοδος'}
        </button>
        <p className="auth-foot">
          Δεν έχεις λογαριασμό; <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}>Δημιούργησε έναν</Link>
        </p>
      </form>
    </main>
  );
}
