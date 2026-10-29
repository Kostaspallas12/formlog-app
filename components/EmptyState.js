// Κενή οθόνη (π.χ. «Καμία καταγραφή ακόμα»): εικονίδιο σε κύκλο, σύντομος τίτλος και προαιρετικά κουμπί.
export default function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="empty-state">
      {Icon && <span className="empty-icon" aria-hidden="true"><Icon size={30} /></span>}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
