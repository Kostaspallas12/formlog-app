'use client';

import { useEffect, useState } from 'react';
import { useGuard } from '@/lib/useGuard';
import { useRouter } from 'next/navigation';
import { useRequireUser } from '@/lib/useAuthRedirect';
import { createGroup } from '@/lib/storage';
import PaneHead from '@/components/PaneHead';
import { AthleteAvatar } from '@/components/AthleteSidebar';
import { useLive } from '@/components/Live';

// Νέα ομάδα (μόνο για προπονητές): όνομα και μέλη από τους συνδεδεμένους αθλούμενους.
export default function NewGroupPage() {
  const { user } = useRequireUser();
  const router = useRouter();
  const { athletes } = useLive();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.type !== 'coach') router.replace('/dashboard');
  }, [user, router]);

  const linked = (athletes || []).filter((a) => a.linked);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const guard = useGuard();
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Γράψε ένα όνομα για την ομάδα.');
    setBusy(true);
    setError('');
    try {
      const id = await createGroup(name, picked);
      router.push(`/dashboard/groups/${id}`);
    } catch {
      setError('Η ομάδα δεν δημιουργήθηκε. Δοκίμασε ξανά.');
      setBusy(false);
    }
  };

  return (
    <>
      <PaneHead title="Νέα ομάδα" backHref="/dashboard/groups" />
      {user?.type === 'coach' && (
        <form className="panel group-form" onSubmit={guard(submit)}>
          <label className="f">
            Όνομα ομάδας
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="π.χ. Ομάδα Κυριακής" required autoFocus />
          </label>

          <p className="athlete-photos-label">Μέλη {picked.length > 0 && `(${picked.length})`}</p>
          {linked.length > 0 ? (
            <div className="pick-list">
              {linked.map((a) => (
                <label key={a.id} className="pick" data-on={picked.includes(a.id)}>
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />
                  <AthleteAvatar athlete={a} />
                  <span>{a.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="meta pick-empty">Δεν έχεις ακόμα συνδεδεμένους αθλούμενους. Μπορείς να τους προσθέσεις αργότερα.</p>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <div className="row end">
            <button type="button" className="btn" onClick={() => router.push('/dashboard/groups')}>Ακύρωση</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Δημιουργία...' : 'Δημιουργία ομάδας'}</button>
          </div>
        </form>
      )}
    </>
  );
}
