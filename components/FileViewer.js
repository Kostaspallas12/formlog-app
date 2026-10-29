'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadPlanFile } from '@/lib/storage';
import { CloseIcon, DownloadIcon } from './Icons';

// Προβολή αρχείου μέσα στη σελίδα: εικόνα, PDF και κείμενο προβάλλονται·
// Έγγραφα και πίνακες (doc/xls) δεν προβάλλονται από τον browser, οπότε δίνουμε Λήψη.
export default function FileViewer({ file, onClose }) {
  const [url, setUrl] = useState(null);
  const [text, setText] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let obj = null;
    downloadPlanFile(file.path)
      .then(async (blob) => {
        if (!alive) return;
        obj = URL.createObjectURL(blob);
        setUrl(obj);
        if (file.type === 'text/plain') setText(await blob.text());
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [file.path, file.type]);

  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [close]);

  const download = () => {
    if (!url) return;
    Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
  };

  const isImg = file.type === 'image/jpeg' || file.type === 'image/png';
  const isPdf = file.type === 'application/pdf';
  const isText = file.type === 'text/plain';

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={file.name} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="viewer-box">
        <header className="viewer-head">
          <b className="viewer-name">{file.name}</b>
          <div className="viewer-actions">
            <button type="button" className="btn small" onClick={download} disabled={!url}><DownloadIcon size={16} /> Λήψη</button>
            <button type="button" className="icon-btn" onClick={close} aria-label="Κλείσιμο"><CloseIcon /></button>
          </div>
        </header>
        <div className="viewer-body">
          {failed ? (
            <p className="meta">Το αρχείο δεν φορτώθηκε. Δοκίμασε ξανά.</p>
          ) : !url ? (
            <span className="sk viewer-sk" aria-label="Φόρτωση" />
          ) : isImg ? (
            <img src={url} alt={file.name} />
          ) : isPdf ? (
            <iframe src={url} title={file.name} />
          ) : isText ? (
            <pre>{text}</pre>
          ) : (
            <div className="viewer-noprev">
              <p>Αυτός ο τύπος αρχείου δεν προβάλλεται στη σελίδα.</p>
              <button type="button" className="btn primary" onClick={download}><DownloadIcon size={18} /> Λήψη αρχείου</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
