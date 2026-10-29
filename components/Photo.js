'use client';

import { useEffect, useState } from 'react';
import { getPhoto } from '@/lib/storage';

// Φορτώνει μια αποθηκευμένη φωτογραφία. Δίνει { url, failed } για <img>.
// size: 'thumb' (μικρή, για κάρτες/αρχείο) ή 'full' (κανονική, για μεγέθυνση/σύγκριση).
function usePhoto(id, size) {
  const [state, setState] = useState({ url: null, failed: false });

  useEffect(() => {
    if (!id) return setState({ url: null, failed: false });
    let alive = true;
    let objectUrl = null;
    setState({ url: null, failed: false });
    getPhoto(id, size).then((blob) => {
      if (!alive) return;
      if (!blob) return setState({ url: null, failed: true });
      objectUrl = URL.createObjectURL(blob);
      setState({ url: objectUrl, failed: false });
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, size]);

  return state;
}

export const usePhotoUrl = (id, size = 'full') => usePhoto(id, size).url;

export default function Photo({ id, alt = '', className = '', onClick, size = 'thumb' }) {
  const { url, failed } = usePhoto(id, size);
  // Όσο φορτώνει: κουτί που λάμπει απαλά. Αν δεν φόρτωσε: σκέτο κουτί.
  if (!url) return <span className={`ph ${failed ? 'failed' : ''} ${className}`} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={url} alt={alt} className={className} />;
  return onClick ? <button type="button" className="ph-btn" onClick={onClick} aria-label={alt}>{img}</button> : img;
}
