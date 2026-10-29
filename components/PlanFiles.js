'use client';

import { useEffect, useState } from 'react';
import { downloadPlanFile } from '@/lib/storage';
import { CloseIcon } from './Icons';
import FileViewer from './FileViewer';

const isImage = (f) => f.type === 'image/jpeg' || f.type === 'image/png';
const fmtSize = (b) => (b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB');
const fileExt = (name) => name.split('.').pop().toUpperCase().slice(0, 4);

function RemoveBtn({ f, busy, onRemove }) {
  return (
    <button type="button" className="icon-btn" aria-label={'Αφαίρεση ' + f.name} title="Αφαίρεση" disabled={busy} onClick={() => onRemove(f)}>
      <CloseIcon size={18} />
    </button>
  );
}

// Εικόνα (JPG/PNG): προεπισκόπηση· κλικ ανοίγει το παράθυρο προβολής.
function PlanImage({ f, coach, busy, onRemove, onView }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let obj = null;
    downloadPlanFile(f.path)
      .then((blob) => { if (alive) { obj = URL.createObjectURL(blob); setUrl(obj); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [f.path]);
  return (
    <div className="plan-photo">
      <button type="button" className="plan-photo-open" onClick={() => onView(f)} title={f.name} aria-label={'Άνοιγμα ' + f.name}>
        {url ? <img src={url} alt={f.name} /> : <span className={failed ? 'ph failed' : 'ph'} aria-hidden="true" />}
      </button>
      {coach && onRemove && <RemoveBtn f={f} busy={busy} onRemove={onRemove} />}
    </div>
  );
}

function PlanDoc({ f, coach, busy, onRemove, onView }) {
  return (
    <div className="plan-file">
      <button type="button" className="plan-file-open" onClick={() => onView(f)} title="Άνοιγμα">
        <span className="plan-file-ext">{fileExt(f.name)}</span>
        <span className="plan-file-name"><b>{f.name}</b><small>{fmtSize(f.size)}</small></span>
      </button>
      {coach && onRemove && <RemoveBtn f={f} busy={busy} onRemove={onRemove} />}
    </div>
  );
}

// Τα αρχεία ενός προγράμματος: εικόνες ως προεπισκόπηση, τα υπόλοιπα ως κάρτες·
// κλικ οπουδήποτε ανοίγει το αρχείο μέσα στη σελίδα.
export default function PlanFiles({ files, coach, busy, onRemove }) {
  const [viewing, setViewing] = useState(null);
  const images = files.filter(isImage);
  const docs = files.filter((f) => !isImage(f));
  return (
    <>
      {images.length > 0 && (
        <div className="plan-photos">
          {images.map((f) => <PlanImage key={f.path} f={f} coach={coach} busy={busy} onRemove={onRemove} onView={setViewing} />)}
        </div>
      )}
      {docs.length > 0 && (
        <div className="plan-files">
          {docs.map((f) => <PlanDoc key={f.path} f={f} coach={coach} busy={busy} onRemove={onRemove} onView={setViewing} />)}
        </div>
      )}
      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
