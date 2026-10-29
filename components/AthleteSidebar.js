'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { fmtDate, fmtSince } from '@/lib/utils';
import Photo from './Photo';
import {
  ArchiveBoxIcon, BackIcon, BellOffIcon, CheckIcon, ChevronIcon, CloseIcon, GroupsIcon, LockIcon, LogoutIcon, MoreIcon, PinIcon, PlusIcon,
  ReadAllIcon, SearchIcon, SelectIcon, StarIcon,
} from './Icons';
import { markGroupRead } from '@/lib/storage';
import { callText } from '@/lib/calls';
import { useAuth } from '@/lib/AuthContext';
import { confirmDialog } from './Confirm';
import PopMenu from './PopMenu';
import { useAppLock } from './AppLock';
import AthleteRowMenu from './AthleteRowMenu';
import { useLive } from './Live';

// Check-in που περιμένουν τον έλεγχο του προπονητή (μόνο για συνδεδεμένους αθλούμενους).
export const toReview = (a) => (a.linked ? (a.checkins || []).filter((c) => !c.reviewedAt).length : 0);

// Φίλτρα: τα δύο πρώτα φαίνονται πάντα, τα υπόλοιπα στο «▾» (όπως σε μια εφαρμογή μηνυμάτων).
const FILTERS = [
  { id: 'all', label: 'Όλοι' },
  { id: 'unread', label: 'Μη αναγνωσμένα' },
  { id: 'favorite', label: 'Αγαπημένοι' },
];
const MORE_FILTERS = [
  { id: 'review', label: 'Προς έλεγχο' },
  { id: 'groups', label: 'Ομάδες' },
  { id: 'pending', label: 'Αναμένουν' },
];

// Φωτογραφία του αθλούμενου (η πιο πρόσφατη) ή το αρχικό του σε κύκλο.
export function AthleteAvatar({ athlete, online = false }) {
  return (
    <span className={`chat-pic${online ? ' online' : ''}`} title={online ? 'Online' : undefined}>
      {athlete.avatar
        ? <Photo id={athlete.avatar} alt="" className="chat-avatar" />
        : <span className="chat-avatar initial">{athlete.name.charAt(0).toUpperCase()}</span>}
    </span>
  );
}

// Η λίστα αθλούμενων του προπονητή (σαν τις συνομιλίες μιας εφαρμογής μηνυμάτων):
// πρώτα οι καρφιτσωμένοι, μετά όσοι έχουν κάτι νέο, μετά όσοι έστειλαν πιο πρόσφατα.
// Κάθε γραμμή έχει μενού (βελάκι, δεξί κλικ ή παρατεταμένο πάτημα στο κινητό).
export default function AthleteSidebar() {
  const path = usePathname();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState(null); // { athlete, at, hasNew }
  const { online, unread, unreadMsgs, lastMsg, athletes, prefs, groups, setPref, markAllRead, clearGroup } = useLive();
  const router = useRouter();
  const { logout } = useAuth();
  const lock = useAppLock();
  const [headMenu, setHeadMenu] = useState(null); // { x, y }
  const closeHeadMenu = useCallback(() => setHeadMenu(null), []);
  // Επιλογή πολλών αθλούμενων μαζί (για ενέργειες σε όλους).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const stopSelect = useCallback(() => { setSelecting(false); setSelected(new Set()); }, []);
  const toggle = (id) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => {
    if (!selecting) return undefined;
    const esc = (e) => { if (e.key === 'Escape') stopSelect(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [selecting, stopSelect]);
  const news = (id) => (unread[id] || 0) + (unreadMsgs[id] || 0);
  const pref = (id) => prefs[id] || {};
  // Τελευταία κίνηση: καταγραφή, ζύγισμα ή μήνυμα.
  const activity = (a) => [a.lastDate, lastMsg[a.id]?.createdAt].filter(Boolean).sort().pop() || '';
  const closeMenu = useCallback(() => setMenu(null), []);

  const q = query.trim().toLocaleLowerCase('el');
  const archived = (athletes || []).filter((a) => pref(a.id).archived);
  const shown = (athletes || [])
    .filter((a) =>
      !!pref(a.id).archived === showArchived &&
      (!q || a.name.toLocaleLowerCase('el').includes(q)) &&
      (filter === 'all'
        || (filter === 'unread' && (news(a.id) > 0 || pref(a.id).markedUnread))
        || (filter === 'favorite' && pref(a.id).favorite)
        || (filter === 'pending' && !a.linked && a.pending)
        || (filter === 'review' && toReview(a) > 0)))
    .sort((a, b) =>
      (pref(b.id).pinned ? 1 : 0) - (pref(a.id).pinned ? 1 : 0) ||
      (news(b.id) || pref(b.id).markedUnread ? 1 : 0) - (news(a.id) || pref(a.id).markedUnread ? 1 : 0) ||
      activity(b).localeCompare(activity(a)) ||
      (b.createdAt || '').localeCompare(a.createdAt || ''));

  // Όλα ως αναγνωσμένα: αθλούμενοι (check-in, μηνύματα, «μη αναγνωσμένο») και ομάδες.
  const readEverything = () => {
    (athletes || []).filter((a) => news(a.id) > 0 || pref(a.id).markedUnread).forEach((a) => markAllRead(a.id));
    (groups || []).filter((g) => g.unread > 0).forEach((g) => markGroupRead(g.id).then(() => clearGroup(g.id)).catch(() => {}));
  };
  const signOut = async () => {
    if (!(await confirmDialog({ text: 'Αποσύνδεση από το FormLog;', confirmLabel: 'Αποσύνδεση' }))) return;
    await logout();
    window.location.assign('/');
  };

  return (
    <aside className="list">
      <div className="list-head">
        {selecting ? (
          <h2 className="list-back">
            <button type="button" className="icon-btn" onClick={stopSelect} aria-label="Τέλος επιλογής"><CloseIcon /></button>
            {selected.size ? `${selected.size} ${selected.size === 1 ? 'επιλεγμένος' : 'επιλεγμένοι'}` : 'Επιλογή'}
          </h2>
        ) : showArchived ? (
          <h2 className="list-back">
            <button type="button" className="icon-btn" onClick={() => setShowArchived(false)} aria-label="Πίσω"><BackIcon /></button>
            Αρχειοθετημένοι
          </h2>
        ) : (
          <h2>Αθλούμενοι{athletes?.length > 0 && <span className="list-count">{athletes.length}</span>}</h2>
        )}
        {!selecting && (
          <div className="list-head-acts">
            <button
              type="button" className="icon-btn" aria-label="Περισσότερα" title="Περισσότερα" aria-expanded={!!headMenu}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHeadMenu(headMenu ? null : { x: r.right, y: r.bottom + 6 }); }}
            >
              <MoreIcon />
            </button>
            <Link href="/dashboard/athletes/new" className="icon-btn round primary" aria-label="Προσθήκη αθλούμενου" title="Προσθήκη αθλούμενου">
              <PlusIcon />
            </Link>
          </div>
        )}
      </div>

      <label className="list-search">
        <SearchIcon size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Αναζήτηση" aria-label="Αναζήτηση αθλούμενου" />
      </label>
      {selecting ? (
        <SelectBar ids={[...selected]} prefs={prefs} setPref={setPref} markAllRead={markAllRead} onDone={stopSelect} />
      ) : !showArchived && (
        <div className="list-filters">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
          <MoreFilters value={filter} onChange={setFilter} />
        </div>
      )}

      {/* Όπως σε μια εφαρμογή μηνυμάτων: οι αρχειοθετημένοι σε μία γραμμή πάνω από τη λίστα */}
      {!showArchived && archived.length > 0 && filter !== 'groups' && (
        <button type="button" className="chat archived-row" onClick={() => setShowArchived(true)}>
          <span className="chat-pic archived-icon"><ArchiveBoxIcon size={22} /></span>
          <span className="chat-body"><span className="chat-top"><b>Αρχειοθετημένοι</b><small>{archived.length}</small></span></span>
        </button>
      )}

      {!athletes ? (
        <div role="status" aria-label="Φόρτωση">
          {[0, 1, 2, 3].map((i) => (
            <div className="chat" key={i}>
              <span className="sk chat-avatar" />
              <span className="chat-body"><span className="sk" style={{ width: '60%', height: 14 }} /><span className="sk" style={{ width: '40%', height: 12, marginTop: 6 }} /></span>
            </div>
          ))}
        </div>
      ) : athletes.length === 0 ? (
        <div className="list-empty">
          <p>Δεν έχεις αθλούμενους ακόμα.</p>
          <Link href="/dashboard/athletes/new" className="btn primary">Προσθήκη αθλούμενου</Link>
        </div>
      ) : filter === 'groups' ? (
        // Φίλτρο «Ομάδες»: οι ομάδες μέσα στην ίδια λίστα (όπως σε μια εφαρμογή μηνυμάτων)
        <nav className="chats">
          {(groups || []).filter((g) => !q || g.name.toLocaleLowerCase('el').includes(q)).map((g) => (
            <GroupRow key={g.id} group={g} active={path === `/dashboard/groups/${g.id}`} />
          ))}
          {groups?.length === 0 && (
            <div className="list-empty">
              <p>Δεν έχεις ομάδες ακόμα.</p>
              <Link href="/dashboard/groups/new" className="btn primary">Νέα ομάδα</Link>
            </div>
          )}
        </nav>
      ) : shown.length === 0 ? (
        <p className="list-empty">Κανένα αποτέλεσμα.</p>
      ) : (
        <nav className="chats">
          {shown.map((a) => (
            <AthleteRow
              key={a.id} athlete={a} active={path === `/dashboard/athletes/${a.id}`}
              online={a.linked && online.has(a.id)} unread={news(a.id)} pref={pref(a.id)}
              message={unreadMsgs[a.id] ? lastMsg[a.id] : null} date={activity(a).slice(0, 10)}
              toChat={!!unreadMsgs[a.id] && !unread[a.id]}
              onMenu={(at) => setMenu({ athlete: a, at, hasNew: news(a.id) > 0 })}
              selecting={selecting} checked={selected.has(a.id)} onToggle={() => toggle(a.id)}
            />
          ))}
        </nav>
      )}

      {menu && <AthleteRowMenu key={menu.athlete.id} {...menu} onClose={closeMenu} />}
      {headMenu && (
        <PopMenu
          at={headMenu} align="right" onClose={closeHeadMenu} label="Περισσότερα"
          items={[
            { Icon: GroupsIcon, label: 'Νέα ομάδα', run: () => router.push('/dashboard/groups/new') },
            { Icon: StarIcon, label: 'Μηνύματα με αστέρι', run: () => router.push('/dashboard/starred') },
            { Icon: SelectIcon, label: 'Επιλογή αθλούμενων', run: () => { setShowArchived(false); setSelecting(true); } },
            { Icon: ReadAllIcon, label: 'Όλα ως αναγνωσμένα', run: readEverything },
            'sep',
            { Icon: LockIcon, label: 'Κλείδωμα εφαρμογής', run: () => (lock.enabled ? lock.lockNow() : router.push('/account#lock')) },
            { Icon: LogoutIcon, label: 'Αποσύνδεση', run: signOut },
          ]}
        />
      )}
    </aside>
  );
}

// Το «▾» με τα υπόλοιπα φίλτρα. Μένει πάντα μικρό· όταν είναι επιλεγμένο ένα από αυτά, γίνεται πράσινο.
// Το μενού του ανοίγει πάντα ολόκληρο μέσα στην οθόνη (δεν κόβεται από την άκρη της λίστας).
function MoreFilters({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const current = MORE_FILTERS.find((f) => f.id === value);

  useLayoutEffect(() => {
    if (!open) return;
    const b = btn.current.getBoundingClientRect();
    const w = menu.current.offsetWidth;
    // Στοιχισμένο στη δεξιά άκρη του ▾, για να μην ξεχειλίζει πάνω στο περιεχόμενο.
    const left = Math.max(8, Math.min(b.right - w, window.innerWidth - w - 8));
    setPos({ top: b.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const out = (e) => { if (!ref.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', out);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <div className="chip-more" ref={ref}>
      <button
        ref={btn} type="button" className="chip" aria-pressed={!!current} aria-expanded={open}
        aria-label={current ? `Φίλτρο: ${current.label}` : 'Περισσότερα φίλτρα'} title={current?.label}
        onClick={() => { setPos(null); setOpen((o) => !o); }}
      >
        <ChevronIcon size={16} />
      </button>
      {open && createPortal((
        <div className="chip-menu" role="menu" ref={menu} style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
          {MORE_FILTERS.map((f) => (
            <button
              key={f.id} type="button" role="menuitemradio" aria-checked={value === f.id}
              onClick={() => { onChange(value === f.id ? 'all' : f.id); setOpen(false); }}
            >
              {f.label}
            </button>
          ))}
        </div>
      ), document.body)}
    </div>
  );
}

function AthleteRow({ athlete, active, online, unread, pref, message, date, toChat, onMenu, selecting, checked, onToggle }) {
  const sub = !athlete.linked && athlete.pending
    ? 'Δεν αποδέχτηκε ακόμα'
    : !athlete.linked && athlete.declined
      ? 'Απέρριψε την πρόσκληση'
      : athlete.lastDate
        ? 'Τελευταία ' + fmtSince(athlete.lastDate)
        : 'Καμία καταγραφή';
  const isNew = unread > 0 || pref.markedUnread;

  // Παρατεταμένο πάτημα (κινητό) = μενού, χωρίς να ανοίξει ο αθλούμενος.
  const press = useRef({ timer: null, opened: false });
  const touchStart = (e) => {
    const t = e.touches[0];
    press.current.opened = false;
    press.current.timer = setTimeout(() => { press.current.opened = true; onMenu({ x: t.clientX, y: t.clientY }); }, 500);
  };
  const touchEnd = () => clearTimeout(press.current.timer);

  return (
    <div className="chat-row">
      <Link
        href={`/dashboard/athletes/${athlete.id}${toChat ? '?tab=chat' : ''}`} className="chat" aria-current={active ? 'page' : undefined}
        onContextMenu={(e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}
        onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchMove={touchEnd}
        onClick={(e) => {
          if (selecting) { e.preventDefault(); onToggle(); return; } // σε επιλογή: το πάτημα επιλέγει
          if (press.current.opened) { e.preventDefault(); press.current.opened = false; }
        }}
        aria-pressed={selecting ? checked : undefined}
      >
        <span className="chat-pick-wrap">
          <AthleteAvatar athlete={athlete} online={online} />
          {selecting && <span className={`chat-check${checked ? ' on' : ''}`} aria-hidden="true">{checked && <CheckIcon size={14} strokeWidth="3" />}</span>}
        </span>
        <span className="chat-body">
          <span className="chat-top">
            <b>{athlete.name}</b>
            {date && <small className={isNew && !pref.muted ? 'new' : ''}>{fmtDate(date, { day: 'numeric', month: 'short' })}</small>}
          </span>
          <span className="chat-bottom">
            {/* Αν έχει νέο μήνυμα, φαίνεται αυτό (όπως σε μια εφαρμογή μηνυμάτων). */}
            <span className={`chat-sub${message ? ' msg-preview' : ''}`}>{message ? (message.call ? callText(message.call) : message.body || (message.audio ? 'Φωνητικό μήνυμα' : 'Φωτογραφία')) : sub}</span>
            {toReview(athlete) > 0 && <span className="review-pill">Προς έλεγχο</span>}
            {pref.muted && <BellOffIcon size={16} className="chat-flag" aria-label="Σίγαση" />}
            {pref.pinned && <PinIcon size={16} className="chat-flag" aria-label="Καρφιτσωμένος" />}
            {unread > 0
              ? <span className={`badge${pref.muted ? ' muted' : ''}`} aria-label={`${unread} νέα`}>{unread}</span>
              : pref.markedUnread && <span className="badge dot" aria-label="Μη αναγνωσμένο" />}
          </span>
        </span>
      </Link>
      {!selecting && <button
        type="button" className="chat-chev" aria-label={`Επιλογές: ${athlete.name}`} title="Επιλογές"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu({ x: r.left, y: r.bottom + 4 }); }}
      >
        <ChevronIcon size={20} />
      </button>}
    </div>
  );
}

// Ενέργειες για όλους τους επιλεγμένους μαζί.
function SelectBar({ ids, prefs, setPref, markAllRead, onDone }) {
  const all = (k) => ids.length > 0 && ids.every((id) => prefs[id]?.[k]);
  const flip = (k) => { const v = !all(k); ids.forEach((id) => setPref(id, { [k]: v })); onDone(); };
  const actions = [
    { Icon: ReadAllIcon, label: 'Αναγνωσμένα', run: () => { ids.forEach(markAllRead); onDone(); } },
    { Icon: PinIcon, label: all('pinned') ? 'Ξεκαρφίτσωμα' : 'Καρφίτσωμα', run: () => flip('pinned') },
    { Icon: BellOffIcon, label: all('muted') ? 'Χωρίς σίγαση' : 'Σίγαση', run: () => flip('muted') },
    { Icon: ArchiveBoxIcon, label: all('archived') ? 'Επαναφορά' : 'Αρχειοθέτηση', run: () => flip('archived') },
  ];
  return (
    <div className="select-bar" role="toolbar" aria-label="Ενέργειες για τους επιλεγμένους">
      {actions.map((a) => (
        <button key={a.label} type="button" disabled={!ids.length} onClick={a.run}>
          <a.Icon size={20} /><span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

// Μία ομάδα στη λίστα (για προπονητή και αθλούμενο).
export function GroupRow({ group: g, active }) {
  return (
    <Link href={`/dashboard/groups/${g.id}`} className="chat" aria-current={active ? 'page' : undefined}>
      <span className="chat-pic"><span className="chat-avatar initial group"><GroupsIcon size={24} /></span></span>
      <span className="chat-body">
        <span className="chat-top">
          <b>{g.name}</b>
          {g.lastAt && <small className={g.unread ? 'new' : ''}>{fmtDate(g.lastAt.slice(0, 10), { day: 'numeric', month: 'short' })}</small>}
        </span>
        <span className="chat-bottom">
          <span className={`chat-sub${g.unread ? ' msg-preview' : ''}`}>
            {g.lastAt ? g.lastBody || 'Φωτογραφία' : `${g.members} ${g.members === 1 ? 'μέλος' : 'μέλη'}`}
          </span>
          {g.unread > 0 && <span className="badge" aria-label={`${g.unread} νέα`}>{g.unread}</span>}
        </span>
      </span>
    </Link>
  );
}
