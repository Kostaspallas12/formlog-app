'use client';

import { useState } from 'react';
import { confirmDialog } from '@/components/Confirm';
import { sendMessage, setCheckinReviewed } from '@/lib/storage';
import { answerText, trend } from '@/lib/checkinForm';
import { ANGLES, daysBetween, fmtDate, fmtDelta, fmtKg } from '@/lib/utils';
import { useGuard } from '@/lib/useGuard';
import Photo from './Photo';
import Menu from './Menu';
import Select from './Select';
import { Lightbox } from './Timeline';
import { ArrowForwardIcon, BackIcon, ReadAllIcon, SendIcon } from './Icons';

// Τα check-in σε πίνακα (σαν υπολογιστικό φύλλο) και η οθόνη ελέγχου ενός check-in.
// viewer: 'coach' (ο προπονητής) ή 'self' (ο ίδιος) · coached: ο φάκελος έχει προπονητή (τότε υπάρχει «Ελέγχθηκε»).

const shortDate = (iso) => fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });

// Κάθε check-in μαζί με το προηγούμενό του (για μεταβολές και σύγκριση).
function withPrevious(checkins) {
  let lastKg = null;
  return checkins.map((c, i) => {
    const delta = c.weight != null && lastKg != null ? c.weight - lastKg : null;
    if (c.weight != null) lastKg = c.weight;
    return { c, prev: checkins[i - 1] ?? null, delta };
  });
}

function Status({ c, viewer, coached, onOpen }) {
  if (!coached) return null;
  if (c.reviewedAt) {
    return <span className="ci-status done"><ReadAllIcon size={18} />Ελέγχθηκε</span>;
  }
  if (viewer === 'coach') {
    return (
      <button type="button" className="ci-review-btn" onClick={(e) => { e.stopPropagation(); onOpen(c); }}>
        Έλεγχος<ArrowForwardIcon size={18} />
      </button>
    );
  }
  return <span className="ci-status">Στάλθηκε</span>;
}

/* ---------- Πίνακας ---------- */

export function CheckinTable({ checkins, form, viewer, coached, onOpen }) {
  const rows = withPrevious(checkins).reverse(); // νεότερο πάνω
  const first = checkins[0]?.date;
  const cols = form.filter((q) => q.kind === 'scale').slice(0, 3); // οι 3 πρώτες κλίμακες ως στήλες

  return (
    <div className="ci-table-box">
      <div className="ci-scroll">
        <table className="ci-table">
          <thead>
            <tr>
              <th scope="col">Ημερομηνία</th>
              <th scope="col">Φωτογραφίες</th>
              <th scope="col" className="num">Βάρος</th>
              <th scope="col" className="num">Μεταβολή</th>
              {cols.map((q) => <th scope="col" key={q.id} className="mid">{q.short || q.label}</th>)}
              {coached && <th scope="col">Κατάσταση</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, prev, delta }) => (
              <tr key={c.id} className={coached && !c.reviewedAt && viewer === 'coach' ? 'pending' : ''} onClick={() => onOpen(c)}>
                <td>
                  <button type="button" className="ci-date" onClick={(e) => { e.stopPropagation(); onOpen(c); }}>{shortDate(c.date)}</button>
                  <small>εβδομάδα {Math.floor(daysBetween(first, c.date) / 7) + 1}</small>
                </td>
                <td>
                  <span className="ci-thumbs">
                    {ANGLES.map((a) => (c.photos[a.id]
                      ? <Photo key={a.id} id={c.photos[a.id]} alt={a.label} />
                      : <span key={a.id} className="ci-thumb-empty" />))}
                  </span>
                </td>
                <td className="num">{c.weight != null ? `${fmtKg(c.weight)} kg` : '–'}</td>
                <td className={`num ${delta == null ? '' : delta < 0 ? 'down' : delta > 0 ? 'up' : ''}`}>{delta != null ? fmtDelta(delta).replace(' kg', '') : '–'}</td>
                {cols.map((q) => {
                  const v = c.answers?.[q.id];
                  const t = trend(q, prev?.answers?.[q.id], v);
                  return <td key={q.id} className={`mid num${t === -1 ? ' worse' : ''}`}>{v != null ? `${v}/10` : '–'}</td>;
                })}
                {coached && <td><Status c={c} viewer={viewer} coached={coached} onOpen={onOpen} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Οθόνη ελέγχου ενός check-in ---------- */

export function CheckinReview({ checkins, id, form, viewer, coached, athlete, onBack, onOpen, onEdit, onDelete, onChanged }) {
  const index = checkins.findIndex((c) => c.id === id);
  const all = withPrevious(checkins);
  const { c, prev, delta } = all[index] ?? {};
  const [withId, setWithId] = useState(null); // σύγκριση φωτογραφιών με όποιο άλλο check-in διαλέξει
  const [zoom, setZoom] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const guard = useGuard();
  if (!c) return null;

  const isCoach = viewer === 'coach';
  const newer = checkins[index + 1];
  const older = checkins[index - 1];
  const answered = form.filter((q) => c.answers?.[q.id] != null || prev?.answers?.[q.id] != null);

  // Σύγκριση: οποιοδήποτε άλλο check-in με φωτογραφίες (π.χ. το πρώτο, πριν από χρόνια).
  const first = checkins[0];
  const others = checkins.filter((x) => x.id !== c.id && Object.keys(x.photos).length > 0).reverse();
  const options = others.map((x) => ({
    value: x.id,
    label: `${fmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' })} · εβδομάδα ${Math.floor(daysBetween(first.date, x.date) / 7) + 1}${x.id === first.id ? ' · πρώτο' : ''}`,
  }));
  const other = others.find((x) => x.id === withId) ?? null;
  const defaultOther = others.find((x) => x.date <= c.date) ?? others[0];
  const pair = other ? (other.date <= c.date ? [other, c] : [c, other]) : [c]; // πάντα το παλαιότερο αριστερά
  // Μεταβολή βάρους ανάμεσα στα δύο (από το παλαιότερο στο νεότερο).
  const since = other && pair[0].weight != null && pair[1].weight != null ? pair[1].weight - pair[0].weight : null;

  const toggleReviewed = async () => {
    setBusy(true);
    try { await setCheckinReviewed(c.id, !c.reviewedAt); onChanged(); } catch { setError('Δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); }
    setBusy(false);
  };

  // Απάντηση του προπονητή: πηγαίνει στη συνομιλία και το check-in γίνεται «Ελέγχθηκε».
  const send = async (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    setError('');
    try {
      await sendMessage(athlete.id, `Για το check-in της ${fmtDate(c.date, { day: 'numeric', month: 'long' })}:\n${text}`);
      if (!c.reviewedAt) await setCheckinReviewed(c.id, true);
      setReply('');
      onChanged();
    } catch {
      setError('Το μήνυμα δεν στάλθηκε. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.');
    }
    setBusy(false);
  };

  return (
    <section className="ci-review" aria-label={`Check-in ${fmtDate(c.date)}`}>
      <div className="ci-bar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Όλα τα check-in"><BackIcon /></button>
        <div className="ci-bar-title">
          <h2>{fmtDate(c.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <small>
            {coached ? (c.reviewedAt ? 'Ελέγχθηκε' : isCoach ? 'Προς έλεγχο' : 'Στάλθηκε') : 'Check-in'}
          </small>
        </div>
        <button type="button" className="icon-btn" onClick={() => older && onOpen(older)} disabled={!older} aria-label="Προηγούμενο check-in"><BackIcon /></button>
        <button type="button" className="icon-btn flip" onClick={() => newer && onOpen(newer)} disabled={!newer} aria-label="Επόμενο check-in"><BackIcon /></button>
        {isCoach && coached && (
          <button type="button" className={`btn${c.reviewedAt ? '' : ' primary'}`} onClick={toggleReviewed} disabled={busy}>
            <ReadAllIcon size={18} />{c.reviewedAt ? 'Ξανά προς έλεγχο' : 'Σήμανση ως ελεγμένο'}
          </button>
        )}
        <Menu
          label="Επιλογές check-in"
          items={[
            { label: 'Επεξεργασία', onClick: () => onEdit(c) },
            {
              label: 'Διαγραφή', danger: true,
              onClick: async () => { if (await confirmDialog('Οριστική διαγραφή αυτού του check-in και των φωτογραφιών του;')) onDelete(c); },
            },
          ]}
        />
      </div>

      <div className="ci-grid">
        <div className="ci-col">
          <div className="ci-col-head">
            <h3>Φωτογραφίες</h3>
            {others.length > 0 && (
              <div className="seg" role="group" aria-label="Προβολή φωτογραφιών">
                <button type="button" aria-pressed={!other} onClick={() => setWithId(null)}>Τώρα</button>
                <button type="button" aria-pressed={!!other} onClick={() => setWithId(other?.id ?? defaultOther.id)}>Σύγκριση</button>
              </div>
            )}
          </div>
          {other && (
            <div className="ci-compare-pick">
              <span>Δίπλα σε:</span>
              <Select label="Σύγκριση με check-in" value={other.id} options={options} onChange={setWithId} />
            </div>
          )}
          <div className={`ci-photos${other ? ' side' : ''}`}>
            {other && (
              <div className="ci-pair ci-pair-dates" aria-hidden="true">
                {pair.map((x) => <b key={x.id}>{fmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' })}{x.id === c.id ? ' (αυτό)' : ''}</b>)}
              </div>
            )}
            {ANGLES.map((a) => (
              <figure key={a.id}>
                <div className="ci-pair">
                  {pair.map((x) => (x.photos[a.id]
                    ? <Photo key={x.id} id={x.photos[a.id]} alt={`${a.label}, ${fmtDate(x.date)}`} onClick={() => setZoom({ id: x.photos[a.id], label: `${a.label} · ${fmtDate(x.date)}` })} />
                    : <span key={x.id} className="ci-photo-empty" />))}
                </div>
                <figcaption>{a.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="ci-facts">
            <div><small>Βάρος</small><b>{c.weight != null ? `${fmtKg(c.weight)} kg` : '–'}</b></div>
            <div><small>Από το προηγούμενο</small><b className={delta == null ? '' : delta < 0 ? 'down' : delta > 0 ? 'up' : ''}>{delta != null ? fmtDelta(delta) : '–'}</b></div>
            {other && (
              <div>
                <small>{fmtDate(pair[0].date, { day: 'numeric', month: 'short', year: 'numeric' })} → {fmtDate(pair[1].date, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
                <b className={since == null ? '' : since < 0 ? 'down' : since > 0 ? 'up' : ''}>{since != null ? fmtDelta(since) : '–'}</b>
              </div>
            )}
          </div>
        </div>

        <div className="ci-col">
          {answered.length > 0 && (
            <div className="ci-answers">
              <div className="ci-answers-head">
                <h3>Ερωτηματολόγιο</h3>
                <span className="ci-prev-col">{prev ? fmtDate(prev.date, { day: 'numeric', month: 'short' }) : ''}</span>
                <span className="ci-now-col">{fmtDate(c.date, { day: 'numeric', month: 'short' })}</span>
                <span className="ci-trend-col" />
              </div>
              {answered.map((q) => {
                const now = c.answers?.[q.id];
                const before = prev?.answers?.[q.id];
                const t = trend(q, before, now);
                return (
                  <div className="ci-answer" key={q.id}>
                    <span className="ci-q">{q.label}</span>
                    <span className="ci-prev-col">{answerText(q, before)}</span>
                    <span className="ci-now-col">
                      {q.kind === 'scale' && now != null ? (
                        <span className="dots" role="img" aria-label={`${now} από 10`}>
                          {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < now ? 'on' : ''} />)}
                          <b>{now}</b>
                        </span>
                      ) : <b>{answerText(q, now)}</b>}
                    </span>
                    <span className={`ci-trend-col ${t === 1 ? 'better' : t === -1 ? 'worse' : ''}`} aria-label={t === 1 ? 'καλύτερα' : t === -1 ? 'χειρότερα' : undefined}>
                      {t === 1 || t === -1 ? (q.kind === 'scale' ? ((now > before) ? '↑' : '↓') : (t === 1 ? '✓' : '!')) : t === 0 ? '–' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {c.note && (
            <div className="ci-note">
              <small>{isCoach ? `Σχόλιο ${athlete.name ? `από ${athlete.name}` : ''}` : 'Η σημείωσή σου'}</small>
              <p>{c.note}</p>
            </div>
          )}

          {isCoach && coached && (
            <form className="ci-reply" onSubmit={guard(send)}>
              <label htmlFor="ci-reply-text">Η απάντησή σου</label>
              <textarea
                id="ci-reply-text" rows={3} maxLength={3500} value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder="Γράψε σχόλιο για αυτό το check-in…"
              />
              <div className="ci-reply-bar">
                <small>Στέλνεται και στη συνομιλία</small>
                <button type="submit" className="btn primary" disabled={busy || !reply.trim()}>
                  <SendIcon size={18} />{c.reviewedAt ? 'Αποστολή' : 'Αποστολή & ελεγμένο'}
                </button>
              </div>
            </form>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>

      {zoom && <Lightbox {...zoom} onClose={() => setZoom(null)} />}
    </section>
  );
}
