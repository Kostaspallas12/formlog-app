'use client';

import { useRef, useState } from 'react';
import Photo from './Photo';
import { processAvatar } from '@/lib/images';
import { CloseIcon } from './Icons';

// Στρογγυλή φωτογραφία προφίλ με αλλαγή (κλικ και επιλογή αρχείου) και αφαίρεση.
export default function AvatarPicker({ avatar, name, size = 64, onPick, onRemove, editable = true }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = async (file) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const blob = await processAvatar(file);
      await onPick(blob);
    } catch {
      setError('Η φωτογραφία δεν ανέβηκε. Δοκίμασε JPG ή PNG.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try { await onRemove(); } finally { setBusy(false); }
  };

  const letter = (name || '?').charAt(0).toUpperCase();
  const face = avatar ? <Photo id={avatar} alt="" className="avatar-img" /> : <span className="avatar-img initial">{letter}</span>;

  if (!editable) {
    return <span className="avatar-pic static" style={{ width: size, height: size }}>{face}</span>;
  }

  return (
    <div className="avatar-picker">
      <button
        type="button" className="avatar-pic" style={{ width: size, height: size }} disabled={busy}
        onClick={() => input.current && input.current.click()}
        aria-label={avatar ? 'Αλλαγή φωτογραφίας' : 'Προσθήκη φωτογραφίας'} title="Αλλαγή φωτογραφίας"
      >
        {face}
        <span className="avatar-edit" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files[0])} />
      {avatar && onRemove && (
        <button type="button" className="icon-btn avatar-remove" onClick={remove} disabled={busy} aria-label="Αφαίρεση φωτογραφίας" title="Αφαίρεση">
          <CloseIcon size={16} />
        </button>
      )}
      {error && <p className="error avatar-error" role="alert">{error}</p>}
    </div>
  );
}
