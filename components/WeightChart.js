'use client';

import { daysBetween, fmtDate, fmtKg } from '@/lib/utils';

const W = 640;
const H = 240;
const PAD = { l: 44, r: 16, t: 16, b: 30 };

// Γράφημα βάρους στον χρόνο (από τον πίνακα βάρους). Χωρίς δεδομένα δεν δείχνει τίποτα.
export default function WeightChart({ entries }) {
  const pts = entries.filter((c) => c.weight != null);

  if (!pts.length) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const span = Math.max(1, daysBetween(first.date, last.date));
  const kgs = pts.map((p) => p.weight);
  const lo = Math.floor(Math.min(...kgs) - 1);
  const hi = Math.ceil(Math.max(...kgs) + 1);

  const x = (date) => PAD.l + (pts.length === 1 ? 0.5 : daysBetween(first.date, date) / span) * (W - PAD.l - PAD.r);
  const y = (kg) => PAD.t + ((hi - kg) / (hi - lo)) * (H - PAD.t - PAD.b);

  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const line = pts.map((p) => `${x(p.date)},${y(p.weight)}`).join(' ');
  const area = `${x(first.date)},${H - PAD.b} ${line} ${x(last.date)},${H - PAD.b}`;

  return (
    <div className="weight">
      <div className="panel">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Βάρος από ${fmtKg(first.weight)} σε ${fmtKg(last.weight)} κιλά`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text>
            </g>
          ))}
          {pts.length > 1 && <polygon className="area" points={area} />}
          {pts.length > 1 && <polyline className="line" points={line} />}
          {pts.map((p) => (
            <circle key={p.id} className="dot" cx={x(p.date)} cy={y(p.weight)} r="4.5">
              <title>{`${fmtDate(p.date)}: ${fmtKg(p.weight)} kg`}</title>
            </circle>
          ))}
          <text className="tick" x={x(first.date)} y={H - 8} textAnchor={pts.length === 1 ? 'middle' : 'start'}>
            {fmtDate(first.date)}
          </text>
          {pts.length > 1 && <text className="tick" x={x(last.date)} y={H - 8} textAnchor="end">{fmtDate(last.date)}</text>}
        </svg>
      </div>
    </div>
  );
}
