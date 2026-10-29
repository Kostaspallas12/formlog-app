import Link from 'next/link';
import { BackIcon } from './Icons';

// Η κεφαλίδα του κύριου χώρου (σαν την κεφαλίδα μιας συνομιλίας): πίσω, όνομα, ενέργειες.
export default function PaneHead({ title, subtitle, avatar, backHref, actions }) {
  return (
    <header className="pane-head">
      {backHref && (
        <Link href={backHref} className="icon-btn pane-back" aria-label="Πίσω"><BackIcon /></Link>
      )}
      {avatar}
      <div className="pane-title">
        <h1>{title}</h1>
        {subtitle && <div className="pane-sub">{subtitle}</div>}
      </div>
      {actions && <div className="pane-actions">{actions}</div>}
    </header>
  );
}
