'use client';

import { useEffect, useState } from 'react';
import { useLive, useSignal } from '@/components/Live';
import { LOCK_AFTER, PinDialog, useAppLock } from '@/components/AppLock';
import Select from '@/components/Select';
import { confirmDialog } from '@/components/Confirm';
import { useRequireUser } from '@/lib/useAuthRedirect';
import { MIN_PASSWORD, useAuth } from '@/lib/AuthContext';
import { buildExportZip, exportFileName } from '@/lib/exportZip';
import { AccountSkeleton } from '@/components/Skeletons';
import PaneHead from '@/components/PaneHead';
import AvatarPicker from '@/components/AvatarPicker';
import { LogoutIcon } from '@/components/Icons';
import { disconnectCoach, getMyCoach } from '@/lib/storage';
import { fmtDate } from '@/lib/utils';
import { useWallpaper, WALLPAPERS } from '@/lib/wallpaper';
import { THEMES, useTheme } from '@/lib/theme';

export default function AccountPage() {
  const { user, ready, deleteAccount, logout, updateAvatar, removeAvatar } = useRequireUser();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const head = (
    <PaneHead
      title="Λογαριασμός"
      actions={<button className="btn" onClick={async () => { await logout(); window.location.assign('/'); }}><LogoutIcon size={18} /><span>Αποσύνδεση</span></button>}
    />
  );
  if (!ready || !user) return <>{head}<div className="pane-narrow"><AccountSkeleton /></div></>;

  // Δικαίωμα πρόσβασης/φορητότητας: ZIP με φωτογραφίες, CSV και JSON.
  const download = async () => {
    setExporting(true);
    try {
      const blob = await buildExportZip(user);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  };

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await deleteAccount(password);
    setBusy(false);
    if (res.error) return setError(res.error);
    // Πλήρης φόρτωση της αρχικής, ώστε να μην προλάβει η σελίδα να στείλει στην είσοδο.
    window.location.replace('/');
  };

  return (
    <>
      {head}
      <div className="pane-narrow">

      <section className="panel account-block avatar-block">
        <AvatarPicker avatar={user.avatar} name={user.name} size={72} onPick={updateAvatar} onRemove={user.avatar ? removeAvatar : null} />
        <div>
          <h2>Φωτογραφία προφίλ</h2>
          <p>Μια φωτογραφία που σε αντιπροσωπεύει.</p>
        </div>
      </section>

      <section className="panel account-block">
        <h2>Στοιχεία</h2>
        <div className="settings">
          <NameRow />
          <EmailRow />
          <PasswordRow />
          <div className="setting">
            <div className="setting-head">
              <div><span className="setting-label">Τύπος λογαριασμού</span><b>{user.type === 'coach' ? 'Προπονητής' : 'Προσωπική χρήση'}</b></div>
            </div>
          </div>
        </div>
      </section>

      {user.type === 'personal' && <CoachSection />}
      <NotifySection />
      <LockSection />
      <AppearanceSection />

      <section className="panel account-block">
        <h2>Λήψη των δεδομένων μου</h2>
        <p>
          Κατέβασε ένα αρχείο ZIP με όλα όσα έχεις αποθηκεύσει: τις φωτογραφίες σου ως κανονικές εικόνες, τις
          καταγραφές σε αρχείο πίνακα (CSV) και όλα τα στοιχεία του λογαριασμού. Χρήσιμο και ως αντίγραφο ασφαλείας.
        </p>
        <button className="btn" onClick={download} disabled={exporting}>
          {exporting ? 'Προετοιμασία...' : 'Λήψη δεδομένων'}
        </button>
      </section>

      <section className="panel account-block danger-block">
        <h2>Διαγραφή λογαριασμού</h2>
        <p>
          Σβήνει οριστικά τον λογαριασμό και όλες τις φωτογραφίες, καταγραφές και {user.type === 'coach' ? 'φακέλους αθλούμενων' : 'μετρήσεις'}.
          Δεν μπορεί να αναιρεθεί. Αν θες να τα κρατήσεις, κάνε πρώτα «Λήψη δεδομένων».
        </p>
        {!confirming ? (
          <button className="btn danger" onClick={() => setConfirming(true)}>Διαγραφή λογαριασμού</button>
        ) : (
          <form onSubmit={remove}>
            <label className="f">
              Γράψε τον κωδικό σου για επιβεβαίωση
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required autoFocus
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row">
              <button type="button" className="btn" onClick={() => { setConfirming(false); setPassword(''); setError(''); }}>
                Ακύρωση
              </button>
              <button type="submit" className="btn danger-solid" disabled={busy}>
                {busy ? 'Διαγραφή...' : 'Οριστική διαγραφή'}
              </button>
            </div>
          </form>
        )}
      </section>
      </div>
    </>
  );
}

/* ---------- Γραμμές ρυθμίσεων: τιμή + «Αλλαγή» που ανοίγει μια μικρή φόρμα ---------- */

// Κοινή λογική: άνοιγμα/κλείσιμο, αποθήκευση, μήνυμα λάθους ή επιτυχίας.
function Setting({ label, value, success, onSave, children }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await onSave();
    setBusy(false);
    if (res.error) return setError(res.error);
    setError('');
    setOpen(false);
    setSaved(true);
  };

  return (
    <div className="setting">
      <div className="setting-head">
        <div>
          <span className="setting-label">{label}</span>
          <b>{value}</b>
          {saved && !open && <span className="saved" role="status">✓ {success}</span>}
        </div>
        {!open && (
          <button className="btn small" onClick={() => { setOpen(true); setSaved(false); }}>Αλλαγή</button>
        )}
      </div>
      {open && (
        <form className="setting-form" onSubmit={submit}>
          {children}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            <button type="button" className="btn" onClick={() => { setOpen(false); setError(''); }}>Ακύρωση</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function NameRow() {
  const { user, updateName } = useAuth();
  const [name, setName] = useState(user.name);
  return (
    <Setting label="Όνομα" value={user.name} success="Αποθηκεύτηκε" onSave={() => updateName(name)}>
      <label className="f">
        Νέο όνομα
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
      </label>
    </Setting>
  );
}

function EmailRow() {
  const { user, changeEmail } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <Setting
      label="Email" value={user.email}
      success={`Στείλαμε email επιβεβαίωσης στο ${newEmail}. Το email αλλάζει μόλις πατήσεις τον σύνδεσμο.`}
      onSave={async () => {
        const res = await changeEmail({ newEmail, password });
        if (res.ok) setPassword('');
        return res;
      }}
    >
      <label className="f">
        Νέο email
        <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" required autoFocus />
      </label>
      <label className="f">
        Κωδικός (για επιβεβαίωση)
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
    </Setting>
  );
}

function PasswordRow() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <Setting
      label="Κωδικός" value="••••••••" success="Ο κωδικός άλλαξε"
      onSave={async () => {
        if (next !== confirm) return { error: 'Οι δύο νέοι κωδικοί δεν ταιριάζουν.' };
        const res = await changePassword({ current, next });
        if (res.ok) { setCurrent(''); setNext(''); setConfirm(''); }
        return res;
      }}
    >
      <label className="f">
        Τρέχων κωδικός
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus />
      </label>
      <label className="f">
        Νέος κωδικός
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        <small>Τουλάχιστον {MIN_PASSWORD} χαρακτήρες</small>
      </label>
      <label className="f">
        Επανάληψη νέου κωδικού
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </label>
    </Setting>
  );
}

/* ---------- Ειδοποιήσεις ---------- */

function NotifySection() {
  const { user, setNotify } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Ειδοποιήσεις του υπολογιστή/κινητού όταν η καρτέλα είναι στο παρασκήνιο.
  const [perm, setPerm] = useState(null);
  useEffect(() => { setPerm('Notification' in window ? Notification.permission : 'unsupported'); }, []);

  const rows = [
    user.type === 'coach' && { kind: 'checkins', label: 'Νέο check-in από αθλούμενο', on: user.notifyCheckins },
    { kind: 'messages', label: 'Νέο μήνυμα', on: user.notifyMessages },
  ].filter(Boolean);

  const toggle = async (row) => {
    setBusy(true);
    const res = await setNotify(row.kind, !row.on);
    setBusy(false);
    setError(res.error || '');
  };

  return (
    <section className="panel account-block">
      <h2>Ειδοποιήσεις</h2>
      <div className="settings">
        {rows.map((row) => (
          <div className="setting" key={row.kind}>
            <div className="setting-head">
              <div><b>{row.label}</b></div>
              <button
                type="button" role="switch" aria-checked={row.on} className="switch" disabled={busy}
                onClick={() => toggle(row)} aria-label={`Ειδοποιήσεις: ${row.label}`}
              />
            </div>
          </div>
        ))}
        {error && <p className="error" role="alert">{error}</p>}
        {rows.some((r) => r.on) && perm && perm !== 'unsupported' && (
          <div className="setting">
            <div className="setting-head">
              <div>
                <b>Ειδοποίηση και όταν δεν κοιτάς το FormLog</b>
                <span className="setting-label">
                  {perm === 'granted' ? 'Ενεργή σε αυτή τη συσκευή' : perm === 'denied' ? 'Μπλοκαρισμένη από τον browser' : 'Ανενεργή σε αυτή τη συσκευή'}
                </span>
              </div>
              {perm === 'default' && (
                <button className="btn small" onClick={() => Notification.requestPermission().then(setPerm)}>Ενεργοποίηση</button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Κλείδωμα εφαρμογής (PIN σε αυτή τη συσκευή) ---------- */

function LockSection() {
  const lock = useAppLock();
  const [dialog, setDialog] = useState(null); // 'set' | 'change' | 'disable'
  // Από το μενού «Κλείδωμα εφαρμογής» χωρίς PIN: ανοίγει κατευθείαν η ρύθμιση.
  useEffect(() => {
    if (window.location.hash !== '#lock') return;
    document.getElementById('lock')?.scrollIntoView({ block: 'center' });
    if (!lock.enabled) setDialog('set');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel account-block" id="lock">
      <h2>Κλείδωμα εφαρμογής</h2>
      <div className="settings">
        <div className="setting">
          <div className="setting-head">
            <div>
              <b>Κλείδωμα με PIN</b>
              <span className="setting-label">{lock.enabled ? 'Ενεργό σε αυτή τη συσκευή' : 'Ανενεργό σε αυτή τη συσκευή'}</span>
            </div>
            <button
              type="button" role="switch" aria-checked={lock.enabled} className="switch" aria-label="Κλείδωμα με PIN"
              onClick={() => setDialog(lock.enabled ? 'disable' : 'set')}
            />
          </div>
        </div>
        {lock.enabled && (
          <>
            <div className="setting">
              <div className="setting-head">
                <div><b>Κλείδωμα όταν φεύγεις</b></div>
                <Select
                  label="Κλείδωμα όταν φεύγεις" value={lock.after} onChange={lock.setAfter}
                  options={LOCK_AFTER.map((o) => ({ value: o.min, label: o.label }))}
                />
              </div>
            </div>
            <div className="setting">
              <div className="setting-head">
                <div><b>PIN</b><span className="setting-label">••••</span></div>
                <button type="button" className="btn small" onClick={() => setDialog('change')}>Αλλαγή</button>
              </div>
            </div>
          </>
        )}
      </div>
      {dialog && <PinDialog mode={dialog} onClose={() => setDialog(null)} />}
    </section>
  );
}

/* ---------- Εμφάνιση: θέμα και φόντο συνομιλίας (σε αυτή τη συσκευή) ---------- */

function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  const [wall, setWall] = useWallpaper();
  return (
    <section className="panel account-block">
      <h2>Εμφάνιση</h2>
      <div className="settings">
        <div className="setting">
          <div className="setting-head">
            <div><b>Θέμα</b></div>
            <div className="seg theme-seg" role="group" aria-label="Θέμα">
              {THEMES.map((t) => (
                <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="setting">
          <span className="setting-label">Φόντο συνομιλίας</span>
          <div className="walls" role="radiogroup" aria-label="Φόντο συνομιλίας">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id} type="button" role="radio" aria-checked={wall === w.id}
                className={`wall-pick${wall === w.id ? ' on' : ''}`} onClick={() => setWall(w.id)}
              >
                <span className={`wall-swatch wall-${w.id}`} aria-hidden="true">
                  <i className="wall-bubble" /><i className="wall-bubble mine" />
                </span>
                <span className="wall-name">{w.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Προπονητής (για τον αθλούμενο) ---------- */

function CoachSection() {
  const { reloadSelf } = useLive();
  const [coach, setCoach] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { getMyCoach().then(setCoach).catch(() => setCoach(null)); }, []);
  // Ζωντανά: ο προπονητής διέκοψε τη συνεργασία ή άλλαξε όνομα.
  useSignal('athlete', null, () => getMyCoach().then(setCoach).catch(() => {}));

  if (coach === undefined) return null;

  const stop = async () => {
    if (!(await confirmDialog(`Διακοπή συνεργασίας με «${coach.name}»; Ο φάκελος και όλα τα δεδομένα μένουν σε σένα· ο προπονητής δεν θα έχει πια πρόσβαση.`))) return;
    setBusy(true);
    try {
      await disconnectCoach(coach.athleteId);
      reloadSelf(); // η εφαρμογή κρύβει αμέσως Συνομιλία/προπονητή
      setCoach(null);
      setMsg('Η συνεργασία διακόπηκε. Τα δεδομένα σου είναι όλα εδώ.');
    } catch {
      setMsg('Κάτι πήγε στραβά. Δοκίμασε ξανά.');
    }
    setBusy(false);
  };

  return (
    <section className="panel account-block">
      <h2>Προπονητής</h2>
      {coach ? (
        <>
          <p>
            Συνεργάζεσαι με <b>{coach.name}</b>{coach.since ? ` από ${fmtDate(coach.since.slice(0, 10))}` : ''}. Βλέπει και
            καταχωρεί στον φάκελό σου φωτογραφίες, βάρος και καθημερινά.
          </p>
          <button className="btn danger" onClick={stop} disabled={busy}>Διακοπή συνεργασίας</button>
        </>
      ) : (
        <p>Δεν συνεργάζεσαι με προπονητή. Αν σου στείλει πρόσκληση, άνοιξε τον σύνδεσμο που σου έδωσε.</p>
      )}
      {msg && <p className="wl-ok" role="status">{msg}</p>}
    </section>
  );
}
