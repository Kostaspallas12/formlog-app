'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addPhoto, listGroupMessages, listMessages, markGroupRead, markMessagesRead, onGroupMessages, onMessages,
  sendGroupMessage, sendMessage, uploadVoice, listStarIds, setStar, uuid,
} from '@/lib/storage';
import { processImage } from '@/lib/images';
import { fmtDate } from '@/lib/utils';
import { useLive, useSignal } from './Live';
import Photo from './Photo';
import VoiceNote from './VoiceNote';
import { Lightbox } from './Timeline';
import { ChevronIcon, ClockIcon, CloseIcon, CopyIcon, ImageIcon, MicIcon, PhoneIcon, SendIcon, StarFilledIcon, StarIcon, TicksIcon, TrashIcon, VideoIcon } from './Icons';
import PopMenu from './PopMenu';
import { useWallpaper } from '@/lib/wallpaper';
import { callText } from '@/lib/calls';
import { useCalls } from './Calls';

// Το μήνυμα που ήρθε από τη βάση: παίρνει τη θέση του προσωρινού του (αν υπάρχει), αλλιώς μπαίνει στο τέλος.
function settle(list, m, tempId) {
  if (!list) return list;
  if (list.some((x) => x.id === m.id)) return tempId ? list.filter((x) => x.id !== tempId) : list;
  const i = list.findIndex((x) => x.pending && (x.id === tempId || (x.sender === m.sender && x.body === m.body && !m.photo && !m.audio)));
  if (i < 0) return [...list, m];
  const next = list.slice();
  next[i] = m;
  return next;
}

// Τοπική ημερομηνία (YYYY-MM-DD) για τα διαχωριστικά «Σήμερα», «Χθες», …
const localDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const dayLabel = (iso) => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 864e5);
  if (iso === localDay(today)) return 'Σήμερα';
  if (iso === localDay(yesterday)) return 'Χθες';
  return fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
};
const time = (ts) => new Date(ts).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
const fmtSecs = (n) => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');

// Η συνομιλία (σαν εφαρμογή μηνυμάτων), με κείμενο και φωτογραφίες:
//   ατομική: προπονητής ↔ αθλούμενος για έναν φάκελο (athleteId)
//   ομάδα: groupId · people: { userId → { name, isCoach } } για να φαίνεται ποιος γράφει
// solo: χωρίς καρτέλες από πάνω, για σωστό ύψος.
export default function Chat({ athleteId, groupId, people = {}, me, otherName, solo = false }) {
  const { clearMessages, clearGroup, setOpenChat } = useLive();
  const isGroup = !!groupId;
  const chatId = groupId || athleteId;
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null); // { file, preview } πριν σταλεί
  const [sending, setSending] = useState(false);
  const [wall] = useWallpaper();
  const { call: inCall, start: startCall } = useCalls();
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  // Μηνύματα με αστέρι (δικά μου) + μενού μηνύματος { m, at }.
  const [stars, setStars] = useState(() => new Set());
  const [msgMenu, setMsgMenu] = useState(null);
  const closeMsgMenu = useCallback(() => setMsgMenu(null), []);
  useEffect(() => { listStarIds().then(setStars).catch(() => {}); }, []);
  const toggleStar = async (m) => {
    if (m.pending) return; // (δεν έχει σταλεί ακόμα)
    const on = !stars.has(m.id);
    setStars((cur) => { const n = new Set(cur); if (on) n.add(m.id); else n.delete(m.id); return n; });
    try { await setStar(m.id, isGroup, on); } catch { listStarIds().then(setStars).catch(() => {}); }
  };
  // Παρατεταμένο πάτημα σε μήνυμα (κινητό) = μενού.
  const press = useRef(null);
  const holdStart = (m) => (e) => {
    const t = e.touches[0];
    press.current = setTimeout(() => setMsgMenu({ m, at: { x: t.clientX, y: t.clientY } }), 500);
  };
  const holdEnd = () => clearTimeout(press.current);
  const scroller = useRef(null);
  const input = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const rec = useRef(null);

  const stopTracks = () => {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
  };
  const stopAndSend = () => {
    const r = rec.current;
    if (!r) return;
    const secs = Math.max(1, recSecs);
    r.recorder.onstop = async () => {
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      stopTracks();
      rec.current = null;
      setRecording(false);
      setRecSecs(0);
      if (!blob.size) return;
      setSending(true);
      try {
        const path = await uploadVoice(chatId, blob, r.ext);
        const m = await (isGroup ? sendGroupMessage : sendMessage)(chatId, '', { audio: path, audioSecs: secs });
        setMsgs((list) => (list?.some((x) => x.id === m.id) ? list : [...(list || []), m]));
      } catch (err) {
        setError('Το φωνητικό δεν στάλθηκε. Δοκίμασε ξανά.');
      }
      setSending(false);
    };
    try { r.recorder.stop(); } catch (e) {}
  };
  const cancelRecording = () => {
    const r = rec.current;
    if (!r) return;
    r.recorder.onstop = null;
    try { r.recorder.stop(); } catch (e) {}
    stopTracks();
    rec.current = null;
    setRecording(false);
    setRecSecs(0);
  };
  const startRecording = async () => {
    setError('');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { setError('Δεν δόθηκε άδεια για το μικρόφωνο.'); return; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.current = { recorder, stream, chunks, ext: type.indexOf('mp4') >= 0 ? 'mp4' : 'webm', timer: null };
    recorder.start();
    setRecSecs(0);
    setRecording(true);
    rec.current.timer = setInterval(() => setRecSecs((s) => { if (s >= 600) stopAndSend(); return s + 1; }), 1000);
  };
  useEffect(() => () => stopTracks(), []);

  // Μετά από διακοπή σύνδεσης ή επιστροφή στην καρτέλα: ό,τι ήρθε στο ενδιάμεσο.
  useSignal('resync', null, () => {
    (isGroup ? listGroupMessages : listMessages)(chatId).then(setMsgs).catch(() => {});
  });

  useEffect(() => {
    let alive = true;
    const read = () => (isGroup
      ? markGroupRead(chatId).then(() => clearGroup(chatId))
      : markMessagesRead(chatId, me).then(() => clearMessages(chatId))).catch(() => {});
    setOpenChat(chatId);
    (isGroup ? listGroupMessages : listMessages)(chatId).then((m) => alive && setMsgs(m)).catch(() => alive && setMsgs([]));
    read();
    const stop = (isGroup ? onGroupMessages : onMessages)(chatId, (type, m) => {
      setMsgs((list) => {
        if (!list) return list;
        if (type === 'INSERT') return settle(list, m);
        return list.map((x) => (x.id === m.id ? m : x)); // π.χ. «διαβάστηκε»
      });
      if (type === 'INSERT' && m.sender !== me) read();
    });
    return () => { alive = false; stop(); setOpenChat(null); };
  }, [chatId, isGroup, me, clearMessages, clearGroup, setOpenChat]);

  // Πάντα στο τελευταίο μήνυμα.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [msgs, photo]);

  // Καθάρισμα της προσωρινής προεπισκόπησης.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  const pick = (file) => {
    if (!file) return;
    setError('');
    setPhoto({ file, preview: URL.createObjectURL(file) });
    input.current?.focus();
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !photo) || sending) return;
    // Σκέτο κείμενο: φαίνεται ΑΜΕΣΩΣ (με ρολόι) και επιβεβαιώνεται όταν απαντήσει η βάση.
    if (!photo) {
      const temp = { id: `tmp-${uuid()}`, pending: true, sender: me, body, photo: null, audio: null, createdAt: new Date().toISOString(), readAt: null };
      setMsgs((list) => [...(list || []), temp]);
      setText('');
      setError('');
      input.current?.focus();
      try {
        const m = await (isGroup ? sendGroupMessage : sendMessage)(chatId, body);
        setMsgs((list) => settle(list, m, temp.id));
      } catch {
        setMsgs((list) => list?.filter((x) => x.id !== temp.id));
        setText((t) => t || body); // δεν χάνεται αυτό που έγραψε
        setError('Το μήνυμα δεν στάλθηκε. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.');
      }
      return;
    }
    setSending(true);
    setError('');
    try {
      let path = null;
      if (photo) {
        let versions;
        try {
          versions = await processImage(photo.file); // μικραίνει όπως στις καταγραφές
        } catch {
          throw new Error('Δεν διαβάστηκε η φωτογραφία. Δοκίμασε αρχείο JPG ή PNG.');
        }
        path = await addPhoto(versions, chatId); // στον φάκελο του αθλούμενου ή της ομάδας
      }
      const m = await (isGroup ? sendGroupMessage : sendMessage)(chatId, body, { photo: path });
      setMsgs((list) => (list?.some((x) => x.id === m.id) ? list : [...(list || []), m]));
      setText('');
      setPhoto(null);
    } catch (err) {
      setError(err.message?.startsWith('Δεν') ? err.message : 'Το μήνυμα δεν στάλθηκε. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.');
    }
    setSending(false);
    input.current?.focus();
  };

  let lastDay = null;
  let prevSender = null;
  return (
    <div className={`chatbox wall-${wall}${solo ? ' solo' : ''}`}>
      <div className="chat-scroll" ref={scroller}>
        {!msgs ? (
          <p className="chat-note">Φόρτωση…</p>
        ) : msgs.length === 0 ? (
          <p className="chat-note">{isGroup ? 'Κανένα μήνυμα ακόμα.' : `Στείλε το πρώτο μήνυμα στον/στην ${otherName}.`}</p>
        ) : (
          msgs.map((m) => {
            const day = localDay(new Date(m.createdAt));
            const sep = day !== lastDay && <div className="chat-day" key={`d${day}`}><span>{dayLabel(day)}</span></div>;
            lastDay = day;
            const mine = m.sender === me;
            // Στην ομάδα: όνομα και αρχικό του αποστολέα στο πρώτο από τα συνεχόμενα μηνύματά του.
            const first = isGroup && !mine && (prevSender !== m.sender || !!sep);
            prevSender = m.sender;
            const who = people[m.sender];
            const bubble = (
              <div
                key={m.id} className={`msg${mine ? ' me' : ''}${m.photo ? ' has-photo' : ''}`}
                onContextMenu={(e) => { e.preventDefault(); setMsgMenu({ m, at: { x: e.clientX, y: e.clientY } }); }}
                onTouchStart={holdStart(m)} onTouchEnd={holdEnd} onTouchMove={holdEnd}
              >
                <button
                  type="button" className="msg-more" aria-label="Επιλογές μηνύματος"
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMsgMenu({ m, at: { x: r.left, y: r.bottom + 4 } }); }}
                >
                  <ChevronIcon size={18} />
                </button>
                {first && (
                  <span className="msg-from">
                    {who?.name || 'Πρώην μέλος'}
                    {who?.isCoach && <em className="msg-role">Προπονητής</em>}
                  </span>
                )}
                {m.photo && (
                  <Photo id={m.photo} alt="Φωτογραφία" className="msg-photo" onClick={() => setZoom({ id: m.photo, label: `Φωτογραφία · ${dayLabel(day)} ${time(m.createdAt)}` })} />
                )}
                {m.audio && <VoiceNote path={m.audio} secs={m.audioSecs} mine={mine} />}
                {m.call && (
                  // Η γραμμή μιας κλήσης· κλικ = ξανά κλήση.
                  <button
                    type="button" className={`msg-call${m.call.status !== 'ended' ? ' missed' : ''}`} disabled={!!inCall || isGroup}
                    onClick={() => startCall(athleteId, m.call.video)} title={m.call.video ? 'Νέα βιντεοκλήση' : 'Νέα κλήση'}
                  >
                    <span className="msg-call-icon">{m.call.video ? <VideoIcon size={18} /> : <PhoneIcon size={18} />}</span>
                    <span>{callText(m.call, mine)}</span>
                  </button>
                )}
                {m.body && <p>{m.body}</p>}
                <span className="msg-meta">
                  {stars.has(m.id) && <StarFilledIcon size={12} className="msg-star" aria-label="Με αστέρι" />}
                  {time(m.createdAt)}
                  {m.pending && <ClockIcon size={13} className="msg-pending" aria-label="Αποστέλλεται" />}
                  {mine && !isGroup && !m.pending && !m.call && <TicksIcon size={16} className={m.readAt ? 'read' : ''} aria-label={m.readAt ? 'Διαβάστηκε' : 'Στάλθηκε'} />}
                </span>
              </div>
            );
            if (!isGroup || mine) return [sep, bubble];
            return [
              sep,
              <div key={m.id} className={`msg-line${first ? ' first' : ''}`}>
                {first
                  ? <span className={`msg-avatar${who?.isCoach ? ' coach' : ''}`} aria-hidden="true">{(who?.name || '?').charAt(0).toUpperCase()}</span>
                  : <span className="msg-avatar-space" />}
                {bubble}
              </div>,
            ];
          })
        )}
      </div>

      {photo && (
        <div className="chat-attach">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.preview} alt="Φωτογραφία προς αποστολή" />
          <span>{sending ? 'Αποστολή…' : 'Φωτογραφία'}</span>
          <button type="button" className="x" onClick={() => setPhoto(null)} disabled={sending} aria-label="Αφαίρεση φωτογραφίας"><CloseIcon size={18} /></button>
        </div>
      )}
      {error && <p className="error chat-error" role="alert">{error}</p>}
      {recording ? (
        <div className="chat-record">
          <button type="button" className="icon-btn chat-rec-cancel" onClick={cancelRecording} aria-label="Ακύρωση ηχογράφησης">
            <TrashIcon size={20} />
          </button>
          <span className="chat-rec-dot" aria-hidden="true" />
          <span className="chat-rec-time">{fmtSecs(recSecs)}</span>
          <span className="chat-rec-hint">Ηχογράφηση…</span>
          <button type="button" className="icon-btn round primary" onClick={stopAndSend} disabled={sending} aria-label="Αποστολή φωνητικού">
            <SendIcon size={20} />
          </button>
        </div>
      ) : (
        <form className="chat-compose" onSubmit={send}>
          <label className="icon-btn chat-pick" title="Φωτογραφία" aria-label="Αποστολή φωτογραφίας">
            <ImageIcon />
            <input type="file" accept="image/*" onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} disabled={sending} />
          </label>
          <textarea
            ref={input} rows={1} value={text} maxLength={4000} placeholder={photo ? 'Λεζάντα' : 'Μήνυμα'} aria-label="Μήνυμα"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          />
          {text.trim() || photo ? (
            <button type="submit" className="icon-btn round primary" disabled={sending} aria-label="Αποστολή">
              <SendIcon size={20} />
            </button>
          ) : (
            <button type="button" className="icon-btn round primary" onClick={startRecording} disabled={sending} aria-label="Ηχογράφηση φωνητικού">
              <MicIcon size={20} />
            </button>
          )}
        </form>
      )}

      {zoom && <Lightbox {...zoom} onClose={() => setZoom(null)} />}
      {msgMenu && (
        <PopMenu
          at={msgMenu.at} onClose={closeMsgMenu} label="Επιλογές μηνύματος"
          items={[
            stars.has(msgMenu.m.id)
              ? { Icon: StarIcon, label: 'Αφαίρεση αστεριού', run: () => toggleStar(msgMenu.m) }
              : { Icon: StarIcon, label: 'Αστέρι', run: () => toggleStar(msgMenu.m) },
            msgMenu.m.body && { Icon: CopyIcon, label: 'Αντιγραφή', run: () => navigator.clipboard?.writeText(msgMenu.m.body).catch(() => {}) },
          ]}
        />
      )}
    </div>
  );
}
