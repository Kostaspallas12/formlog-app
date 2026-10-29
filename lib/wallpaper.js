'use client';

import { useEffect, useState } from 'react';

// Φόντο της συνομιλίας, σε αυτή τη συσκευή (όπως στις εφαρμογές μηνυμάτων).
// Τα μοτίβα είναι στο app/walls.css.
export const WALLPAPERS = [
  { id: 'plain', label: 'Κλασικό' },
  { id: 'brand', label: 'Ορίζοντας' },
  { id: 'gym', label: 'Ατσάλι' },
  { id: 'food', label: 'Περιβόλι' },
];

const KEY = 'formlog_wallpaper';
const EVENT = 'formlog-wallpaper';

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return WALLPAPERS.some((w) => w.id === v) ? v : 'plain';
  } catch {
    return 'plain';
  }
}

// [τρέχον φόντο, αλλαγή]· όλες οι ανοιχτές συνομιλίες (και οι άλλες καρτέλες) αλλάζουν αμέσως.
export function useWallpaper() {
  const [wall, setWall] = useState('plain');
  useEffect(() => {
    const sync = () => setWall(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const change = (id) => {
    try { localStorage.setItem(KEY, id); } catch {}
    setWall(id);
    window.dispatchEvent(new Event(EVENT));
  };
  return [wall, change];
}
