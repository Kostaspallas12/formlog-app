'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

// Η αρχική είναι για επισκέπτες. Όποιος είναι συνδεδεμένος (π.χ. μόλις πάτησε τον
// σύνδεσμο επιβεβαίωσης στο email του) πηγαίνει κατευθείαν στο αρχείο του.
export default function HomeRedirect() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace('/dashboard');
  }, [ready, user, router]);

  return null;
}
