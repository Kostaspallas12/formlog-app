'use client';

import { useCallback, useEffect, useState } from 'react';
import { acceptInvite, declineInvite, listMyInvites } from '@/lib/storage';
import { UsersIcon } from './Icons';
import { useLive, useSignal } from './Live';

// Προσκλήσεις προπονητή που αφορούν εμένα (σαν «αίτημα φιλίας»): Αποδοχή / Απόρριψη μέσα στην εφαρμογή.
export default function PendingInvites() {
  const [list, setList] = useState([]);
  const { coach } = useLive(); // έχει ήδη προπονητή: η πρόσκληση δεν γίνεται δεκτή πριν διακόψει
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => listMyInvites().then(setList).catch(() => {}), []);
  useEffect(() => {
    load();
    // Μόλις ξαναγυρίσει στην εφαρμογή (π.χ. μετά από σύνδεση), ελέγχει ξανά.
    const back = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, [load]);
  // Ζωντανά: νέα (ή ακυρωμένη) πρόσκληση από προπονητή, χωρίς refresh.
  useSignal('invite', null, load);

  if (!list.length) return null;

  const accept = async (inv) => {
    setBusy(inv.token);
    setError('');
    try {
      await acceptInvite(inv.token);
      // Μετά τη σύνδεση αλλάζει ο φάκελος/προπονητής — πλήρης φόρτωση για να ενημερωθούν όλα.
      window.location.assign('/dashboard');
    } catch (e) {
      setBusy('');
      const msg = e?.message || '';
      setError(
        /already_coached/.test(msg)
          ? 'Έχεις ήδη προπονητή. Για να συνδεθείς με νέο, διέκοψε πρώτα την τωρινή συνεργασία (Λογαριασμός → Προπονητής).'
          : /not_personal/.test(msg)
            ? 'Οι λογαριασμοί προπονητή δεν συνδέονται ως αθλούμενοι.'
            : 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
      );
    }
  };

  const decline = async (inv) => {
    setBusy(inv.token);
    try {
      await declineInvite(inv.token);
      setList((l) => l.filter((x) => x.token !== inv.token));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="invites">
      {list.map((inv) => (
        <div className="invite-card" key={inv.token}>
          <span className="invite-ic" aria-hidden="true"><UsersIcon size={22} /></span>
          <div className="invite-body">
            <b>Ο/Η {inv.coachName} σε προσκαλεί να γίνεις αθλούμενός του</b>
            <small>{coach
              ? `Συνεργάζεσαι ήδη με τον/την ${coach.name}. Για να αποδεχτείς, διέκοψε πρώτα την τωρινή συνεργασία (Λογαριασμός → Προπονητής).`
              : 'Πατώντας «Αποδοχή» συμφωνείς να βλέπει και να καταχωρεί στον φάκελό σου φωτογραφίες, βάρος και καθημερινά. Μπορείς να διακόψεις όποτε θες.'}</small>
          </div>
          <div className="invite-acts">
            <button type="button" className="btn" disabled={busy === inv.token} onClick={() => decline(inv)}>Απόρριψη</button>
            {!coach && (
              <button type="button" className="btn primary" disabled={busy === inv.token} onClick={() => accept(inv)}>
                {busy === inv.token ? '...' : 'Αποδοχή'}
              </button>
            )}
          </div>
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
