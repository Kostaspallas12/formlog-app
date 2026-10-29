'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { acceptInvite, inviteInfo, listAthletes, listCheckins } from '@/lib/storage';

const ERRORS = {
  invalid: 'Αυτός ο σύνδεσμος δεν είναι έγκυρος.',
  used: 'Αυτή η πρόσκληση έχει ήδη χρησιμοποιηθεί.',
  expired: 'Αυτή η πρόσκληση έχει λήξει.',
  revoked: 'Αυτή η πρόσκληση ακυρώθηκε.',
  email_mismatch: 'Αυτή η πρόσκληση είναι για άλλο email. Μπες με το email που έδωσες στον προπονητή σου.',
  already_coached: 'Έχεις ήδη προπονητή. Για να συνδεθείς με νέο, διέκοψε πρώτα την τρέχουσα συνεργασία από «Ο λογαριασμός μου».',
  not_personal: 'Οι λογαριασμοί προπονητή δεν μπορούν να συνδεθούν ως αθλούμενοι.',
  own_invite: 'Αυτή είναι δική σου πρόσκληση· στείλ’ την στον αθλούμενο.',
};

const errorText = (e) => {
  const key = Object.keys(ERRORS).find((k) => e?.message?.includes(k));
  return key ? ERRORS[key] : 'Κάτι πήγε στραβά. Δοκίμασε ξανά.';
};

// Η σελίδα που ανοίγει ο αθλούμενος από τον σύνδεσμο του προπονητή του.
export default function JoinPage() {
  const { token } = useParams();
  const router = useRouter();
  const { user, ready } = useAuth();
  const [info, setInfo] = useState(undefined); // undefined: φορτώνει
  const [existing, setExisting] = useState(0); // καταγραφές που έχει ήδη ο χρήστης
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inviteInfo(token).then(setInfo).catch(() => setInfo({ status: 'invalid' }));
  }, [token]);

  // Αν έχει ήδη προσωπικό αρχείο, του λέμε ότι θα μπει στον κοινό φάκελο.
  useEffect(() => {
    if (!user || user.type !== 'personal') return;
    listAthletes()
      .then((list) => list.find((a) => a.self && a.owner === user.id))
      .then((me) => (me ? listCheckins(me.id) : []))
      .then((c) => setExisting(c.length))
      .catch(() => {});
  }, [user]);

  const next = encodeURIComponent(`/join/${token}`);

  const accept = async () => {
    if (!agree) return setError('Για να συνεχίσεις, χρειάζεται να αποδεχτείς.');
    setBusy(true);
    setError('');
    try {
      await acceptInvite(token);
      router.replace('/dashboard');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  let body;
  if (info === undefined || !ready) {
    body = <p className="auth-sub">Φόρτωση...</p>;
  } else if (info.status !== 'valid') {
    body = (
      <>
        <p className="auth-sub">{ERRORS[info.status] ?? ERRORS.invalid}</p>
        <p className="meta">Ζήτα από τον προπονητή σου νέο σύνδεσμο.</p>
      </>
    );
  } else if (!user) {
    body = (
      <>
        <p className="auth-sub">
          Θα κάνεις τα check-in σου εδώ (φωτογραφίες, βάρος, καθημερινά) και ο/η <b>{info.coachName}</b> θα βλέπει την
          πρόοδό σου και θα σου γράφει το πλάνο.
        </p>
        {info.emailLocked && <p className="meta">Η πρόσκληση είναι για το email που έδωσες στον προπονητή σου.</p>}
        <div className="join-actions">
          <Link className="btn primary big full" href={`/signup?next=${next}`}>Δημιουργία λογαριασμού</Link>
          <Link className="btn big full" href={`/login?next=${next}`}>Έχω ήδη λογαριασμό</Link>
        </div>
      </>
    );
  } else if (user.type !== 'personal') {
    body = <p className="auth-sub">{ERRORS.not_personal}</p>;
  } else {
    body = (
      <>
        <p className="auth-sub">Συνδέεσαι ως <b>{user.email}</b>.</p>
        {existing > 0 && (
          <p className="join-note">
            Έχεις ήδη {existing} {existing === 1 ? 'καταγραφή' : 'καταγραφές'} στο FormLog. Θα μπουν στον κοινό φάκελο και
            θα τις βλέπει και ο/η {info.coachName}.
          </p>
        )}
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            Αποδέχομαι ο/η <b>{info.coachName}</b> να βλέπει και να καταχωρεί στον φάκελό μου φωτογραφίες σώματος, βάρος
            και καθημερινά στοιχεία. Μπορώ να διακόψω τη συνεργασία οποιαδήποτε στιγμή.
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big full" onClick={accept} disabled={busy}>
          {busy ? 'Σύνδεση...' : 'Αποδοχή και σύνδεση'}
        </button>
      </>
    );
  }

  return (
    <main className="wrap">
      <div className="auth">
        <span className="pill">Πρόσκληση</span>
        <h1 className="join-title">
          {info?.status === 'valid' ? <>Ο/Η {info.coachName} σε προσκαλεί στο FormLog</> : 'Πρόσκληση στο FormLog'}
        </h1>
        {body}
      </div>
    </main>
  );
}
