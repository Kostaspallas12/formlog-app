import Link from 'next/link';
import LogoMark from '@/components/Logo';

export const metadata = { title: 'Δεν βρέθηκε · FormLog' };

// Η σελίδα «δεν βρέθηκε» (404), στα ελληνικά και με το λογότυπο.
export default function NotFound() {
  return (
    <main className="wrap not-found">
      <LogoMark size={64} />
      <p className="not-found-code">404</p>
      <h1>Η σελίδα δεν βρέθηκε</h1>
      <p className="not-found-text">Ο σύνδεσμος μπορεί να είναι λάθος ή η σελίδα να μην υπάρχει πια.</p>
      <div className="row">
        <Link href="/" className="btn primary">Αρχική σελίδα</Link>
        <Link href="/dashboard" className="btn">Η εφαρμογή μου</Link>
      </div>
    </main>
  );
}
