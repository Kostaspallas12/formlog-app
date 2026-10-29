'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireUser } from '@/lib/useAuthRedirect';
import { listStarred, setStar } from '@/lib/storage';
import { fmtDate } from '@/lib/utils';
import PaneHead from '@/components/PaneHead';
import EmptyState from '@/components/EmptyState';
import Photo from '@/components/Photo';
import VoiceNote from '@/components/VoiceNote';
import { useLive } from '@/components/Live';
import { useAppView } from '@/components/AppShell';
import { GroupsIcon, StarFilledIcon, StarIcon } from '@/components/Icons';
import { WorkspaceSkeleton } from '@/components/Skeletons';

const time = (ts) => new Date(ts).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });

// Όλα τα μηνύματα με αστέρι (από συνομιλίες και ομάδες), για να βρίσκεις γρήγορα ό,τι σημαντικό.
export default function StarredPage() {
  const { user, ready } = useRequireUser();
  const { athletes, coach, groups } = useLive();
  const { setView } = useAppView() || {};
  const router = useRouter();
  const [list, setList] = useState(null);

  const load = useCallback(() => listStarred().then(setList).catch(() => setList((l) => l ?? [])), []);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (!ready || !user || !list) return <><PaneHead title="Μηνύματα με αστέρι" backHref="/dashboard" /><WorkspaceSkeleton body /></>;

  const isCoach = user.type === 'coach';
  const where = (s) => {
    if (s.group) return { name: groups?.find((g) => g.id === s.msg.groupId)?.name || 'Ομάδα', group: true };
    if (isCoach) return { name: athletes?.find((a) => a.id === s.msg.athleteId)?.name || 'Αθλούμενος' };
    return { name: coach?.name || 'Προπονητής' };
  };
  const open = (s) => {
    if (s.group) return router.push(`/dashboard/groups/${s.msg.groupId}`);
    if (isCoach) return router.push(`/dashboard/athletes/${s.msg.athleteId}?tab=chat`);
    setView?.('chat');
    return router.push('/dashboard');
  };
  const unstar = async (s) => {
    setList((l) => l.filter((x) => x.id !== s.id));
    try { await setStar(s.msg.id, s.group, false); } catch { load(); }
  };

  return (
    <>
      <PaneHead title="Μηνύματα με αστέρι" subtitle={list.length ? `${list.length} ${list.length === 1 ? 'μήνυμα' : 'μηνύματα'}` : null} backHref="/dashboard" />
      {list.length === 0 ? (
        <EmptyState icon={StarIcon} title="Κανένα μήνυμα με αστέρι">
          <Link href="/dashboard" className="btn">Επιστροφή</Link>
        </EmptyState>
      ) : (
        <ul className="starred">
          {list.map((s) => {
            const w = where(s);
            const mine = s.msg.sender === user.id;
            return (
              <li key={s.id} className="starred-item">
                <div className="starred-head">
                  <button type="button" className="starred-where" onClick={() => open(s)}>
                    {w.group && <GroupsIcon size={16} />}
                    <b>{w.name}</b>
                    {mine && <span>· Εσύ</span>}
                  </button>
                  <small>{fmtDate(s.msg.createdAt.slice(0, 10), { day: 'numeric', month: 'short' })} · {time(s.msg.createdAt)}</small>
                  <button type="button" className="icon-btn starred-off" onClick={() => unstar(s)} aria-label="Αφαίρεση αστεριού" title="Αφαίρεση αστεριού">
                    <StarFilledIcon size={18} />
                  </button>
                </div>
                <button type="button" className={`starred-body${mine ? ' me' : ''}`} onClick={() => open(s)}>
                  {s.msg.photo && <Photo id={s.msg.photo} alt="Φωτογραφία" className="starred-photo" />}
                  {s.msg.body && <p>{s.msg.body}</p>}
                </button>
                {s.msg.audio && <VoiceNote path={s.msg.audio} secs={s.msg.audioSecs} mine={mine} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
