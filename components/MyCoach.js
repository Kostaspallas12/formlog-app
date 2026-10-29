'use client';

import { useLive } from './Live';

// Για τον αθλούμενο: με ποιον προπονητή συνεργάζεται (μικρή γραμμή κάτω από τον τίτλο).
export default function MyCoach() {
  const { coach } = useLive(); // ζωντανά: αλλάζει μόλις συνδεθεί/διακόψει ο προπονητής

  if (!coach) return null;
  return <span>Προπονητής: <b>{coach.name}</b></span>;
}
