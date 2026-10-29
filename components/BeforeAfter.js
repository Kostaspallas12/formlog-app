'use client';

import { useState } from 'react';

// Slider πριν/μετά: σύρεις τη λαβή και αποκαλύπτεται η μία φωτογραφία πάνω στην άλλη.
export default function BeforeAfter({ before, after, beforeLabel, afterLabel }) {
  const [pos, setPos] = useState(50);

  return (
    <div className="cmp" style={{ '--p': `${pos}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={`Μετά: ${afterLabel}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="before" src={before} alt={`Πριν: ${beforeLabel}`} />
      <div className="handle" aria-hidden="true" />
      <span className="tag l">{beforeLabel}</span>
      <span className="tag r">{afterLabel}</span>
      <input
        type="range" min="0" max="100" value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Σύρε για σύγκριση πριν και μετά"
      />
    </div>
  );
}
