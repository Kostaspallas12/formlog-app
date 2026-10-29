'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import LogoMark from './Logo';

export default function Header() {
  const { user, ready, logout } = useAuth();

  return (
    <header className="top">
      <div className="wrap">
        <Link href={user ? '/dashboard' : '/'} className="logo"><LogoMark size={34} /> FormLog</Link>

        {ready && (
          <nav className="row">
            {user ? (
              <>
                <Link href="/account" className="who" title="Ο λογαριασμός μου">
                  <span className="avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span>
                  <span className="who-text">
                    <b>{user.name}</b>
                    <small>{user.type === 'coach' ? 'Προπονητής' : 'Προσωπικός λογαριασμός'}</small>
                  </span>
                </Link>
                <button className="btn" onClick={async () => { await logout(); window.location.assign('/'); }}>Αποσύνδεση</button>
              </>
            ) : (
              <>
                <span className="top-links">
                  <Link href="/#features">Λειτουργίες</Link>
                  <Link href="/#athletes">Για αθλούμενους</Link>
                  <Link href="/#pricing">Τιμές</Link>
                </span>
                <Link href="/login" className="btn ghost">Είσοδος</Link>
                <Link href="/signup" className="btn primary">
                  <span className="long">Δημιουργία λογαριασμού</span><span className="short">Εγγραφή</span>
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
