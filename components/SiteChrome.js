'use client';

import { usePathname } from 'next/navigation';
import AppShell from './AppShell';

// Οι σελίδες της εφαρμογής (μετά την είσοδο) έχουν δική τους διάταξη τύπου εφαρμογής μηνυμάτων:
// μενού στο πλάι (κάτω στο κινητό) και χωρίς την πάνω μπάρα/footer του site.
export default function SiteChrome({ header, footer, children }) {
  const path = usePathname();
  const inApp = path.startsWith('/dashboard') || path.startsWith('/account');
  if (inApp) return <AppShell>{children}</AppShell>;
  return <>{header}{children}{footer}</>;
}
