'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createInvite, INVITE_ERROR_TEXT, inviteErrorCode, listInvites, revokeInvite } from '@/lib/storage';
import { fmtDate } from '@/lib/utils';
import Menu from './Menu';
import { LinkIcon, UsersIcon } from './Icons';
import { useLive, useSignal } from './Live';

// Για τον προπονητή, σε αθλούμενο που δεν έχει συνδεθεί ακόμα:
//   με email  → η πρόσκληση φτάνει μέσα στην εφαρμογή («στάλθηκε»)
//   χωρίς email → σύνδεσμος να τον στείλει μόνος του (για νέο χρήστη)
export default function CoachLink({ athlete, problem = null }) {
  const { reloadAthletes } = useLive();
  const [invites, setInvites] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(problem && INVITE_ERROR_TEXT[problem] ? { type: 'error', text: INVITE_ERROR_TEXT[problem] } : null);

  const reload = useCallback(async () => {
    const all = await listInvites();
    setInvites(all.filter((i) => i.athleteId === athlete.id));
  }, [athlete.id]);
  useEffect(() => { reload().catch(() => setInvites([])); }, [reload]);
  // Ζωντανά: ο χρήστης αποδέχτηκε/απέρριψε την πρόσκληση.
  useSignal('invite', athlete.id, () => reload().catch(() => {}));

  const running = useRef(false); // διπλό πάτημα = μία πρόσκληση

  if (!invites) return null;

  const active = invites.find((i) => !i.usedAt && !i.revokedAt && !i.declinedAt && new Date(i.expiresAt) > new Date());
  const declined = !active && invites.some((i) => !i.usedAt && !i.revokedAt && i.declinedAt);
  const link = active && `${window.location.origin}/join/${active.token}`;

  const run = async (fn, ok) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await reload();
      reloadAthletes();
      if (ok) setMsg({ type: 'ok', text: ok });
    } catch (e) {
      setMsg({ type: 'error', text: INVITE_ERROR_TEXT[inviteErrorCode(e)] || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.' });
    }
    running.current = false;
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg({ type: 'ok', text: 'Αντιγράφηκε. Στείλ’ τον στον αθλούμενο με μήνυμα ή email.' });
    } catch {
      setMsg({ type: 'error', text: 'Δεν έγινε αντιγραφή. Επίλεξε τον σύνδεσμο και αντέγραψέ τον.' });
    }
  };

  const menu = (extra = []) => (
    <Menu
      label="Επιλογές πρόσκλησης"
      items={[
        ...extra,
        { label: 'Ακύρωση πρόσκλησης', danger: true, onClick: () => run(() => revokeInvite(athlete.id), 'Η πρόσκληση ακυρώθηκε.') },
      ]}
    />
  );

  let body;
  if (active && active.email) {
    // Στάλθηκε μέσα στην εφαρμογή.
    body = (
      <>
        <span className="invite-icon"><UsersIcon size={20} /></span>
        <div className="invite-text">
          <b>Η πρόσκληση στάλθηκε</b>
          <span className="meta">
            Ο/Η {athlete.name} θα τη δει στην εφαρμογή με το <b>{active.email}</b> και θα την αποδεχτεί. Λήγει {fmtDate(active.expiresAt.slice(0, 10))}.
          </span>
        </div>
        <div className="invite-actions">
          {menu([
            { label: 'Αποστολή ξανά', onClick: () => run(() => createInvite(athlete.id, active.email), 'Η πρόσκληση στάλθηκε ξανά.') },
            { label: 'Αντιγραφή συνδέσμου', onClick: copy },
          ])}
        </div>
      </>
    );
  } else if (active) {
    // Χωρίς email: σύνδεσμος για χειροκίνητη αποστολή.
    body = (
      <>
        <span className="invite-icon"><LinkIcon size={20} /></span>
        <div className="invite-text">
          <b>Σύνδεσμος πρόσκλησης</b>
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Σύνδεσμος πρόσκλησης" />
          <span className="meta">Λήγει {fmtDate(active.expiresAt.slice(0, 10))} · μιας χρήσης</span>
        </div>
        <div className="invite-actions">
          <button className="btn primary small" onClick={copy}>Αντιγραφή</button>
          {menu([{ label: 'Νέος σύνδεσμος', onClick: () => run(() => createInvite(athlete.id, ''), 'Βγήκε νέος σύνδεσμος· ο παλιός δεν ισχύει πια.') }])}
        </div>
      </>
    );
  } else {
    // Καμία ενεργή πρόσκληση: στείλε.
    body = (
      <>
        <span className="invite-icon"><UsersIcon size={20} /></span>
        <form className="invite-text invite-new" onSubmit={(e) => { e.preventDefault(); run(() => createInvite(athlete.id, email.trim()), email.trim() ? 'Η πρόσκληση στάλθηκε.' : 'Ο σύνδεσμος είναι έτοιμος.'); }}>
          <b>{declined ? 'Απέρριψε την πρόσκληση' : 'Σύνδεση αθλούμενου'}</b>
          <div className="invite-new-row">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email αθλούμενου" aria-label="Email αθλούμενου" />
            <button className="btn primary small" type="submit" disabled={busy}>Αποστολή πρόσκλησης</button>
          </div>
          <span className="meta">Με email, η πρόσκληση φτάνει μέσα στην εφαρμογή. Χωρίς, θα πάρεις σύνδεσμο να του στείλεις.</span>
        </form>
      </>
    );
  }

  return (
    <section className="invite-bar">
      {body}
      {msg && <p className={`invite-msg ${msg.type === 'error' ? 'error' : 'wl-ok'}`} role="status">{msg.text}</p>}
    </section>
  );
}
