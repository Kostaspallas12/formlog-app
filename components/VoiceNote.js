'use client';

import { useEffect, useRef, useState } from 'react';
import { getVoice } from '@/lib/storage';
import { PauseIcon, PlayIcon } from './Icons';

const fmt = (n) => Math.floor(n / 60) + ':' + String(Math.max(0, Math.floor(n % 60))).padStart(2, '0');

// Φωνητικό μήνυμα: κουμπί αναπαραγωγής, μπάρα προόδου και χρόνος.
export default function VoiceNote({ path, secs, mine }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(secs || 0);
  const audio = useRef(null);

  useEffect(() => {
    let alive = true;
    let obj = null;
    getVoice(path)
      .then((blob) => { if (alive) { obj = URL.createObjectURL(blob); setUrl(obj); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [path]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  const total = dur || secs || 0;
  const pct = total ? Math.min(100, (cur / total) * 100) : 0;
  const shown = playing || cur ? cur : total;

  return (
    <div className={'voice' + (mine ? ' me' : '')}>
      <button type="button" className="voice-play" onClick={toggle} disabled={!url} aria-label={playing ? 'Παύση' : 'Αναπαραγωγή'}>
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
      <div className="voice-track" aria-hidden="true"><span className="voice-fill" style={{ width: pct + '%' }} /></div>
      <span className="voice-time">{failed ? '—' : fmt(shown)}</span>
      {url && (
        <audio
          ref={audio} src={url} preload="metadata"
          onTimeUpdate={(e) => setCur(e.target.currentTime)}
          onEnded={() => { setPlaying(false); setCur(0); }}
          onLoadedMetadata={(e) => { const d = e.target.duration; if (isFinite(d) && d > 0) setDur(d); }}
        />
      )}
    </div>
  );
}
