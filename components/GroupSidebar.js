'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GroupRow } from './AthleteSidebar';
import { GroupsIcon, PlusIcon, SearchIcon } from './Icons';
import { useLive } from './Live';

// Οι ομάδες του προπονητή (ενότητα ομάδων): λίστα + νέα ομάδα.
export default function GroupSidebar() {
  const path = usePathname();
  const { groups } = useLive();
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('el');
  const shown = (groups || []).filter((g) => !q || g.name.toLocaleLowerCase('el').includes(q));

  return (
    <aside className="list">
      <div className="list-head">
        <h2>Ομάδες{groups?.length > 0 && <span className="list-count">{groups.length}</span>}</h2>
        <Link href="/dashboard/groups/new" className="icon-btn round primary" aria-label="Νέα ομάδα" title="Νέα ομάδα">
          <PlusIcon />
        </Link>
      </div>

      {groups?.length > 0 && (
        <label className="list-search">
          <SearchIcon size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Αναζήτηση" aria-label="Αναζήτηση ομάδας" />
        </label>
      )}

      {!groups ? (
        <div role="status" aria-label="Φόρτωση">
          {[0, 1, 2].map((i) => (
            <div className="chat" key={i}>
              <span className="sk chat-avatar" />
              <span className="chat-body"><span className="sk" style={{ width: '60%', height: 14 }} /><span className="sk" style={{ width: '40%', height: 12, marginTop: 6 }} /></span>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="list-empty groups-empty">
          <span className="pane-empty-icon"><GroupsIcon size={34} /></span>
          <b>Δεν έχεις ομάδες ακόμα</b>
          <Link href="/dashboard/groups/new" className="btn primary">Νέα ομάδα</Link>
        </div>
      ) : shown.length === 0 ? (
        <p className="list-empty">Κανένα αποτέλεσμα.</p>
      ) : (
        <nav className="chats">
          {shown.map((g) => <GroupRow key={g.id} group={g} active={path === `/dashboard/groups/${g.id}`} />)}
        </nav>
      )}
    </aside>
  );
}
