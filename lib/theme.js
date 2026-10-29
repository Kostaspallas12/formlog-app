'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY } from './themeBoot';

// Εμφάνιση της εφαρμογής σε αυτή τη συσκευή: Αυτόματο (όπως η συσκευή) / Φωτεινό / Σκούρο.
// Εφαρμόζεται με data-theme στο <html>· το app/layout.js το βάζει πριν σχεδιαστεί η σελίδα (lib/themeBoot.js).
export const THEMES = [
  { id: 'auto', label: 'Αυτόματο' },
  { id: 'light', label: 'Φωτεινό' },
  { id: 'dark', label: 'Σκούρο' },
];

const KEY = THEME_KEY;
const EVENT = 'formlog-theme';

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(id) {
  if (id === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
}

// [τρέχουσα εμφάνιση, αλλαγή]· αλλάζει αμέσως και στις άλλες ανοιχτές καρτέλες.
export function useTheme() {
  const [theme, setTheme] = useState('auto');
  useEffect(() => {
    const sync = () => { const v = read(); setTheme(v); apply(v); };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const change = (id) => {
    try {
      if (id === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, id);
    } catch {}
    setTheme(id);
    apply(id);
    window.dispatchEvent(new Event(EVENT));
  };
  return [theme, change];
}
