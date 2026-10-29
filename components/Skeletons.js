// Σκελετοί φόρτωσης: το «σχήμα» της σελίδας με γκρι κουτάκια που λάμπουν απαλά,
// ώστε να μη φαίνεται κενή οθόνη όσο έρχονται τα δεδομένα.

const Box = ({ w, h, r, className = '' }) => (
  <span className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />
);

// Κεφαλίδα του κύριου χώρου όταν δεν ξέρουμε ακόμα τον τίτλο.
export function HeadSkeleton({ back = false }) {
  return (
    <div className="pane-head">
      {back && <Box w={36} h={36} r={99} />}
      <Box w={200} h={26} r={8} />
    </div>
  );
}

// Το σώμα του χώρου ενός αθλούμενου: γραμμή σύνοψης και καταγραφές.
export function WorkspaceBodySkeleton() {
  return (
    <div role="status" aria-label="Φόρτωση">
      <div className="summary"><Box w={320} h={16} /></div>
      <div className="timeline">
        {[0, 1].map((i) => (
          <div className="entry" key={i}>
            <div className="sk-stack" style={{ marginBottom: 14 }}>
              <Box w={180} h={18} />
              <Box w={90} h={13} />
            </div>
            <div className="thumbs">
              {[0, 1, 2].map((j) => <Box key={j} w="100%" h="auto" r={10} className="sk-thumb" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// body: μόνο το σώμα (η κεφαλίδα υπάρχει ήδη) · back: με κουμπί «πίσω» στην κεφαλίδα.
export function WorkspaceSkeleton({ body = false, back = false }) {
  return (
    <>
      {!body && <HeadSkeleton back={back} />}
      <WorkspaceBodySkeleton />
    </>
  );
}

// «Λογαριασμός»: μερικά πάνελ.
export function AccountSkeleton() {
  return (
    <div role="status" aria-label="Φόρτωση">
      {[150, 110, 110].map((h, i) => (
        <div className="panel account-block" key={i}>
          <Box w={160} h={18} />
          <Box w="70%" h={14} className="sk-line" />
          <Box w="50%" h={14} className="sk-line" />
        </div>
      ))}
    </div>
  );
}
