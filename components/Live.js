'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { wroteAnythingRecently, wroteRecently } from '@/lib/supabase';
import { callText } from '@/lib/calls';
import {
  announcePresence, getAthlete, getAthletePlans, getMyCoach, getSelfAthlete, listAllCheckins, listAllWeighIns, listAthletes, listInvites,
  listAthletePrefs, listMyGroups, listUnreadMessages, markMessagesRead, setAthletePref, listUnreadNotifications, markAthleteRead, onGroupMessages, onMessages, onNotification, onSignals, listCoachUpdates, clearCoachUpdate, onCoachUpdates,
  watchPresence,
} from '@/lib/storage';

const noop = () => {};
const EMPTY = {
  online: new Set(), unread: {}, unreadMsgs: {}, lastMsg: {}, lastEvent: null, athletes: null, self: null, coach: null,
  markRead: noop, clearMessages: noop, setOpenChat: noop, groups: null, clearGroup: noop, reloadGroups: noop,
  hasPlans: false, prefs: {}, setPref: noop, markAllRead: noop, markUnread: noop, reloadAthletes: noop,
  subscribe: () => noop, updates: {}, reloadSelf: noop,
};
const LiveContext = createContext(EMPTY);
export const useLive = () => useContext(LiveContext);

// Ζωντανά σήματα της βάσης (τι άλλαξε, για ποιον αθλούμενο/ομάδα), μία σύνδεση για όλη την εφαρμογή.
function useSignalHub(user) {
  const listeners = useRef(new Set());
  const subscribe = useCallback((fn) => { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; }, []);
  useEffect(() => {
    const emit = (s) => {
      // «Ηχώ» δικής μας αλλαγής (καταγραφές/ημερολόγιο/πρόγραμμα): η σελίδα την έχει ήδη — όχι επαναφόρτωση.
      if ((s.kind === 'data' || s.kind === 'plan') && s.actor === user.id && s.ref && wroteRecently(s.ref)) return;
      // Αθλούμενοι/προσκλήσεις/ομάδες: η ενέργεια αυτής της καρτέλας ήδη ανανέωσε ό,τι χρειάζεται.
      if ((s.kind === 'athlete' || s.kind === 'invite' || s.kind === 'group') && s.actor === user.id && wroteAnythingRecently()) return;
      listeners.current.forEach((fn) => fn(s));
    };
    // «*» = ξαναδιάβασε τα πάντα: μετά από διακοπή σύνδεσης ή όταν ο χρήστης ξαναγυρίζει στην καρτέλα
    // (για σιγουριά, αν κάτι χάθηκε όσο ήταν στο παρασκήνιο).
    let last = 0;
    const resync = () => { if (Date.now() - last < 2000) return; last = Date.now(); emit({ kind: '*' }); };
    const back = () => { if (document.visibilityState === 'visible') resync(); };
    const off = onSignals(user.id, emit, resync);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('online', resync);
    return () => {
      off();
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      window.removeEventListener('online', resync);
    };
  }, [user.id]);
  return subscribe;
}

// Για κάθε σελίδα/κομμάτι: ξαναδιαβάζει μόλις αλλάξει κάτι δικό του (από τον άλλον χρήστη), χωρίς refresh.
// kinds: 'athlete' | 'data' | 'plan' | 'invite' | 'group' (ή πίνακας) · ref: ο αθλούμενος/η ομάδα (προαιρετικό)
export function useSignal(kinds, ref, cb) {
  const { subscribe } = useLive();
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const key = [].concat(kinds).join(',');
  useEffect(() => {
    let t;
    const off = subscribe((s) => {
      if (s.kind !== '*' && (!key.split(',').includes(s.kind) || (ref && s.ref && s.ref !== ref))) return;
      clearTimeout(t);
      t = setTimeout(() => cbRef.current(s), 200); // πολλές αλλαγές μαζί → μία ανάγνωση
    });
    return () => { clearTimeout(t); off(); };
  }, [subscribe, key, ref]);
}

const countBy = (rows) => rows.reduce((m, r) => ({ ...m, [r.athleteId]: (m[r.athleteId] || 0) + 1 }), {});
const without = (m, key) => {
  if (!m[key]) return m;
  const { [key]: _, ...rest } = m;
  return rest;
};

// Μικρό μήνυμα κάτω δεξιά (σβήνει μόνο του).
function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast && (
    <Link
      href={toast.href} className="toast" role="status"
      onClick={(e) => { if (toast.onClick) { e.preventDefault(); toast.onClick(); } setToast(null); }}
    >
      <span className="toast-dot" aria-hidden="true" />
      <span><b>{toast.title}</b><small>{toast.text}</small></span>
    </Link>
  );
  return [setToast, node];
}

// Ειδοποίηση του υπολογιστή/κινητού, μόνο όταν η καρτέλα είναι στο παρασκήνιο (και την έχει επιτρέψει).
function systemNotify(title, body, href, tag) {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, icon: '/icon.svg', tag });
  n.onclick = () => { window.focus(); window.location.href = href; };
}

// Κείμενο μηνύματος για ειδοποιήσεις (σκέτη φωτογραφία → «Φωτογραφία»).
const preview = (m) => (m.call ? callText(m.call) : m.body ? (m.body.length > 70 ? `${m.body.slice(0, 70)}…` : m.body) : m.audio ? 'Φωνητικό μήνυμα' : 'Φωτογραφία');

// Αδιάβαστα μηνύματα ανά αθλούμενο + ζωντανή ενημέρωση. onIncoming: για κάθε νέο μήνυμα από τον άλλον.
// onOpen: όταν ανοίγει μια συνομιλία (π.χ. για να κλείσει το μήνυμα στην οθόνη).
function useMessages(user, onIncoming, onOpen) {
  const [unreadMsgs, setUnreadMsgs] = useState({});
  const [lastMsg, setLastMsg] = useState({}); // athleteId → τελευταίο μήνυμα
  const openChat = useRef(null); // ποια συνομιλία είναι ανοιχτή τώρα (αυτή τη διαβάζει ήδη)
  const incoming = useRef(onIncoming);
  incoming.current = onIncoming;

  const reloadUnread = useCallback(() => {
    listUnreadMessages(user.id).then((rows) => {
      setUnreadMsgs(countBy(rows));
      setLastMsg(Object.fromEntries(rows.map((m) => [m.athleteId, m])));
    }).catch(() => {});
  }, [user.id]);
  useEffect(() => {
    reloadUnread();
    return onMessages(null, (type, m) => {
      if (type !== 'INSERT') return;
      setLastMsg((l) => ({ ...l, [m.athleteId]: m }));
      if (m.sender === user.id || m.readAt) return; // (κλήση που έγινε: ήδη διαβασμένη)
      const open = openChat.current === m.athleteId;
      if (!open) setUnreadMsgs((u) => ({ ...u, [m.athleteId]: (u[m.athleteId] || 0) + 1 }));
      incoming.current?.(m, open);
    });
  }, [user.id, reloadUnread]);

  const clearMessages = useCallback((id) => setUnreadMsgs((u) => without(u, id)), []);
  const opened = useRef(onOpen);
  opened.current = onOpen;
  const setOpenChat = useCallback((id) => { openChat.current = id; if (id) opened.current?.(id); }, []);
  return { unreadMsgs, lastMsg, clearMessages, setOpenChat, openChat, reloadUnread };
}

// Οι ομάδες μου (προπονητής ή μέλος) με αδιάβαστα + ζωντανή ενημέρωση.
// openChat: ποια συνομιλία είναι ανοιχτή (από το useMessages) · onIncoming(μήνυμα, ομάδα, ανοιχτή)
function useGroups(user, openChat, onIncoming) {
  const [groups, setGroups] = useState(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const incoming = useRef(onIncoming);
  incoming.current = onIncoming;

  const reloadGroups = useCallback(
    () => listMyGroups().then(setGroups).catch(() => setGroups((g) => g ?? [])),
    []
  );

  // (Η πρώτη φόρτωση γίνεται από την ανανέωση ανά σελίδα στο CoachLive/PersonalLive.)
  useEffect(() => {
    return onGroupMessages(null, (type, m) => {
      const open = openChat.current === m.groupId;
      const mine = m.sender === user.id;
      const group = groupsRef.current?.find((g) => g.id === m.groupId);
      if (!group) { reloadGroups(); return; } // π.χ. μόλις με πρόσθεσαν σε ομάδα
      setGroups((list) => list
        .map((g) => (g.id !== m.groupId ? g : {
          ...g, lastBody: m.body, lastPhoto: !!m.photo, lastAt: m.createdAt, unread: mine || open ? g.unread : g.unread + 1,
        }))
        .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '')));
      if (!mine) incoming.current?.(m, group, open);
    });
  }, [user.id, reloadGroups, openChat]);

  const clearGroup = useCallback((id) => setGroups((list) => list?.map((g) => (g.id === id ? { ...g, unread: 0 } : g))), []);
  return { groups, reloadGroups, clearGroup };
}

// Για τον προπονητή: οι αθλούμενοί του, ποιοι είναι online, νέα check-in και νέα μηνύματα.
export function CoachLive({ user, children }) {
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;
  const [online, setOnline] = useState(() => new Set());
  const [unread, setUnread] = useState({}); // athleteId → πλήθος νέων check-in
  const [lastEvent, setLastEvent] = useState(null);
  const [athletes, setAthletes] = useState(null);
  const athletesRef = useRef(athletes);
  athletesRef.current = athletes;
  const [toast, toastNode] = useToast();
  const enabled = user.notifyCheckins;

  // Επιλογές ανά αθλούμενο (καρφίτσωμα, αγαπημένα, σίγαση, αρχείο, μη αναγνωσμένο).
  const [prefs, setPrefs] = useState({});
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => { listAthletePrefs().then(setPrefs).catch(() => {}); }, [user.id]);
  const setPref = useCallback(async (id, patch) => {
    setPrefs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    try { await setAthletePref(id, patch); } catch { listAthletePrefs().then(setPrefs).catch(() => {}); }
  }, []);
  const muted = (id) => !!prefsRef.current[id]?.muted;

  // Οι αθλούμενοι του προπονητή με τα δεδομένα τους (για τη λίστα και την επισκόπηση).
  // 4 αιτήματα συνολικά, όσους αθλούμενους κι αν έχει.
  const reloadAthletes = useCallback(async () => {
    const [list, checkins, weighIns, invites] = await Promise.all([
      listAthletes(), listAllCheckins(), listAllWeighIns(), listInvites(),
    ]);
    const byAthlete = (rows, id) => rows.filter((r) => r.athleteId === id);
    setAthletes(list
      .filter((a) => a.coachId === user.id) // όσοι προπονεί (συνδεδεμένοι ή όχι)
      .map((a) => {
        const c = byAthlete(checkins, a.id);
        const w = byAthlete(weighIns, a.id);
        return {
          ...a, checkins: c, weighIns: w,
          lastDate: [...c, ...w].map((x) => x.date).sort().pop() ?? null, // τελευταία καταγραφή ή ζύγισμα
          pending: invites.some((i) => i.athleteId === a.id && !i.usedAt && !i.revokedAt && !i.declinedAt && new Date(i.expiresAt) > new Date()),
          // Ο χρήστης απέρριψε την πρόσκληση (και δεν έχει σταλεί νέα από τότε).
          declined: invites.some((i) => i.athleteId === a.id && !i.usedAt && !i.revokedAt && i.declinedAt),
        };
      }));
  }, [user.id]);

  // Η λίστα φορτώνει όλες τις καταγραφές όλων, οπότε δεν την ξαναφορτώνουμε σε κάθε κλικ:
  //   αμέσως: στην αρχή, σε κάθε νέο check-in και όταν η εφαρμογή αλλάζει κάτι (refreshAthletes)
  //   αλλιώς: σε αλλαγή σελίδας ή επιστροφή στην εφαρμογή, μόνο αν πέρασε πάνω από 1 λεπτό
  const loadedAt = useRef(0);
  // Μία φόρτωση τη φορά: ό,τι ζητηθεί όσο φορτώνει (σήματα, ενέργειες, νέο check-in) μαζεύεται σε ΜΙΑ επόμενη.
  const loading = useRef(null);
  const again = useRef(false);
  const refreshAthletes = useCallback(() => {
    if (loading.current) { again.current = true; return loading.current; }
    loadedAt.current = Date.now();
    loading.current = reloadAthletes().catch(() => setAthletes((a) => a ?? [])).finally(() => {
      loading.current = null;
      if (again.current) { again.current = false; refreshAthletes(); }
    });
    return loading.current;
  }, [reloadAthletes]);
  useEffect(() => { refreshAthletes(); }, [refreshAthletes]);
  useEffect(() => {
    const stale = () => Date.now() - loadedAt.current > 60000;
    if (stale()) refreshAthletes();
    const back = () => { if (document.visibilityState === 'visible' && stale()) refreshAthletes(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [path, refreshAthletes]);

  useEffect(() => watchPresence(user.id, setOnline), [user.id]);

  // Ζωντανά: αποδοχή/απόρριψη προσκλήσεων, σύνδεση/διακοπή (και από τον αθλούμενο), όνομα, φωτογραφία,
  // νέες καταγραφές/βάρος/καθημερινά από τον αθλούμενο.
  const subscribe = useSignalHub(user);
  useEffect(() => {
    let t;
    const off = subscribe((s) => {
      if (s.kind === 'group' || s.kind === 'plan') return;
      clearTimeout(t);
      t = setTimeout(() => refreshAthletes(), 400);
    });
    return () => { clearTimeout(t); off(); };
  }, [subscribe, refreshAthletes]);

  const nameOf = async (id) =>
    athletesRef.current?.find((a) => a.id === id)?.name || (await getAthlete(id).catch(() => null))?.name || 'αθλούμενο';

  // Νέα check-in
  useEffect(() => {
    if (!enabled) { setUnread({}); return; }
    listUnreadNotifications().then((rows) => setUnread(countBy(rows))).catch(() => {});
    return onNotification(user.id, async (n) => {
      setLastEvent(n);
      const href = `/dashboard/athletes/${n.athleteId}`;
      const viewing = pathRef.current === href;
      if (viewing) markAthleteRead(n.athleteId).catch(() => {});
      else setUnread((u) => ({ ...u, [n.athleteId]: (u[n.athleteId] || 0) + 1 }));
      if (muted(n.athleteId)) return; // σίγαση για αυτόν τον αθλούμενο
      const name = await nameOf(n.athleteId);
      if (!viewing) toast({ title: 'Νέο check-in', text: `από ${name}`, href });
      systemNotify('Νέο check-in', `Από ${name}`, href, n.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, enabled]);

  // Νέα μηνύματα
  const msgs = useMessages(user, async (m, open) => {
    if (!user.notifyMessages || muted(m.athleteId)) return;
    const href = `/dashboard/athletes/${m.athleteId}?tab=chat`;
    const name = await nameOf(m.athleteId);
    if (!open) toast({ title: `Μήνυμα από ${name}`, text: preview(m), href });
    systemNotify(name, preview(m), href, m.id);
  }, () => toast(null));

  // Νέα μηνύματα ομάδας
  const grp = useGroups(user, msgs.openChat, (m, g, open) => {
    if (!user.notifyMessages) return;
    const href = `/dashboard/groups/${g.id}`;
    if (!open) toast({ title: `«${g.name}»`, text: preview(m), href });
    systemNotify(g.name, preview(m), href, m.id);
  });
  // Ανανέωση της λίστας ομάδων σε κάθε αλλαγή σελίδας (π.χ. μετά από νέα ομάδα ή διαγραφή).
  const inGroups = path.startsWith('/dashboard/groups');
  useEffect(() => { grp.reloadGroups(); }, [inGroups ? path : 'out', grp.reloadGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribe((s) => { if (s.kind === 'group' || s.kind === '*') grp.reloadGroups(); }), [subscribe, grp.reloadGroups]);
  // Μετά από διακοπή σύνδεσης/επιστροφή στην καρτέλα: αδιάβαστα μηνύματα και check-in από την αρχή.
  useEffect(() => subscribe((s) => {
    if (s.kind !== '*') return;
    msgs.reloadUnread();
    if (enabled) listUnreadNotifications().then((rows) => setUnread(countBy(rows))).catch(() => {});
  }), [subscribe, msgs.reloadUnread, enabled]);

  // Ο προπονητής άνοιξε τον αθλούμενο: τα νέα check-in διαβάστηκαν και φεύγει το «μη αναγνωσμένο».
  const markRead = useCallback((athleteId) => {
    setUnread((u) => without(u, athleteId));
    markAthleteRead(athleteId).catch(() => {});
    if (prefsRef.current[athleteId]?.markedUnread) setPref(athleteId, { markedUnread: false });
  }, [setPref]);
  // Από το μενού: «Επισήμανση ως αναγνωσμένο» = check-in + μηνύματα.
  const { clearMessages } = msgs;
  const markAllRead = useCallback((athleteId) => {
    markRead(athleteId);
    markMessagesRead(athleteId, user.id).then(() => clearMessages(athleteId)).catch(() => {});
  }, [markRead, clearMessages, user.id]);
  const markUnread = useCallback((athleteId) => setPref(athleteId, { markedUnread: true }), [setPref]);

  // Μετρούν μόνο όσοι είναι στη λίστα: ειδοποιήσεις από φάκελο που δεν προπονεί πια
  // (διακοπή, συγχώνευση, διαγραφή) δεν ανοίγουν πουθενά, άρα δεν φαίνονται.
  const mine = useMemo(() => new Set((athletes || []).map((a) => a.id)), [athletes]);
  const onlyMine = useCallback((m) => Object.fromEntries(Object.entries(m).filter(([id]) => mine.has(id))), [mine]);
  const shownUnread = useMemo(() => onlyMine(unread), [onlyMine, unread]);
  const shownMsgs = useMemo(() => onlyMine(msgs.unreadMsgs), [onlyMine, msgs.unreadMsgs]);

  return (
    <LiveContext.Provider value={{
      ...EMPTY, ...msgs, unreadMsgs: shownMsgs, ...grp, online, unread: shownUnread, lastEvent, markRead, athletes, reloadAthletes: refreshAthletes,
      prefs, setPref, markAllRead, markUnread, subscribe,
    }}>
      {children}
      {toastNode}
    </LiveContext.Provider>
  );
}

// Για τον αθλούμενο: ο φάκελός του, ο προπονητής του, «online» για τον προπονητή και νέα μηνύματα.
// Τι άλλαξε ο προπονητής σε κάθε ενότητα (για το μικρό μήνυμα).
const UPDATE_TEXT = {
  archive: 'Ενημέρωσε το αρχείο σου', weight: 'Ενημέρωσε το βάρος σου',
  daily: 'Ενημέρωσε τα καθημερινά σου', plan: 'Ενημέρωσε το πρόγραμμά σου',
};

export function PersonalLive({ user, view, onOpenView, onOpenChat, children }) {
  const [self, setSelf] = useState(null);
  const [coach, setCoach] = useState(null);
  const [toast, toastNode] = useToast();
  const path = usePathname();

  // Ξαναδιαβάζουμε σε κάθε αλλαγή σελίδας (π.χ. μόλις αποδεχτεί πρόσκληση ή διακόψει τη συνεργασία).
  const reloadSelf = useCallback(() => {
    getSelfAthlete(user).then(setSelf).catch(() => {});
    getMyCoach().then(setCoach).catch(() => {});
  }, [user]);
  useEffect(() => { reloadSelf(); }, [reloadSelf, path]);
  // Ζωντανά: σύνδεση/διακοπή προπονητή, όνομα/φωτογραφία του προπονητή, χωρίς ανανέωση.
  const subscribe = useSignalHub(user);
  useEffect(() => subscribe((s) => { if (s.kind === 'athlete' || s.kind === '*') reloadSelf(); }), [subscribe, reloadSelf]);

  // Όσο έχει ανοιχτή την εφαρμογή, ο προπονητής τον βλέπει online.
  const coachId = self?.linked ? self.coachId : null;

  // Πρόγραμμα από (πρώην) προπονητή: μένει ορατό και μετά τη διακοπή της συνεργασίας.
  const [hasPlans, setHasPlans] = useState(false);
  const selfId = self?.id;
  const selfLinked = !!self?.linked;
  useEffect(() => {
    if (!selfId) return setHasPlans(false);
    const check = () => getAthletePlans(selfId).then((p) => setHasPlans(!!(selfLinked || p.training || p.nutrition))).catch(() => {});
    check();
    // Ζωντανά: μόλις ο προπονητής ορίσει/αλλάξει πρόγραμμα, εμφανίζεται χωρίς ανανέωση.
    return subscribe((s) => { if (s.kind === 'plan' || s.kind === '*') check(); });
  }, [selfId, selfLinked, subscribe]);
  useEffect(() => (coachId ? announcePresence(coachId, self.id) : undefined), [coachId, self?.id]);

  const msgs = useMessages(user, (m, open) => {
    if (!user.notifyMessages) return;
    const title = `Μήνυμα από ${coach?.name || 'τον προπονητή σου'}`;
    if (!open) toast({ title, text: preview(m), href: '/dashboard', onClick: onOpenChat });
    systemNotify(title, preview(m), '/dashboard', m.id);
  }, () => toast(null));

  // Νέα μηνύματα ομάδας
  const grp = useGroups(user, msgs.openChat, (m, g, open) => {
    if (!user.notifyMessages) return;
    const href = `/dashboard/groups/${g.id}`;
    if (!open) toast({ title: `«${g.name}»`, text: preview(m), href });
    systemNotify(g.name, preview(m), href, m.id);
  });
  // Ανανέωση της λίστας ομάδων σε κάθε αλλαγή σελίδας (π.χ. μετά από νέα ομάδα ή διαγραφή).
  const inGroups = path.startsWith('/dashboard/groups');
  useEffect(() => { grp.reloadGroups(); }, [inGroups ? path : 'out', grp.reloadGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribe((s) => { if (s.kind === 'group' || s.kind === '*') grp.reloadGroups(); }), [subscribe, grp.reloadGroups]);
  useEffect(() => subscribe((s) => { if (s.kind === '*') msgs.reloadUnread(); }), [subscribe, msgs.reloadUnread]);

  // Αλλαγές του προπονητή ανά ενότητα: αριθμός στο μενού (όπως τα μηνύματα) + μικρό μήνυμα.
  const [updates, setUpdates] = useState({});
  const seen = useRef({ view, path, coach });
  seen.current = { view, path, coach };
  const looking = (section) => seen.current.path === '/dashboard' && seen.current.view === section && document.visibilityState === 'visible';
  const reloadUpdates = useCallback(() => listCoachUpdates().then(setUpdates).catch(() => {}), []);
  useEffect(() => {
    reloadUpdates();
    return onCoachUpdates(user.id, ({ section, count }) => {
      if (looking(section)) { clearCoachUpdate(section).catch(() => {}); return; } // το βλέπει ήδη, ενημερώνεται ζωντανά
      setUpdates((u) => ({ ...u, [section]: count }));
      const title = seen.current.coach?.name || 'Ο προπονητής σου';
      toast({ title, text: UPDATE_TEXT[section], href: '/dashboard', onClick: () => onOpenView?.(section) });
      systemNotify(title, UPDATE_TEXT[section], '/dashboard', 'update-' + section);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, reloadUpdates]);
  useEffect(() => subscribe((s) => { if (s.kind === '*') reloadUpdates(); }), [subscribe, reloadUpdates]);
  // Άνοιξε την ενότητα (ή ξαναγύρισε στην καρτέλα με την ενότητα ανοιχτή): διαβάστηκε.
  useEffect(() => {
    const clear = () => {
      if (!updates[view] || !looking(view)) return;
      setUpdates((u) => without(u, view));
      clearCoachUpdate(view).catch(() => {});
    };
    clear();
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, path, updates]);

  return (
    <LiveContext.Provider value={{ ...EMPTY, ...msgs, ...grp, self, coach: self?.linked ? coach : null, hasPlans, subscribe, updates, reloadSelf }}>
      {children}
      {toastNode}
    </LiveContext.Provider>
  );
}
