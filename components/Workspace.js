'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteCheckin, listCheckins, listDailyLogs, listWeighIns, withWeights } from '@/lib/storage';
import { daysBetween, fmtDelta, fmtKg } from '@/lib/utils';
import CheckinForm from './CheckinForm';
import { CheckinReview, CheckinTable } from './Checkins';
import CheckinFormEditor from './CheckinFormEditor';
import Compare from './Compare';
import WeightChart from './WeightChart';
import WeightLog from './WeightLog';
import Journal from './Journal';
import PaneHead from './PaneHead';
import BodyInfo from './BodyInfo';
import { CHAT_VIEW, PLAN_VIEW, VIEWS } from './AppShell';
import { ArchiveIcon, PlusIcon, SlidersIcon } from './Icons';
import { formOf } from '@/lib/checkinForm';
import EmptyState from './EmptyState';
import { WorkspaceBodySkeleton } from './Skeletons';
import { useLive, useSignal } from './Live';

// Τι φορτώνεται για έναν αθλούμενο (το καθένα ξεχωριστά, για να ανανεώνεται μόνο ό,τι άλλαξε).
const LOADERS = { checkins: listCheckins, weighIns: listWeighIns, daily: listDailyLogs };

// Ο χώρος ενός αθλούμενου: κεφαλίδα, (καρτέλες), αρχείο, σύγκριση, βάρος, καθημερινά.
// call: τα κουμπιά κλήσης/βιντεοκλήσης στην κεφαλίδα (όταν υπάρχει συνομιλία).
// view: η ενότητα από το πλαϊνό μενού (προσωπικός χρήστης). Χωρίς view δείχνει δικές του καρτέλες (προπονητής).
// viewer: 'coach' (ο προπονητής βλέπει τον αθλούμενο) ή 'self' (ο ίδιος ο χρήστης).
export default function Workspace({ athlete, title, subtitle, avatar, backHref, view, banner, menu, call, onAthleteChange, chat, chatBadge = 0, plans, initialTab, canConfigureJournal = false, viewer = 'coach' }) {
  const [raw, setRaw] = useState(null); // { checkins, weighIns, daily }
  const [loadError, setLoadError] = useState(false);
  const [ownTab, setOwnTab] = useState('archive');
  const [editing, setEditing] = useState(null); // null | 'new' | καταγραφή
  const [progressMode, setProgressMode] = useState('list'); // Πρόοδος: 'list' (πίνακας) | 'compare'
  const [openId, setOpenId] = useState(null); // ανοιχτό check-in (οθόνη ελέγχου)
  const [formOpen, setFormOpen] = useState(false); // ρύθμιση των ερωτήσεων
  const form = formOf(athlete);
  const coached = !!athlete.linked;
  const { reloadAthletes } = useLive(); // η λίστα του προπονητή (τελευταία καταγραφή, βάρος)
  // «Πρόγραμμα» και «Συνομιλία» υπάρχουν μόνο όταν δίνονται.
  const wanted = view ?? ownTab;
  const tab = (wanted === 'chat' && !chat) || (wanted === 'plan' && !plans) ? 'archive' : wanted;
  useEffect(() => { if (initialTab) setOwnTab(initialTab); }, [initialTab]);

  // Φορτώνει μόνο ό,τι ζητηθεί (π.χ. μετά από αλλαγή βάρους μόνο το βάρος), όχι τα πάντα.
  const refresh = useCallback(async (parts = Object.keys(LOADERS)) => {
    try {
      const results = await Promise.all(parts.map((k) => LOADERS[k](athlete.id)));
      setRaw((prev) => ({ ...prev, ...Object.fromEntries(parts.map((k, i) => [k, results[i]])) }));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [athlete.id]);
  useEffect(() => { refresh(); }, [refresh]);
  // Ζωντανά: ό,τι καταχωρεί ο άλλος (προπονητής ή αθλούμενος) εμφανίζεται χωρίς refresh.
  useSignal('data', athlete.id, () => refresh());

  // Το βάρος κάθε καταγραφής έρχεται από τον πίνακα βάρους (μία πηγή).
  const data = useMemo(
    () => raw && { checkins: withWeights(raw.checkins, raw.weighIns), weighIns: raw.weighIns, daily: raw.daily },
    [raw]
  );

  const startNew = () => { setEditing('new'); if (view === undefined) setOwnTab('archive'); };
  const head = (
    <PaneHead
      title={title} subtitle={subtitle} avatar={avatar} backHref={backHref}
      actions={<>
        {call}
        {data && !editing && tab !== 'chat' && tab !== 'plan' && (
          <button className="btn primary" onClick={startNew}>
            <PlusIcon size={18} /><span className="long">Νέα καταγραφή</span><span className="short">Νέα</span>
          </button>
        )}
        {menu}
      </>}
    />
  );
  const tabs = view === undefined && (
    <div className="tabs" role="tablist">
      {[...VIEWS, ...(plans ? [PLAN_VIEW] : []), ...(chat ? [CHAT_VIEW] : [])].map((t) => (
        <button
          key={t.id} role="tab" className="tab" aria-selected={tab === t.id}
          onClick={(e) => { setOwnTab(t.id); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}
        >
          {t.label}
          {t.id === 'chat' && chatBadge > 0 && tab !== 'chat' && <span className="badge">{chatBadge}</span>}
        </button>
      ))}
    </div>
  );

  if (loadError && !data) {
    return <>{head}<EmptyState title="Δεν φόρτωσαν τα δεδομένα" text="Έλεγξε τη σύνδεσή σου και ανανέωσε τη σελίδα." /></>;
  }
  // Όσο φορτώνει: η κεφαλίδα κανονικά και σκελετός στη θέση των δεδομένων.
  if (!data) return <>{head}{banner}{tabs}<WorkspaceBodySkeleton /></>;

  const { checkins, weighIns, daily } = data;
  const dates = [...checkins, ...weighIns, ...daily].map((x) => x.date).sort();
  const days = dates.length ? daysBetween(dates[0], dates[dates.length - 1]) : 0;
  const firstKg = weighIns[0];
  const lastKg = weighIns[weighIns.length - 1];
  const openCheckin = openId ? checkins.find((c) => c.id === openId) : null; // (σβήστηκε → πίσω στη λίστα)

  const done = () => {
    setEditing(null);
    refresh(['checkins', 'weighIns']);
    reloadAthletes();
  };

  return (
    <>
      {head}
      {banner}
      {tabs}

      {editing && (
        <CheckinForm
          key={editing === 'new' ? 'new' : editing.id}
          athleteId={athlete.id}
          initial={editing === 'new' ? null : editing}
          onDone={done}
          onCancel={() => setEditing(null)}
          lastWeight={weighIns.length ? weighIns[weighIns.length - 1].weight : null}
          form={viewer === 'self' ? form : null}
        />
      )}

      {/* Ένα check-in ανοιχτό: η οθόνη ελέγχου (φωτογραφίες, ερωτηματολόγιο, απάντηση προπονητή) */}
      {tab === 'archive' && !editing && openCheckin && (
        <CheckinReview
          checkins={checkins} id={openCheckin.id} form={form} viewer={viewer} coached={coached} athlete={athlete}
          onBack={() => setOpenId(null)} onOpen={(c) => setOpenId(c.id)}
          onEdit={(c) => { setEditing(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onDelete={async (c) => { await deleteCheckin(c); setOpenId(null); refresh(['checkins']); reloadAthletes(); }}
          onChanged={() => { refresh(['checkins']); reloadAthletes(); }}
        />
      )}
      {tab === 'archive' && !openCheckin && (
        <>
          {dates.length > 0 && (
            // Μία λεπτή γραμμή σύνοψης (αντί για μεγάλα κουτιά), με τις επιλογές προβολής στο τέλος.
            <div className="summary">
              {lastKg && <span><b>{fmtKg(lastKg.weight)} kg</b> τώρα</span>}
              {weighIns.length > 1 && (
                <span>
                  <b className={lastKg.weight < firstKg.weight ? 'down' : lastKg.weight > firstKg.weight ? 'up' : ''}>
                    {fmtDelta(lastKg.weight - firstKg.weight)}
                  </b> από την αρχή
                </span>
              )}
              <span>
                <b>{checkins.length}</b> check-in
                {days > 0 && <> σε <b>{days}</b> {days === 1 ? 'ημέρα' : 'ημέρες'}</>}
              </span>
              {!editing && (
                <span className="summary-tools">
                  {canConfigureJournal && (
                    <button type="button" className="btn small" onClick={() => setFormOpen(true)}><SlidersIcon size={18} /> Ερωτήσεις</button>
                  )}
                  {checkins.length > 1 && (
                    <span className="seg progress-mode" role="group" aria-label="Προβολή">
                      <button type="button" aria-pressed={progressMode === 'list'} onClick={() => setProgressMode('list')}>Λίστα</button>
                      <button type="button" aria-pressed={progressMode === 'compare'} onClick={() => setProgressMode('compare')}>Σύγκριση</button>
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          {checkins.length === 0 ? (
            !editing && (
              <EmptyState icon={ArchiveIcon} title="Καμία καταγραφή ακόμα">
                <button className="btn primary" onClick={startNew}><PlusIcon size={18} /> Πρώτη καταγραφή</button>
              </EmptyState>
            )
          ) : progressMode === 'compare' && checkins.length > 1 && !editing ? (
            <Compare key={checkins.length} checkins={checkins} />
          ) : (
            <CheckinTable checkins={checkins} form={form} viewer={viewer} coached={coached} onOpen={(c) => setOpenId(c.id)} />
          )}
        </>
      )}
      {formOpen && (
        <CheckinFormEditor
          athlete={athlete} onClose={() => setFormOpen(false)}
          onSaved={(checkinForm) => { onAthleteChange?.({ ...athlete, checkinForm }); setFormOpen(false); }}
        />
      )}
      {tab === 'weight' && (
        <div className="weight">
          {onAthleteChange && <BodyInfo athlete={athlete} onChange={onAthleteChange} />}
          <WeightChart entries={weighIns} />
          <WeightLog athleteId={athlete.id} entries={weighIns} onChange={() => { reloadAthletes(); return refresh(['weighIns']); }} />
        </div>
      )}
      {tab === 'chat' && chat}
      {tab === 'plan' && plans}
      {tab === 'daily' && (
        <Journal
          athlete={athlete} entries={daily} onChange={() => refresh(['daily'])}
          canConfigure={canConfigureJournal} onAthleteChange={onAthleteChange}
        />
      )}
    </>
  );
}
