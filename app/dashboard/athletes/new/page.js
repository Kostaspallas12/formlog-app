'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireUser } from '@/lib/useAuthRedirect';
import AthleteForm from '@/components/AthleteForm';
import PaneHead from '@/components/PaneHead';
import { useLive } from '@/components/Live';

// Νέος αθλούμενος (μόνο για προπονητές). Μετά την προσθήκη πάμε κατευθείαν στον αθλούμενο,
// όπου είναι έτοιμος ο σύνδεσμος πρόσκλησης.
export default function NewAthletePage() {
  const { user } = useRequireUser();
  const router = useRouter();
  const { reloadAthletes } = useLive();

  useEffect(() => {
    if (user && user.type !== 'coach') router.replace('/dashboard');
  }, [user, router]);

  return (
    <>
      <PaneHead title="Νέος αθλούμενος" backHref="/dashboard" />
      {user?.type === 'coach' && (
        <AthleteForm
          onCancel={() => router.push('/dashboard')}
          onDone={(athlete, inviteProblem) => { reloadAthletes(); router.push(`/dashboard/athletes/${athlete.id}${inviteProblem ? `?invite=${inviteProblem}` : ''}`); }}
        />
      )}
    </>
  );
}
