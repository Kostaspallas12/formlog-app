'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/AuthContext';
import LogoMark from './Logo';
import { BackspaceIcon, LockIcon } from './Icons';

// Κλείδωμα εφαρμογής με PIN 4 ψηφίων, ανά συσκευή.
// Στη συσκευή μένει μόνο ένα «αποτύπωμα» (SHA-256 με τυχαίο salt), όχι το ίδιο το PIN.
// Κλειδώνει όταν ανοίγει η εφαρμογή και όταν επιστρέφεις μετά από τον χρόνο που διάλεξες.
const LEN = 4;
const MAX_FAILS = 5;
export const LOCK_AFTER = [
  { min: 0, label: 'Αμέσως' },
  { min: 1, label: 'Μετά από 1 λεπτό' },
  { min: 5, label: 'Μετά από 5 λεπτά' },
  { min: 15, label: 'Μετά από 15 λεπτά' },
];

const key = (uid) => `formlog:lock:${uid}`;
const SEEN = 'formlog:lock:seen'; // πότε ήταν τελευταία ανοιχτή (μόνο για αυτή την καρτέλα)
const read = (uid) => { try { return JSON.parse(localStorage.getItem(key(uid))) || null; } catch { return null; } };
const write = (uid, cfg) => { try { cfg ? localStorage.setItem(key(uid), JSON.stringify(cfg)) : localStorage.removeItem(key(uid)); } catch {} };
const seenAt = () => { try { return Number(sessionStorage.getItem(SEEN)) || 0; } catch { return 0; } };
const markSeen = () => { try { sessionStorage.setItem(SEEN, String(Date.now())); } catch {} };

async function digest(salt, pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const newSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

const LockContext = createContext({ enabled: false, after: 1, lockNow: () => {}, setPin: async () => {}, verify: async () => false, disable: () => {}, setAfter: () => {} });
export const useAppLock = () => useContext(LockContext);

export function AppLockProvider({ user, children }) {
  const { logout } = useAuth();
  const [cfg, setCfg] = useState(() => (typeof window === 'undefined' ? null : read(user.id)));
  const [locked, setLocked] = useState(false);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // Στην αρχή: κλειδωμένο, εκτός αν η καρτέλα ήταν ανοιχτή μόλις πριν (π.χ. ανανέωση σελίδας).
  useEffect(() => {
    const c = read(user.id);
    setCfg(c);
    if (c && Date.now() - seenAt() > c.after * 60000) setLocked(true);
  }, [user.id]);

  // Όταν φεύγει από την καρτέλα/εφαρμογή κρατάμε την ώρα· όταν γυρίζει, κλειδώνει αν πέρασε ο χρόνος.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') markSeen(); };
    const back = () => {
      const c = cfgRef.current;
      if (document.visibilityState === 'visible' && c && Date.now() - seenAt() > c.after * 60000) setLocked(true);
    };
    const onHide = () => markSeen();
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  const verify = useCallback(async (pin) => {
    const c = cfgRef.current;
    return !!c && (await digest(c.salt, pin)) === c.hash;
  }, []);
  const save = (c) => { write(user.id, c); setCfg(c); };
  const setPin = async (pin) => {
    const salt = newSalt();
    save({ salt, hash: await digest(salt, pin), after: cfgRef.current?.after ?? 1, fails: 0 });
    markSeen();
  };
  const disable = () => { save(null); setLocked(false); };
  const setAfter = (after) => cfgRef.current && save({ ...cfgRef.current, after });
  const lockNow = () => { if (cfgRef.current) setLocked(true); };

  const unlock = async (pin) => {
    if (await verify(pin)) {
      save({ ...cfgRef.current, fails: 0 });
      markSeen();
      setLocked(false);
      return { ok: true };
    }
    const fails = (cfgRef.current.fails || 0) + 1;
    if (fails >= MAX_FAILS) { await forgot(); return { ok: false, out: true }; }
    save({ ...cfgRef.current, fails });
    return { ok: false, left: MAX_FAILS - fails };
  };
  // Ξέχασα το PIN (ή πολλές λάθος προσπάθειες): αποσύνδεση· με νέα σύνδεση ορίζεις νέο PIN.
  const forgot = async () => {
    write(user.id, null);
    await logout();
    window.location.assign('/login');
  };

  return (
    <LockContext.Provider value={{ enabled: !!cfg, after: cfg?.after ?? 1, lockNow, setPin, verify, disable, setAfter }}>
      {children}
      {locked && <LockScreen name={user.name} onUnlock={unlock} onForgot={forgot} />}
    </LockContext.Provider>
  );
}

// Οθόνη κλειδώματος: λογότυπο, τελείες PIN, πληκτρολόγιο (και από το πληκτρολόγιο του υπολογιστή).
function LockScreen({ name, onUnlock, onForgot }) {
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(0);
  const submit = async (pin) => {
    const r = await onUnlock(pin);
    if (r.ok || r.out) return true;
    setShake((s) => s + 1);
    setMsg(r.left === 1 ? 'Λάθος PIN. Τελευταία προσπάθεια πριν την αποσύνδεση.' : `Λάθος PIN. Απομένουν ${r.left} προσπάθειες.`);
    return false;
  };
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return createPortal(
    <div className="lock" role="dialog" aria-modal="true" aria-label="Το FormLog είναι κλειδωμένο">
      <div className="lock-box">
        <LogoMark size={52} />
        <h2>Καλώς ήρθες, {name}</h2>
        <p className="lock-hint">Βάλε το PIN σου</p>
        <PinPad onDone={submit} shake={shake} autoFocus />
        <p className="lock-msg" role="alert">{msg}</p>
        <button type="button" className="lock-forgot" onClick={onForgot}>Ξέχασες το PIN; Αποσύνδεση</button>
      </div>
    </div>,
    document.body,
  );
}

// Τελείες + πληκτρολόγιο αριθμών. onDone(pin) → true αν έγινε δεκτό (αλλιώς καθαρίζει).
export function PinPad({ onDone, shake = 0, autoFocus = false }) {
  const [pin, setPin] = useState('');
  const pinRef = useRef('');
  const busy = useRef(false);
  const update = (v) => { pinRef.current = v; setPin(v); };
  const press = useCallback((d) => {
    if (busy.current) return;
    if (d === 'back') { update(pinRef.current.slice(0, -1)); return; }
    const next = (pinRef.current + d).slice(0, LEN);
    update(next);
    if (next.length < LEN) return;
    busy.current = true;
    setTimeout(async () => {
      const ok = await onDone(next);
      busy.current = false;
      if (!ok) update('');
    }, 120);
  }, [onDone]);
  useEffect(() => { update(''); }, [shake]);
  useEffect(() => {
    if (!autoFocus) return undefined;
    const key = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [press, autoFocus]);

  return (
    <div className="pin">
      <div className={`pin-dots${shake ? ' shake' : ''}`} key={shake} aria-label={`${pin.length} από ${LEN} ψηφία`}>
        {Array.from({ length: LEN }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <div className="pin-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((d, i) => (d === '' ? <span key={i} /> : (
          <button key={i} type="button" className={d === 'back' ? 'pin-key back' : 'pin-key'} onClick={() => press(d)} aria-label={d === 'back' ? 'Διαγραφή' : d}>
            {d === 'back' ? <BackspaceIcon size={22} /> : d}
          </button>
        )))}
      </div>
    </div>
  );
}

// Παράθυρο ρύθμισης: νέο PIN (δύο φορές) · αλλαγή/απενεργοποίηση ζητούν πρώτα το τωρινό.
export function PinDialog({ mode, onClose }) {
  const { setPin, verify, disable } = useAppLock();
  const [step, setStep] = useState(mode === 'set' ? 'new' : 'current');
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(0);
  const wrong = (text) => { setMsg(text); setShake((s) => s + 1); return false; };

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const done = async (pin) => {
    if (step === 'current') {
      if (!(await verify(pin))) return wrong('Λάθος PIN.');
      if (mode === 'disable') { disable(); onClose(true); return true; }
      setMsg(''); setStep('new'); return false;
    }
    if (step === 'new') { setFirst(pin); setMsg(''); setStep('repeat'); return false; }
    if (pin !== first) { setStep('new'); setFirst(''); return wrong('Τα δύο PIN δεν ταιριάζουν. Ξεκίνα ξανά.'); }
    await setPin(pin);
    onClose(true);
    return true;
  };

  const title = step === 'current' ? 'Βάλε το τωρινό PIN' : step === 'new' ? 'Διάλεξε PIN 4 ψηφίων' : 'Ξαναβάλε το PIN';
  return createPortal(
    <div className="confirm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-box pin-dialog">
        <span className="confirm-icon"><LockIcon /></span>
        <p className="confirm-text">{title}</p>
        <PinPad key={step} onDone={done} shake={shake} autoFocus />
        <p className="lock-msg" role="alert">{msg}</p>
        <div className="confirm-actions"><button type="button" className="btn" onClick={() => onClose()}>Ακύρωση</button></div>
      </div>
    </div>,
    document.body,
  );
}
