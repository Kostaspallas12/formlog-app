import Link from 'next/link';
import { SITE } from '@/lib/site';
import LogoMark from './Logo';

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-grid">
        <div className="foot-brand">
          <span className="logo small"><LogoMark size={25} /> {SITE.name}</span>
          <p className="meta">Το αρχείο της προόδου σου.</p>
        </div>
        <nav className="foot-col" aria-label="Εφαρμογή">
          <b>Εφαρμογή</b>
          <Link href="/#features">Λειτουργίες</Link>
          <Link href="/#athletes">Για αθλούμενους</Link>
          <Link href="/#pricing">Τιμές</Link>
          <Link href="/#faq">Συχνές ερωτήσεις</Link>
        </nav>
        <nav className="foot-col" aria-label="Νομικά">
          <b>Νομικά</b>
          <Link href="/privacy">Πολιτική απορρήτου</Link>
          <Link href="/terms">Όροι χρήσης</Link>
        </nav>
        <div className="foot-col">
          <b>Επικοινωνία</b>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </div>
      </div>
      <div className="wrap foot-bottom meta">© {new Date().getFullYear()} {SITE.name}</div>
    </footer>
  );
}
