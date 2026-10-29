'use client';

import Link from 'next/link';
import { useRequireUser } from '@/lib/useAuthRedirect';
import PaneHead from '@/components/PaneHead';
import { GroupRow } from '@/components/AthleteSidebar';
import { useLive } from '@/components/Live';
import { GroupsIcon } from '@/components/Icons';
import { WorkspaceSkeleton } from '@/components/Skeletons';

// Ενότητα «Ομάδες».
//   προπονητής: η λίστα είναι αριστερά, εδώ (δεξιά) η κενή οθόνη με «Νέα ομάδα» — όπως σε μια εφαρμογή μηνυμάτων
//   αθλούμενος: οι ομάδες στις οποίες ανήκει
export default function GroupsPage() {
  const { user, ready } = useRequireUser();
  const { groups } = useLive();

  if (!ready || !user) return <WorkspaceSkeleton body />;

  if (user.type === 'coach') {
    return (
      <div className="pane-empty">
        <span className="pane-empty-icon"><GroupsIcon size={36} /></span>
        <h2>Ομάδες</h2>
        <Link href="/dashboard/groups/new" className="btn primary">Νέα ομάδα</Link>
      </div>
    );
  }

  return (
    <>
      <PaneHead title="Ομάδες" />
      <nav className="chats group-list">{(groups || []).map((g) => <GroupRow key={g.id} group={g} />)}</nav>
    </>
  );
}
