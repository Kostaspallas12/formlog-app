'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { getLastUser } from '@/lib/lastUser';
import AthleteSidebar from './AthleteSidebar';
import LogoMark from './Logo';
import { AppLockProvider } from './AppLock';
import Photo from './Photo';
import GroupSidebar from './GroupSidebar';
import { CoachLive, PersonalLive, useLive } from './Live';
import { CallProvider } from './Calls';
import { ArchiveIcon, ChatIcon, DailyIcon, GroupsIcon, LogoutIcon, PlanIcon, UserIcon, UsersIcon, WeightIcon } from './Icons';

// Οι ενότητες του χώρου ενός αθλούμενου.
// (Τα id μένουν ίδια με πριν: σε αυτά δένουν οι ειδοποιήσεις ανά ενότητα.)
export const VIEWS = [
  { id: 'archive', label: 'Πρόοδος', Icon: ArchiveIcon }, // φωτογραφίες + σύγκριση
  { id: 'weight', label: 'Βάρος', Icon: WeightIcon },
  { id: 'daily', label: 'Ημερολόγιο', Icon: DailyIcon }, // ύπνος, νερό, θερμίδες, βήματα, προπόνηση
];
// Συνομιλία με τον προπονητή / τον αθλούμενο (μόνο όταν είναι συνδεδεμένοι).
export const CHAT_VIEW = { id: 'chat', label: 'Συνομιλία', Icon: ChatIcon };
// Πρόγραμμα προπόνησης/διατροφής από τον προπονητή (μόνο όταν υπάρχει προπονητής).
export const PLAN_VIEW = { id: 'plan', label: 'Πρόγραμμα', Icon: PlanIcon };
// Ομάδες του προπονητή στις οποίες ανήκει ο αθλούμενος.
export const GROUPS_VIEW = { id: 'groups', label: 'Ομάδες', Icon: GroupsIcon };

// Ποια ενότητα έχει διαλέξει ο προσωπικός χρήστης από το πλαϊνό μενού.
const ViewContext = createContext(null);
export const useAppView = () => useContext(ViewContext);
const VIEW_KEY = 'formlog:view';

// Διάταξη τύπου εφαρμογής μηνυμάτων:
//   υπολογιστής: στενή στήλη με εικονίδια αριστερά · (προπονητής: λίστα αθλούμενων) · περιεχόμενο
//   κινητό: μπάρα κάτω · ο προπονητής βλέπει ή τη λίστα ή έναν αθλούμενο (με «πίσω»)
export default function AppShell({ children }) {
  const { user } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [view, setViewState] = useState('archive');
  const [lastType, setLastType] = useState(null);

  useEffect(() => {
    setLastType(getLastUser()?.type ?? null);
    try {
      const v = sessionStorage.getItem(VIEW_KEY);
      if ([...VIEWS, PLAN_VIEW, CHAT_VIEW].some((x) => x.id === v)) setViewState(v);
    } catch {}
  }, []);

  const setView = (v) => {
    setViewState(v);
    try { sessionStorage.setItem(VIEW_KEY, v); } catch {}
    if (path !== '/dashboard') router.push('/dashboard');
    window.scrollTo(0, 0);
  };

  const coach = (user?.type ?? lastType) === 'coach';
  const body = (
    <ViewContext.Provider value={{ view, setView }}>
      {user ? <CallProvider user={user}><Shell coach={coach}>{children}</Shell></CallProvider> : <Shell coach={coach}>{children}</Shell>}
    </ViewContext.Provider>
  );
  if (!user) return body;
  return (
    <AppLockProvider user={user}>
      {coach
        ? <CoachLive user={user}>{body}</CoachLive>
        : <PersonalLive user={user} view={view} onOpenView={setView} onOpenChat={() => setView('chat')}>{body}</PersonalLive>}
    </AppLockProvider>
  );
}

function Shell({ coach, children }) {
  const { user, logout } = useAuth();
  const { view, setView } = useAppView();
  const { unread, unreadMsgs, coach: myCoach, groups, hasPlans, updates } = useLive();
  const path = usePathname();

  const onAccount = path.startsWith('/account');
  const withList = coach && !onAccount;
  const onGroups = path.startsWith('/dashboard/groups'); // ενότητα «Ομάδες» (ενότητα ομάδων)
  const paneOpen = path.startsWith('/dashboard/athletes/') || path.startsWith('/dashboard/groups/') || path.startsWith('/dashboard/starred');
  const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  const groupUnread = (groups || []).reduce((a, g) => a + g.unread, 0);
  const [listW, setListW] = useListWidth();

  const groupsItem = { ...GROUPS_VIEW, href: '/dashboard/groups', active: onGroups, badge: groupUnread };
  const nav = coach
    ? [
      { id: 'athletes', label: 'Αθλούμενοι', Icon: UsersIcon, href: '/dashboard', active: !onAccount && !onGroups, badge: total(unread) + total(unreadMsgs) },
      groupsItem,
    ]
    : [
      ...[...VIEWS, ...(myCoach || hasPlans ? [PLAN_VIEW] : []), ...(myCoach ? [CHAT_VIEW] : [])].map((v) => ({
        ...v, active: !onAccount && !onGroups && view === v.id, onClick: () => setView(v.id),
        badge: v.id === 'chat' ? total(unreadMsgs) : (updates[v.id] || 0), // αλλαγές του προπονητή
      })),
      ...(groups?.length ? [groupsItem] : []),
    ];

  return (
    <div className={`shell${withList ? ' with-list' : ''}${paneOpen ? ' pane-open' : ''}`} style={listW ? { '--list-w': `${listW}px` } : undefined}>
      <nav className={`rail${nav.length > 5 ? ' crowded' : ''}`} aria-label="Μενού">
        <Link href="/dashboard" className="rail-logo" aria-label="FormLog"><LogoMark size={40} /></Link>
        {nav.map(({ id, label, Icon, href, active, onClick, badge }) => {
          const inner = (
            <>
              <span className="rail-icon">
                <Icon />
                {badge > 0 && <span className="badge" aria-label={`${badge} νέα`}>{badge > 99 ? '99+' : badge}</span>}
              </span>
              <span className="rail-label">{label}</span>
            </>
          );
          return href ? (
            <Link key={id} href={href} className="rail-item" aria-current={active ? 'page' : undefined}>{inner}</Link>
          ) : (
            <button key={id} type="button" className="rail-item" aria-current={active ? 'page' : undefined} onClick={onClick}>{inner}</button>
          );
        })}
        <span className="rail-spacer" />
        <Link href="/account" className="rail-item rail-account" aria-current={onAccount ? 'page' : undefined} title={user?.name}>
          <span className="rail-icon">
            {user?.avatar ? <Photo id={user.avatar} alt="" className="avatar" /> : user ? <span className="avatar">{user.name.charAt(0).toUpperCase()}</span> : <UserIcon />}
          </span>
          <span className="rail-label">Λογαριασμός</span>
        </Link>
        <button type="button" className="rail-item rail-logout" title="Αποσύνδεση" onClick={async () => { await logout(); window.location.assign('/'); }}>
          <span className="rail-icon"><LogoutIcon /></span>
          <span className="rail-label">Έξοδος</span>
        </button>
      </nav>

      {withList && (onGroups ? <GroupSidebar /> : <AthleteSidebar />)}
      {withList && <ListResizer width={listW} onChange={setListW} />}

      <main className="pane">{children}</main>
    </div>
  );
}

/* ---------- Πλάτος της λίστας αθλούμενων (σύρεται, όπως σε μια εφαρμογή μηνυμάτων) ---------- */

const LIST_KEY = 'formlog:listWidth';
const LIST_DEFAULT = 360;
const LIST_MIN = 260;
const LIST_MAX = 560;
const RAIL = 80; // πλάτος της στήλης με τα εικονίδια
const clampW = (w) => Math.round(Math.min(LIST_MAX, Math.max(LIST_MIN, w)));

// Το πλάτος που διάλεξε ο χρήστης, αποθηκευμένο σε αυτόν τον browser.
function useListWidth() {
  const [w, setW] = useState(null); // null: το προκαθορισμένο της CSS
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(LIST_KEY));
      if (v) setW(clampW(v));
    } catch {}
  }, []);
  const save = (next) => {
    setW(next);
    try {
      if (next) localStorage.setItem(LIST_KEY, String(next));
      else localStorage.removeItem(LIST_KEY);
    } catch {}
  };
  return [w, save];
}

// Η «λαβή» στη δεξιά άκρη της λίστας: σύρσιμο = αλλαγή πλάτους, διπλό κλικ = επαναφορά,
// και με το πληκτρολόγιο (βελάκια) όταν είναι επιλεγμένη.
function ListResizer({ width, onChange }) {
  const [drag, setDrag] = useState(false);
  const current = width ?? LIST_DEFAULT;

  const start = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
  };
  const move = (e) => { if (drag) onChange(clampW(e.clientX - RAIL)); };
  const stop = () => setDrag(false);
  const key = (e) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(clampW(current - step)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(clampW(current + step)); }
  };

  return (
    <div
      className={`list-resizer${drag ? ' dragging' : ''}`} style={{ left: RAIL + current - 5 }}
      role="separator" aria-orientation="vertical" aria-label="Πλάτος λίστας αθλούμενων"
      aria-valuenow={current} aria-valuemin={LIST_MIN} aria-valuemax={LIST_MAX} tabIndex={0}
      title="Σύρε για αλλαγή πλάτους · διπλό κλικ για επαναφορά"
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
      onDoubleClick={() => onChange(null)} onKeyDown={key}
    />
  );
}
