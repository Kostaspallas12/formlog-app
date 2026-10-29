'use client';

import { useState } from 'react';
import { ANGLES, daysBetween, fmtDate, fmtDelta, fmtKg } from '@/lib/utils';
import BeforeAfter from './BeforeAfter';
import { usePhotoUrl } from './Photo';
import EmptyState from './EmptyState';
import Select from './Select';
import { CompareIcon } from './Icons';

// Σύγκριση δύο καταγραφών: ίδια πλευρά, slider ή δίπλα δίπλα, ημέρες και διαφορά βάρους.
export default function Compare({ checkins }) {
  const withPhotos = checkins.filter((c) => Object.values(c.photos).some(Boolean));
  const [aId, setA] = useState(withPhotos[0]?.id);
  const [bId, setB] = useState(withPhotos[withPhotos.length - 1]?.id);
  const [angle, setAngle] = useState('front');
  const [mode, setMode] = useState('slider');

  const a = withPhotos.find((c) => c.id === aId) || withPhotos[0];
  const b = withPhotos.find((c) => c.id === bId) || withPhotos[withPhotos.length - 1];

  // Πλευρές που υπάρχουν και στις δύο καταγραφές
  const common = a && b ? ANGLES.filter((x) => a.photos[x.id] && b.photos[x.id]) : [];
  const side = common.find((x) => x.id === angle) || common[0];

  const urlA = usePhotoUrl(side ? a.photos[side.id] : null);
  const urlB = usePhotoUrl(side ? b.photos[side.id] : null);

  if (withPhotos.length < 2) {
    return <EmptyState icon={CompareIcon} title="Χρειάζονται δύο καταγραφές με φωτογραφίες" />;
  }

  const days = Math.abs(daysBetween(a.date, b.date));
  const hasKg = a.weight != null && b.weight != null;
  const dKg = hasKg ? b.weight - a.weight : 0;

  const options = withPhotos.map((c) => ({
    value: c.id, label: `${fmtDate(c.date)}${c.weight != null ? ` · ${fmtKg(c.weight)} kg` : ''}`,
  }));

  return (
    <div className="cmp-layout">
      <div className="cmp-view">
        {!side ? (
          <EmptyState icon={CompareIcon} title="Δεν υπάρχει φωτογραφία από την ίδια πλευρά" />
        ) : !urlA || !urlB ? (
          <div className="cmp-loading" />
        ) : mode === 'slider' ? (
          <BeforeAfter before={urlA} after={urlB} beforeLabel={fmtDate(a.date)} afterLabel={fmtDate(b.date)} />
        ) : (
          <div className="side">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlA} alt={`Πριν, ${fmtDate(a.date)}`} />
              <figcaption><b>Πριν</b> · {fmtDate(a.date)}</figcaption>
            </figure>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlB} alt={`Μετά, ${fmtDate(b.date)}`} />
              <figcaption><b>Μετά</b> · {fmtDate(b.date)}</figcaption>
            </figure>
          </div>
        )}
      </div>

      <div className="cmp-controls">
        <div className="f">
          Πριν
          <Select value={a.id} options={options} onChange={setA} label="Πριν" />
        </div>
        <div className="f">
          Μετά
          <Select value={b.id} options={options} onChange={setB} label="Μετά" />
        </div>

        <div className="seg-group">
          <span className="seg-label">Πλευρά</span>
          <div className="seg" role="group" aria-label="Πλευρά">
            {ANGLES.map((x) => (
              <button
                key={x.id} type="button" aria-pressed={side?.id === x.id}
                disabled={!common.some((c) => c.id === x.id)} onClick={() => setAngle(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>

        <div className="seg-group">
          <span className="seg-label">Προβολή</span>
          <div className="seg" role="group" aria-label="Προβολή">
            <button type="button" aria-pressed={mode === 'slider'} onClick={() => setMode('slider')}>Slider</button>
            <button type="button" aria-pressed={mode === 'side'} onClick={() => setMode('side')}>Δίπλα δίπλα</button>
          </div>
        </div>

        <dl className="delta">
          <div>
            <dt>Διάστημα</dt>
            <dd>{days} {days === 1 ? 'ημέρα' : 'ημέρες'}</dd>
          </div>
          <div>
            <dt>Βάρος</dt>
            <dd className={hasKg ? (dKg < 0 ? 'down' : dKg > 0 ? 'up' : '') : ''}>{hasKg ? fmtDelta(dKg) : '–'}</dd>
            {hasKg && <small>{fmtKg(a.weight)} → {fmtKg(b.weight)} kg</small>}
          </div>
        </dl>
      </div>
    </div>
  );
}
