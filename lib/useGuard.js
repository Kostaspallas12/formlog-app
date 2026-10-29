'use client';

import { useCallback, useRef } from 'react';

// Φύλακας για κουμπιά/φόρμες που δημιουργούν κάτι: όσο τρέχει η ενέργεια, δεύτερο πάτημα αγνοείται.
// (Το «busy» της κατάστασης δεν φτάνει: ένα γρήγορο διπλό πάτημα —συχνό στο κινητό— προλαβαίνει
// πριν ξανασχεδιαστεί το κουμπί ως απενεργοποιημένο, και θα έφτιαχνε δύο καταγραφές.)
// Χρήση: const guard = useGuard();  …  onSubmit={guard(submit)}
export function useGuard() {
  const running = useRef(false);
  return useCallback((fn) => async (...args) => {
    if (running.current) { args[0]?.preventDefault?.(); return undefined; }
    running.current = true;
    try {
      return await fn(...args);
    } finally {
      running.current = false;
    }
  }, []);
}
