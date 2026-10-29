'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirmDialog, promptDialog } from '@/components/Confirm';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRequireUser } from '@/lib/useAuthRedirect';
import { addGroupMember, deleteGroup, getGroup, groupPeople, removeGroupMember, updateGroup } from '@/lib/storage';
import Chat from '@/components/Chat';
import Menu from '@/components/Menu';
import PaneHead from '@/components/PaneHead';
import { useLive, useSignal } from '@/components/Live';
import EmptyState from '@/components/EmptyState';
import Select from '@/components/Select';
import { CloseIcon, GroupsIcon } from '@/components/Icons';
import { WorkspaceSkeleton } from '@/components/Skeletons';
import { isUuid } from '@/lib/utils';

// Μια ομάδα: η ομαδική συνομιλία και (για τον προπονητή) τα μέλη της.
export default function GroupPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, ready } = useRequireUser();
  const { athletes, reloadGroups } = useLive();
  const [group, setGroup] = useState(undefined); // undefined: φορτώνει, null: δεν βρέθηκε
  const [people, setPeople] = useState([]);
  const [managing, setManaging] = useState(false);

  // Ομάδα και μέλη μαζί, ώστε να μη φαίνεται για μια στιγμή «Χωρίς μέλη».
  const load = useCallback(async () => {
    if (!isUuid(id)) return setGroup(null); // χαλασμένη διεύθυνση: κατευθείαν «Δεν βρέθηκε»
    const [g, p] = await Promise.all([getGroup(id).catch(() => null), groupPeople(id).catch(() => [])]);
    setPeople(p);
    setGroup(g);
  }, [id]);
  useEffect(() => { if (user) load(); }, [user, load]);
  // Ζωντανά: νέα μέλη, μετονομασία, αφαίρεση από την ομάδα ή διαγραφή της.
  useSignal('group', id, load);

  if (!ready || !user || group === undefined) return <WorkspaceSkeleton body />;
  if (!group) {
    return (
      <>
        <PaneHead title="Δεν βρέθηκε" backHref="/dashboard/groups" />
        <EmptyState title="Δεν βρέθηκε αυτή η ομάδα"><Link href="/dashboard/groups" className="btn">Επιστροφή</Link></EmptyState>
      </>
    );
  }

  const isCoach = group.coachId === user.id;
  const home = '/dashboard/groups'; // η λίστα με τις ομάδες
  const members = people.filter((p) => !p.isCoach);
  const names = Object.fromEntries(people.map((p) => [p.userId, { name: p.name, isCoach: p.isCoach }]));
  // Όπως σε μια εφαρμογή μηνυμάτων: «Εσύ, Μαρία, Γιάννης…»
  const others = people.filter((p) => p.userId !== user.id).map((p) => p.name);
  const subtitle = members.length
    ? ['Εσύ', ...others.slice(0, 4)].join(', ') + (others.length > 4 ? ` +${others.length - 4}` : '')
    : 'Χωρίς μέλη';
  const changed = async () => { await load(); reloadGroups(); };

  const menu = isCoach ? [
    { label: managing ? 'Κλείσιμο μελών' : 'Μέλη', onClick: () => setManaging((m) => !m) },
    {
      label: 'Μετονομασία',
      onClick: async () => {
        const name = await promptDialog({ text: 'Νέο όνομα ομάδας', value: group.name, maxLength: 80 });
        if (name && name !== group.name) { await updateGroup(id, { name }); changed(); }
      },
    },
    {
      label: 'Διαγραφή ομάδας', danger: true,
      onClick: async () => {
        if (!(await confirmDialog(`Οριστική διαγραφή της ομάδας «${group.name}» με όλα τα μηνύματα και τις φωτογραφίες της;`))) return;
        await deleteGroup(id);
        router.push(home);
      },
    },
  ] : [
    {
      label: 'Αποχώρηση από την ομάδα', danger: true,
      onClick: async () => {
        if (!(await confirmDialog(`Αποχώρηση από την ομάδα «${group.name}»;`))) return;
        await removeGroupMember(id, user.id);
        router.push(home);
      },
    },
  ];

  return (
    <>
      <PaneHead
        title={group.name}
        subtitle={subtitle}
        avatar={<span className="chat-avatar initial group pane-avatar"><GroupsIcon size={22} /></span>}
        backHref={home}
        actions={<Menu label="Επιλογές ομάδας" items={menu} />}
      />
      {isCoach && (managing || members.length === 0) && (
        <GroupMembers
          groupId={id} members={members} athletes={athletes} onChange={changed}
          onClose={members.length ? () => setManaging(false) : null}
        />
      )}
      <Chat key={id} groupId={id} me={user.id} people={names} solo />
    </>
  );
}

// Τα μέλη της ομάδας (για τον προπονητή): αφαίρεση και προσθήκη από τους συνδεδεμένους αθλούμενους.
function GroupMembers({ groupId, members, athletes, onChange, onClose }) {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const candidates = (athletes || []).filter((a) => a.linked && !members.some((m) => m.athleteId === a.id));

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await onChange(); } catch { setError('Κάτι πήγε στραβά. Δοκίμασε ξανά.'); }
    setBusy(false);
  };

  return (
    <section className="panel group-members">
      <div className="panel-head">
        <h2>Μέλη <span className="list-count">{members.length}</span></h2>
        {onClose && <button type="button" className="x" onClick={onClose} aria-label="Κλείσιμο"><CloseIcon size={18} /></button>}
      </div>
      {members.length > 0 && (
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.userId}>
              <span className="chat-avatar initial">{m.name.charAt(0).toUpperCase()}</span>
              <span className="member-name">{m.name}</span>
              <button
                type="button" className="x" disabled={busy} aria-label={`Αφαίρεση: ${m.name}`}
                onClick={async () => { if (await confirmDialog(`Αφαίρεση του/της «${m.name}» από την ομάδα;`)) run(() => removeGroupMember(groupId, m.userId)); }}
              >
                <CloseIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 ? (
        <form className="member-add" onSubmit={(e) => { e.preventDefault(); if (pick) run(() => addGroupMember(groupId, pick)).then(() => setPick('')); }}>
          <Select
            value={pick} onChange={setPick} label="Αθλούμενος" placeholder="Διάλεξε αθλούμενο…"
            options={candidates.map((a) => ({ value: a.id, label: a.name }))}
          />
          <button type="submit" className="btn primary small" disabled={!pick || busy}>Προσθήκη</button>
        </form>
      ) : (
        <p className="meta">Όλοι οι συνδεδεμένοι αθλούμενοί σου είναι ήδη στην ομάδα.</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
