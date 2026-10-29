'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { confirmDialog } from '@/components/Confirm';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { addGroupMember, deleteAthlete, disconnectCoach } from '@/lib/storage';
import { useLive } from './Live';
import {
  ArchiveBoxIcon, BackIcon, BellOffIcon, GroupAddIcon, GroupsIcon, HeartIcon, PinIcon, ReadIcon, TrashIcon, UnreadIcon,
} from './Icons';

// Το μενού ενός αθλούμενου στη λίστα (σαν το μενού μιας συνομιλίας σε μια εφαρμογή μηνυμάτων).
// at: { x, y } σημείο στην οθόνη από το οποίο ανοίγει.
export default function AthleteRowMenu({ athlete, hasNew, at, onClose }) {
  const { prefs, setPref, markAllRead, markUnread, groups, reloadAthletes, reloadGroups } = useLive();
  const router = useRouter();
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y, visibility: 'hidden' });
  const [sub, setSub] = useState(null); // null | 'groups'
  const [note, setNote] = useState('');
  const p = prefs[athlete.id] || {};

  // Θέση: να χωράει ολόκληρο στην οθόνη (κάτω/πάνω, δεξιά/αριστερά).
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8));
    const top = at.y + r.height + 8 > window.innerHeight ? Math.max(8, at.y - r.height) : at.y;
    setPos({ left, top, visibility: 'visible' });
  }, [at, sub]);

  // Κλείνει με κλικ έξω, Esc ή κύλιση.
  useEffect(() => {
    const out = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', out);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const act = (fn) => async () => { onClose(); await fn(); };
  const viewing = () => window.location.pathname === `/dashboard/athletes/${athlete.id}`;

  const items = [
    { Icon: PinIcon, label: p.pinned ? 'Ξεκαρφίτσωμα' : 'Καρφίτσωμα', run: act(() => setPref(athlete.id, { pinned: !p.pinned })) },
    { Icon: BellOffIcon, label: p.muted ? 'Κατάργηση σίγασης' : 'Σίγαση ειδοποιήσεων', run: act(() => setPref(athlete.id, { muted: !p.muted })) },
    hasNew || p.markedUnread
      ? { Icon: ReadIcon, label: 'Επισήμανση ως αναγνωσμένο', run: act(() => markAllRead(athlete.id)) }
      : { Icon: UnreadIcon, label: 'Επισήμανση ως μη αναγνωσμένο', run: act(() => markUnread(athlete.id)) },
    { Icon: HeartIcon, label: p.favorite ? 'Αφαίρεση από τα Αγαπημένα' : 'Προσθήκη στα Αγαπημένα', run: act(() => setPref(athlete.id, { favorite: !p.favorite })) },
    athlete.linked && { Icon: GroupAddIcon, label: 'Προσθήκη σε ομάδα', more: true, run: () => setSub('groups') },
    { Icon: ArchiveBoxIcon, label: p.archived ? 'Επαναφορά από το αρχείο' : 'Αρχειοθέτηση', run: act(() => setPref(athlete.id, { archived: !p.archived })) },
    'sep',
    athlete.linked
      ? {
        Icon: TrashIcon, label: 'Διακοπή συνεργασίας', danger: true,
        run: act(async () => {
          if (!(await confirmDialog(`Διακοπή συνεργασίας με «${athlete.name}»; Ο φάκελος μένει στον αθλούμενο και εσύ δεν θα έχεις πια πρόσβαση.`))) return;
          await disconnectCoach(athlete.id);
          reloadAthletes(); reloadGroups();
          if (viewing()) router.push('/dashboard');
        }),
      }
      : {
        Icon: TrashIcon, label: 'Διαγραφή αθλούμενου', danger: true,
        run: act(async () => {
          if (!(await confirmDialog(`Οριστική διαγραφή του φακέλου «${athlete.name}» με όλες τις καταγραφές, το βάρος, τα καθημερινά και τις φωτογραφίες;`))) return;
          await deleteAthlete(athlete.id);
          reloadAthletes();
          if (viewing()) router.push('/dashboard');
        }),
      },
  ].filter(Boolean);

  const addTo = async (g) => {
    try {
      await addGroupMember(g.id, athlete.id);
      reloadGroups();
      setNote(`Προστέθηκε στην ομάδα «${g.name}».`);
      setTimeout(onClose, 1200);
    } catch {
      setNote('Δεν έγινε η προσθήκη. Δοκίμασε ξανά.');
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="row-menu" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {sub === 'groups' ? (
        <>
          <button type="button" className="row-menu-back" onClick={() => setSub(null)}><BackIcon size={18} /> Προσθήκη σε ομάδα</button>
          {note ? <p className="row-menu-note">{note}</p> : (groups || []).length === 0 ? (
            <button type="button" role="menuitem" onClick={act(() => router.push('/dashboard/groups/new'))}>
              <GroupsIcon size={20} /> Νέα ομάδα
            </button>
          ) : (
            groups.map((g) => (
              <button key={g.id} type="button" role="menuitem" onClick={() => addTo(g)}>
                <GroupsIcon size={20} /> {g.name}
              </button>
            ))
          )}
        </>
      ) : (
        items.map((it, i) => (it === 'sep' ? <hr key={`s${i}`} /> : (
          <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''} onClick={it.run}>
            <it.Icon size={20} /> <span>{it.label}</span>{it.more && <span className="row-menu-more">›</span>}
          </button>
        )))
      )}
    </div>,
    document.body,
  );
}
