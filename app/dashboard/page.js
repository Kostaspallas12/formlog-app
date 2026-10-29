'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { confirmDialog } from '@/components/Confirm';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Menu from '@/components/Menu';
import { useAppLock } from '@/components/AppLock';
import { useRequireUser } from '@/lib/useAuthRedirect';
import { revokeInvite } from '@/lib/storage';
import { getLastUser } from '@/lib/lastUser';
import Workspace from '@/components/Workspace';
import { CallButtons } from '@/components/Calls';
import MyCoach from '@/components/MyCoach';
import PaneHead from '@/components/PaneHead';
import { CHAT_VIEW, PLAN_VIEW, useAppView, VIEWS } from '@/components/AppShell';
import Chat from '@/components/Chat';
import AthletePlans from '@/components/AthletePlans';
import PendingInvites from '@/components/PendingInvites';
import { ArchiveIcon, ChatIcon, CloseIcon, UsersIcon } from '@/components/Icons';
import { AthleteAvatar, toReview } from '@/components/AthleteSidebar';
import { useLive } from '@/components/Live';
import { ANGLES, daysBetween, fmtDate, todayISO } from '@/lib/utils';
import Photo from '@/components/Photo';
import { WorkspaceSkeleton } from '@/components/Skeletons';

export default function DashboardPage() {
  const { user, ready } = useRequireUser();

  if (!ready || !user) return <LoadingSkeleton />;
  return user.type === 'coach' ? <CoachHome /> : <MyProgress user={user} />;
}

// Πριν μάθουμε ποιος είναι συνδεδεμένος: ο τελευταίος χρήστης αυτής της συσκευής,
// ώστε ο σκελετός να είναι σωστός από την πρώτη στιγμή.
function LoadingSkeleton() {
  const [last, setLast] = useState(null);
  useLayoutEffect(() => { setLast(getLastUser()); }, []);
  return last?.type === 'coach' ? <CoachHome /> : <WorkspaceSkeleton />;
}

// Προπονητής χωρίς επιλεγμένο αθλούμενο: η εικόνα της ημέρας (ποιος χρειάζεται προσοχή).
const QUIET_DAYS = 7;

function CoachHome() {
  const { athletes, unread, unreadMsgs, online, groups, reloadAthletes } = useLive();
  const head = (
    <PaneHead
      title="Επισκόπηση"
      // (Νέος αθλούμενος: το «+» της λίστας, που φαίνεται πάντα δίπλα στην επισκόπηση.)
    />
  );

  if (!athletes) return <>{head}<WorkspaceSkeleton body /></>;
  if (athletes.length === 0) {
    return (
      <div className="pane-empty">
        <span className="pane-empty-icon"><UsersIcon size={34} /></span>
        <h2>Πρόσθεσε τον πρώτο σου αθλούμενο</h2>
        <Link href="/dashboard/athletes/new" className="btn primary">Προσθήκη αθλούμενου</Link>
      </div>
    );
  }

  const today = todayISO();
  // Ημέρες από την τελευταία καταγραφή (ή, αν δεν έχει καμία, από τότε που προστέθηκε).
  const ago = (a) => daysBetween(a.lastDate || a.createdAt.slice(0, 10), today);
  const fresh = athletes.filter((a) => unread[a.id] || unreadMsgs[a.id]);
  const pending = athletes.filter((a) => !a.linked && a.pending);
  const quiet = athletes
    .filter((a) => !pending.includes(a) && ago(a) >= QUIET_DAYS)
    .sort((a, b) => ago(b) - ago(a));
  const sum = (m) => Object.values(m).reduce((x, y) => x + y, 0);
  const newCount = sum(unread);
  const msgCount = sum(unreadMsgs) + (groups || []).reduce((a, g) => a + g.unread, 0); // ατομικά + ομάδες
  const onlineCount = athletes.filter((a) => a.linked && online.has(a.id)).length;
  const review = athletes.filter((a) => toReview(a) > 0);
  const reviewCount = review.reduce((n, a) => n + toReview(a), 0);

  // Ακύρωση πρόσκλησης (με επιβεβαίωση) από την κάρτα «Αναμένουν».
  const cancelInvite = async (a) => {
    if (!(await confirmDialog('Ακύρωση της πρόσκλησης για «' + a.name + '»; Ο σύνδεσμος που έχεις στείλει δεν θα ισχύει πια.'))) return;
    try { await revokeInvite(a.id); } finally { reloadAthletes(); }
  };

  return (
    <>
      {head}
      <div className="stats">
        <Stat Icon={ArchiveIcon} value={reviewCount} label="check-in προς έλεγχο" good />
        <Stat Icon={ArchiveIcon} value={newCount} label="νέα check-in" good />
        <Stat Icon={ChatIcon} value={msgCount} label="νέα μηνύματα" good />
        <Stat Icon={UsersIcon} value={onlineCount} label="online τώρα" />
      </div>

      <RecentPhotos athletes={athletes} />

      <Group
        title="Προς έλεγχο" items={review} online={online}
        sub={(a) => `${toReview(a)} check-in · τελευταίο ${fmtDate(a.checkins[a.checkins.length - 1].date, { day: 'numeric', month: 'short' })}`}
      />
      <Group
        title="Νέα" items={fresh} online={online}
        // Μόνο μηνύματα → κατευθείαν στη συνομιλία.
        hrefOf={(a) => `/dashboard/athletes/${a.id}${unreadMsgs[a.id] && !unread[a.id] ? '?tab=chat' : ''}`}
        sub={(a) => [
          unread[a.id] && `${unread[a.id]} check-in`,
          unreadMsgs[a.id] && `${unreadMsgs[a.id]} ${unreadMsgs[a.id] === 1 ? 'μήνυμα' : 'μηνύματα'}`,
        ].filter(Boolean).join(' · ')}
      />
      <Group
        title={`Χωρίς καταγραφή ${QUIET_DAYS}+ ημέρες`} items={quiet} online={online}
        sub={(a) => (a.lastDate ? `Τελευταία πριν ${ago(a)} ημέρες` : 'Καμία καταγραφή ακόμα')}
      />
      <Group title="Δεν έχουν αποδεχτεί την πρόσκληση" items={pending} sub={() => 'Αναμένει αποδοχή'} online={online} muted onCancel={cancelInvite} />
      {!fresh.length && !quiet.length && !pending.length && !review.length && (
        <p className="ov-ok">Όλοι οι αθλούμενοι είναι ενημερωμένοι.</p>
      )}
    </>
  );
}

// Μία κάρτα στατιστικού: εικονίδιο, αριθμός (γκρι όταν είναι 0), ετικέτα.
function Stat({ Icon, value, label, good }) {
  return (
    <div className="stat">
      <span className="stat-icon" aria-hidden="true"><Icon size={18} /></span>
      <b className={value ? (good ? 'good' : '') : 'zero'}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

// Οι πιο πρόσφατες καταγραφές με φωτογραφία, από όλους τους αθλούμενους.
function RecentPhotos({ athletes }) {
  const recent = athletes
    .flatMap((a) => a.checkins.map((c) => ({ a, c, photo: ANGLES.map((x) => c.photos[x.id]).find(Boolean) })))
    .filter((r) => r.photo)
    .sort((x, y) => y.c.date.localeCompare(x.c.date) || (y.c.createdAt || '').localeCompare(x.c.createdAt || ''))
    .slice(0, 8);
  if (!recent.length) return null;
  return (
    <section className="ov-group">
      <h2>Πρόσφατες φωτογραφίες</h2>
      <div className="recent-photos">
        {recent.map(({ a, c, photo }) => (
          <Link key={c.id} href={`/dashboard/athletes/${a.id}`} className="recent-photo">
            <Photo id={photo} alt={`${a.name}, ${fmtDate(c.date)}`} />
            <span className="recent-cap"><b>{a.name}</b><small>{fmtDate(c.date, { day: 'numeric', month: 'short' })}</small></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Group({ title, items, sub, online, muted, onCancel, hrefOf = (a) => `/dashboard/athletes/${a.id}` }) {
  if (!items.length) return null;
  return (
    <section className={"ov-group" + (muted ? " muted" : "")}>
      <h2>{title} <span className="ov-count">{items.length}</span></h2>
      <div className="ov-list">
        {items.map((a) => {
          const inner = (
            <>
              <AthleteAvatar athlete={a} online={a.linked && online.has(a.id)} />
              <span className="ov-name"><b>{a.name}</b><small>{sub(a)}</small></span>
            </>
          );
          return onCancel ? (
            <div className="ov-row-wrap" key={a.id}>
              <Link href={hrefOf(a)} className="ov-row">{inner}</Link>
              <button type="button" className="icon-btn ov-cancel" title="Ακύρωση πρόσκλησης" aria-label={'Ακύρωση πρόσκλησης: ' + a.name} onClick={() => onCancel(a)}><CloseIcon size={18} /></button>
            </div>
          ) : (
            <Link key={a.id} href={hrefOf(a)} className="ov-row">{inner}</Link>
          );
        })}
      </div>
    </section>
  );
}

// Προσωπικός λογαριασμός: ο χώρος του ίδιου του χρήστη, με την ενότητα από το πλαϊνό μενού.
function MyProgress({ user }) {
  const { view } = useAppView();
  const { coach, hasPlans, groups, self } = useLive();
  const [me, setMe] = useState(null);
  const router = useRouter();
  const lock = useAppLock();
  const current = (view === 'chat' && !coach) || (view === 'plan' && !coach && !hasPlans) || view === 'groups' ? 'archive' : view;
  const title = current === 'chat' ? coach.name : [...VIEWS, PLAN_VIEW, CHAT_VIEW].find((v) => v.id === current)?.label;

  // Ο φάκελος έρχεται από τις ζωντανές ενημερώσεις (μία φόρτωση για όλη την εφαρμογή, ενημερώνεται
  // μόνος του όταν ο προπονητής αλλάζει ηλικία/ύψος/όνομα).
  useEffect(() => { if (self) setMe(self); }, [self]);

  if (!me) return <><PaneHead title={title} /><WorkspaceSkeleton body /></>;
  return (
    <Workspace
      athlete={me} title={title} subtitle={current === 'chat' ? 'Προπονητής' : <MyCoach />} view={current} onAthleteChange={setMe} viewer="self"
      banner={<PendingInvites />}
      canConfigureJournal={!coach} // χωρίς προπονητή, ορίζει μόνος του πεδία και στόχους
      menu={(
        <Menu items={[
          (coach || groups?.length > 0) && { label: 'Μηνύματα με αστέρι', onClick: () => router.push('/dashboard/starred') },
          { label: 'Κλείδωμα εφαρμογής', onClick: () => (lock.enabled ? lock.lockNow() : router.push('/account#lock')) },
        ]} />
      )}
      chat={coach ? <Chat athleteId={me.id} me={user.id} otherName={coach.name} solo /> : null}
      call={coach && me.linked ? <CallButtons athleteId={me.id} /> : null}
      plans={coach || hasPlans ? <AthletePlans athleteId={me.id} names={{ athlete: me.name, coach: coach?.name }} /> : null}
    />
  );
}
