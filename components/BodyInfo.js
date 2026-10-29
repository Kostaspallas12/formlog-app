'use client';

import { useState } from 'react';
import { updateAthlete } from '@/lib/storage';

// Σταθερά στοιχεία του αθλούμενου (ηλικία, ύψος), στην ενότητα «Βάρος».
export default function BodyInfo({ athlete, onChange }) {
  const [open, setOpen] = useState(false);
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = () => {
    setAge(athlete.age != null ? String(athlete.age) : '');
    setHeight(athlete.height != null ? String(athlete.height) : '');
    setError('');
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const a = age.trim() ? parseInt(age, 10) : null;
    if (a != null && !(a >= 5 && a <= 120)) return setError('Γράψε μια έγκυρη ηλικία.');
    const h = height.trim() ? parseInt(height, 10) : null;
    if (h != null && !(h >= 80 && h <= 250)) return setError('Γράψε ένα έγκυρο ύψος σε εκατοστά.');
    setBusy(true);
    try {
      onChange(await updateAthlete(athlete.id, { age: a, height: h }));
      setOpen(false);
    } catch {
      setError('Η αποθήκευση απέτυχε. Δοκίμασε ξανά.');
    }
    setBusy(false);
  };

  if (open) {
    return (
      <form className="body-info editing" onSubmit={save}>
        <label>Ηλικία<input inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
        <label>Ύψος (cm)<input inputMode="numeric" maxLength={3} placeholder="π.χ. 172" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} /></label>
        <div className="row">
          <button type="button" className="btn small" onClick={() => setOpen(false)}>Ακύρωση</button>
          <button type="submit" className="btn small primary" disabled={busy}>{busy ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <div className="body-info">
      <div><span>Ηλικία</span><b>{athlete.age != null ? `${athlete.age} ετών` : '—'}</b></div>
      <div><span>Ύψος</span><b>{athlete.height != null ? `${athlete.height} cm` : '—'}</b></div>
      <button type="button" className="btn small" onClick={start}>Αλλαγή</button>
    </div>
  );
}
