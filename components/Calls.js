'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iceServers, onCalls, RING_MS, ringingForMe, setCallStatus, signalChannel, startCall, fmtSecs } from '@/lib/calls';
import { useLive } from './Live';
import Photo from './Photo';
import {
  FlipIcon, MicIcon, MicOffIcon, MinimizeIcon, PhoneIcon, PhoneOffIcon, ScreenIcon, VideoIcon, VideoOffIcon,
} from './Icons';

// Κλήσεις και βιντεοκλήσεις προπονητή ↔ αθλούμενου, όπως στις εφαρμογές μηνυμάτων:
// κουδούνισμα σε όποια σελίδα κι αν είσαι, οθόνη κλήσης, σίγαση, κάμερα, κοινή χρήση οθόνης,
// σμίκρυνση (για να βλέπεις τα δεδομένα του αθλούμενου όσο μιλάτε).

const CallContext = createContext({ call: null, start: () => {} });
export const useCalls = () => useContext(CallContext);

// Ήχος κλήσης χωρίς αρχεία: δύο τόνοι (εισερχόμενη) ή ο τόνος αναμονής (εξερχόμενη).
function useTone() {
  const ctx = useRef(null);
  const timer = useRef(null);
  const stop = useCallback(() => {
    clearInterval(timer.current);
    timer.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
  }, []);
  const play = useCallback((kind) => {
    stop();
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      ctx.current = ac;
      const beep = (freq, at, len, vol) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = freq;
        o.type = 'sine';
        g.gain.setValueAtTime(0, ac.currentTime + at);
        g.gain.linearRampToValueAtTime(vol, ac.currentTime + at + 0.02);
        g.gain.setValueAtTime(vol, ac.currentTime + at + len - 0.04);
        g.gain.linearRampToValueAtTime(0, ac.currentTime + at + len);
        o.connect(g).connect(ac.destination);
        o.start(ac.currentTime + at);
        o.stop(ac.currentTime + at + len + 0.05);
      };
      const ring = kind === 'incoming'
        ? () => { beep(880, 0, 0.18, 0.12); beep(660, 0.22, 0.18, 0.12); beep(880, 0.6, 0.18, 0.12); beep(660, 0.82, 0.18, 0.12); }
        : () => { beep(440, 0, 1.0, 0.05); };
      ring();
      timer.current = setInterval(ring, kind === 'incoming' ? 2600 : 3200);
    } catch {}
  }, [stop]);
  useEffect(() => stop, [stop]);
  return useMemo(() => ({ play, stop }), [play, stop]);
}

function notifySystem(title, body) {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, icon: '/icon.svg', tag: 'call', requireInteraction: true });
  n.onclick = () => { window.focus(); n.close(); };
}

const MEDIA_ERROR = 'Δεν επιτράπηκε η πρόσβαση στο μικρόφωνο ή στην κάμερα. Επίτρεψέ την από το εικονίδιο δίπλα στη διεύθυνση του site.';
const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// iPhone: ο αισθητήρας κλίσης θέλει άδεια, και ζητιέται μόνο μέσα σε πάτημα κουμπιού (κλήση/απάντηση).
const askMotion = () => { try { if (typeof DeviceMotionEvent?.requestPermission === 'function') DeviceMotionEvent.requestPermission().catch(() => {}); } catch {} };

export function CallProvider({ user, children }) {
  const live = useLive();
  const [call, setCall] = useState(null); // { id, athleteId, video, role, phase, peer, note }
  const callRef = useRef(null);
  callRef.current = call;
  const tone = useTone();

  // Ό,τι χρειάζεται η σύνδεση (δεν προκαλεί νέα σχεδίαση).
  const rtc = useRef({});
  const [streams, setStreams] = useState({ local: null, remote: null });
  const [media, setMedia] = useState({ mic: true, cam: false, screen: false, remoteCam: false, remoteScreen: false, remoteRot: 0, canFlip: false });
  const [since, setSince] = useState(null); // πότε συνδέθηκε (για το χρονόμετρο)
  const [mini, setMini] = useState(false);
  const [myRot, setMyRot] = useState(0); // πώς κρατώ εγώ το κινητό (κλειδωμένη οθόνη)
  const mediaRef = useRef(media);
  mediaRef.current = media;

  // Ποιος είναι ο άλλος (όνομα + φωτογραφία), από ό,τι ήδη ξέρει η εφαρμογή.
  const peerOf = useCallback((athleteId) => {
    if (user?.type === 'coach') {
      const a = live.athletes?.find((x) => x.id === athleteId);
      return { name: a?.name || 'Αθλούμενος', avatar: a?.avatar || null };
    }
    return { name: live.coach?.name || 'Προπονητής', avatar: null };
  }, [user?.type, live.athletes, live.coach]);

  /* ---------- Καθάρισμα ---------- */
  const cleanup = useCallback(() => {
    const r = rtc.current;
    clearTimeout(r.ringTimer);
    clearTimeout(r.dropTimer);
    clearInterval(r.readyTimer);
    r.sig?.close();
    try { r.pc?.close(); } catch {}
    [r.local, r.screen].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    rtc.current = {};
    tone.stop();
    setStreams({ local: null, remote: null });
    setMedia({ mic: true, cam: false, screen: false, remoteCam: false, remoteScreen: false, remoteRot: 0, canFlip: false });
    setSince(null);
    setMini(false);
  }, [tone]);

  // Τέλος κλήσης: δείχνει για λίγο τι έγινε («Η κλήση τελείωσε», «Δεν απάντησε»…) και κλείνει.
  const finish = useCallback((note) => {
    cleanup();
    setCall((c) => (c ? { ...c, phase: 'ended', note } : c));
    setTimeout(() => setCall((c) => (c?.phase === 'ended' ? null : c)), note ? 2200 : 0);
  }, [cleanup]);

  /* ---------- Σύνδεση WebRTC ---------- */
  const send = (payload) => rtc.current.sig?.send(payload).catch(() => {});

  const getMedia = async (video) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
    return stream;
  };

  const connect = useCallback(async (id, local, role) => {
    const r = rtc.current;
    r.local = local;
    r.facing = 'user';
    r.pending = [];
    r.restarted = false;
    const pc = new RTCPeerConnection({ iceServers: await iceServers() });
    r.pc = pc;
    const remote = new MediaStream();
    setStreams({ local, remote });

    local.getAudioTracks().forEach((t) => pc.addTrack(t, local));
    // Πάντα ένα «κανάλι» βίντεο: έτσι η κάμερα ή η κοινή χρήση οθόνης ανοίγει αργότερα χωρίς νέα διαπραγμάτευση.
    // Το ανοίγει ο καλών· ο καλούμενος χρησιμοποιεί το ίδιο κανάλι μόλις φτάσει η προσφορά (useVideoLine).
    if (role === 'caller') {
      const cam = local.getVideoTracks()[0];
      r.videoSender = pc.addTransceiver(cam || 'video', { direction: 'sendrecv', streams: [local] }).sender;
    }

    pc.ontrack = (e) => {
      if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
      setStreams((s) => ({ ...s, remote }));
    };
    pc.onicecandidate = (e) => { if (e.candidate) send({ t: 'ice', c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        clearTimeout(r.dropTimer);
        setCall((c) => (c && c.phase !== 'active' ? { ...c, phase: 'active' } : c));
        setSince((s) => s || Date.now());
        const m = mediaRef.current;
        send({ t: 'cam', on: m.screen || m.cam, screen: m.screen }); // τι να δείξει ο άλλος
        if (r.rot) send({ t: 'rot', deg: r.rot });
      }
      if (st === 'disconnected') {
        clearTimeout(r.dropTimer);
        setCall((c) => (c ? { ...c, phase: 'reconnecting' } : c));
        r.dropTimer = setTimeout(() => { if (pc.connectionState !== 'connected') restart(); }, 4000);
      }
      if (st === 'failed') restart();
    };

    // Αν «κοπεί» το δίκτυο: μία προσπάθεια επανασύνδεσης, μετά τέλος.
    const restart = async () => {
      if (r.restarted) { hangup('Η σύνδεση χάθηκε'); return; }
      r.restarted = true;
      if (role === 'caller') {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        send({ t: 'offer', sdp: pc.localDescription.toJSON() });
      } else {
        send({ t: 'restart' });
      }
      r.dropTimer = setTimeout(() => { if (pc.connectionState !== 'connected') hangup('Η σύνδεση χάθηκε'); }, 12000);
    };
    r.restart = restart;
    navigator.mediaDevices.enumerateDevices?.().then((d) => {
      setMedia((m) => ({ ...m, canFlip: isMobile() && d.filter((x) => x.kind === 'videoinput').length > 1 }));
    }).catch(() => {});
    return pc;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const makeOffer = async () => {
    const pc = rtc.current.pc;
    if (!pc || rtc.current.offered) return;
    rtc.current.offered = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ t: 'offer', sdp: pc.localDescription.toJSON() });
  };

  // Καλούμενος: το κανάλι βίντεο της προσφοράς γίνεται και δικό του (κάμερα τώρα ή αργότερα).
  const useVideoLine = async () => {
    const r = rtc.current;
    if (r.videoSender) return;
    const tr = r.pc.getTransceivers().find((t) => t.receiver.track.kind === 'video');
    if (!tr) return;
    tr.direction = 'sendrecv';
    r.videoSender = tr.sender;
    const cam = r.local.getVideoTracks()[0];
    if (cam) await tr.sender.replaceTrack(cam);
  };

  const flushIce = async () => {
    const r = rtc.current;
    for (const c of r.pending.splice(0)) await r.pc.addIceCandidate(c).catch(() => {});
  };

  // Μηνύματα από την άλλη συσκευή.
  const onSignal = useCallback(async (msg) => {
    const r = rtc.current;
    const pc = r.pc;
    try {
      if (msg.t === 'ready' && callRef.current?.role === 'caller') {
        clearTimeout(r.ringTimer);
        tone.stop();
        setCall((c) => (c ? { ...c, phase: 'connecting' } : c));
        await makeOffer();
      } else if (msg.t === 'offer' && pc) {
        clearInterval(r.readyTimer);
        await pc.setRemoteDescription(msg.sdp);
        await useVideoLine();
        await flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ t: 'answer', sdp: pc.localDescription.toJSON() });
      } else if (msg.t === 'answer' && pc) {
        await pc.setRemoteDescription(msg.sdp);
        await flushIce();
      } else if (msg.t === 'ice' && pc) {
        if (pc.remoteDescription) await pc.addIceCandidate(msg.c).catch(() => {});
        else r.pending.push(msg.c);
      } else if (msg.t === 'restart' && callRef.current?.role === 'caller' && pc) {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        send({ t: 'offer', sdp: pc.localDescription.toJSON() });
      } else if (msg.t === 'cam') {
        setMedia((m) => ({ ...m, remoteCam: !!msg.on, remoteScreen: !!msg.screen }));
      } else if (msg.t === 'rot') {
        setMedia((m) => ({ ...m, remoteRot: [0, 90, 180, 270].includes(msg.deg) ? msg.deg : 0 }));
      } else if (msg.t === 'bye') {
        finish('Η κλήση τελείωσε');
      }
    } catch {}
  }, [finish, tone]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Ενέργειες ---------- */

  // Εξερχόμενη κλήση.
  const start = useCallback(async (athleteId, video) => {
    if (callRef.current) return;
    askMotion();
    const peer = peerOf(athleteId);
    setCall({ id: null, athleteId, video, role: 'caller', phase: 'outgoing', peer });
    let local;
    try {
      local = await getMedia(video);
    } catch {
      setCall({ athleteId, video, role: 'caller', phase: 'ended', peer, note: MEDIA_ERROR });
      setTimeout(() => setCall((c) => (c?.phase === 'ended' ? null : c)), 6000);
      return;
    }
    // Το έκλεισε όσο ζητούσε άδεια για μικρόφωνο/κάμερα.
    if (callRef.current?.phase !== 'outgoing') { local.getTracks().forEach((t) => t.stop()); return; }
    try {
      const row = await startCall(athleteId, video);
      if (callRef.current?.phase !== 'outgoing') { setCallStatus(row.id, 'cancelled').catch(() => {}); local.getTracks().forEach((t) => t.stop()); return; }
      setCall((c) => (c ? { ...c, id: row.id } : c));
      rtc.current.sig = signalChannel(row.id, onSignal);
      await connect(row.id, local, 'caller');
      setMedia((m) => ({ ...m, cam: !!video }));
      tone.play('outgoing');
      rtc.current.ringTimer = setTimeout(() => {
        setCallStatus(row.id, 'missed').catch(() => {});
        finish('Δεν απάντησε');
      }, RING_MS);
    } catch {
      local.getTracks().forEach((t) => t.stop());
      cleanup();
      setCall((c) => (c ? { ...c, phase: 'ended', note: 'Η κλήση δεν έγινε. Έλεγξε τη σύνδεσή σου.' } : c));
      setTimeout(() => setCall((c) => (c?.phase === 'ended' ? null : c)), 3000);
    }
  }, [peerOf, connect, onSignal, tone, finish, cleanup]);

  // Απάντηση σε εισερχόμενη.
  const accept = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.phase !== 'incoming') return;
    askMotion();
    tone.stop();
    setCall({ ...c, phase: 'connecting' });
    let local;
    try {
      local = await getMedia(c.video);
    } catch {
      setCallStatus(c.id, 'declined').catch(() => {});
      finish(MEDIA_ERROR);
      return;
    }
    try {
      rtc.current.acceptedHere = true;
      await setCallStatus(c.id, 'accepted');
      rtc.current.sig = signalChannel(c.id, onSignal);
      await connect(c.id, local, 'callee');
      setMedia((m) => ({ ...m, cam: !!c.video }));
      // «Έτοιμος»: ξαναστέλνεται μέχρι να έρθει η προσφορά (αν χαθεί το πρώτο).
      await rtc.current.sig.ready;
      let n = 0;
      send({ t: 'ready' });
      rtc.current.readyTimer = setInterval(() => {
        if (++n > 6) { clearInterval(rtc.current.readyTimer); return; }
        send({ t: 'ready' });
      }, 2000);
    } catch {
      local.getTracks().forEach((t) => t.stop());
      finish('Η κλήση δεν συνδέθηκε');
    }
  }, [tone, connect, onSignal, finish]);

  const decline = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    setCallStatus(c.id, 'declined').catch(() => {});
    tone.stop();
    setCall(null);
  }, [tone]);

  // Κλείσιμο από εμένα (ακύρωση πριν απαντήσει, ή τέλος).
  const hangup = useCallback((note) => {
    const c = callRef.current;
    if (!c) return;
    if (c.id) {
      if (c.phase === 'outgoing') setCallStatus(c.id, 'cancelled').catch(() => {});
      else { send({ t: 'bye' }); setCallStatus(c.id, 'ended').catch(() => {}); }
    }
    finish(typeof note === 'string' ? note : null);
  }, [finish]);

  const toggleMic = () => {
    const t = rtc.current.local?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMedia((m) => ({ ...m, mic: t.enabled }));
  };

  // Κάμερα: σε φωνητική κλήση ανοίγει για πρώτη φορά· μετά απλώς σβήνει/ανάβει.
  const toggleCam = async () => {
    const r = rtc.current;
    if (!r.pc) return;
    let t = r.local.getVideoTracks()[0];
    if (!t) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: r.facing } });
        t = s.getVideoTracks()[0];
        r.local.addTrack(t);
        setStreams((x) => ({ ...x, local: r.local }));
      } catch { return; }
      if (!media.screen) await r.videoSender.replaceTrack(t);
      setMedia((m) => ({ ...m, cam: true }));
      if (!media.screen) send({ t: 'cam', on: true });
      return;
    }
    t.enabled = !t.enabled;
    setMedia((m) => ({ ...m, cam: t.enabled }));
    if (!media.screen) send({ t: 'cam', on: t.enabled });
  };

  const stopScreen = async () => {
    const r = rtc.current;
    r.screen?.getTracks().forEach((t) => t.stop());
    r.screen = null;
    const cam = r.local?.getVideoTracks()[0] || null;
    await r.videoSender?.replaceTrack(cam && cam.enabled ? cam : null).catch(() => {});
    setMedia((m) => ({ ...m, screen: false }));
    send({ t: 'cam', on: !!(cam && cam.enabled), screen: false });
  };
  const toggleScreen = async () => {
    const r = rtc.current;
    if (!r.pc) return;
    if (r.screen) { await stopScreen(); return; }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const t = s.getVideoTracks()[0];
      t.contentHint = 'detail';
      t.onended = () => stopScreen();
      r.screen = s;
      await r.videoSender.replaceTrack(t);
      setMedia((m) => ({ ...m, screen: true }));
      send({ t: 'cam', on: true, screen: true });
    } catch {}
  };

  // Κινητό: μπροστινή ↔ πίσω κάμερα.
  const flip = async () => {
    const r = rtc.current;
    const old = r.local?.getVideoTracks()[0];
    if (!old) return;
    const facing = r.facing === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
      const t = s.getVideoTracks()[0];
      t.enabled = old.enabled;
      r.local.removeTrack(old);
      old.stop();
      r.local.addTrack(t);
      r.facing = facing;
      if (!r.screen) await r.videoSender.replaceTrack(t);
      setStreams((x) => ({ ...x, local: new MediaStream(r.local.getTracks()) }));
    } catch {}
  };

  /* ---------- Ζωντανά: εισερχόμενες κλήσεις και αλλαγές κατάστασης ---------- */
  const handle = useRef();
  handle.current = (type, row) => {
    const c = callRef.current;
    if (type === 'INSERT' && row.status === 'ringing' && row.callee === user.id) {
      if (c && c.id !== row.id) { setCallStatus(row.id, 'busy').catch(() => {}); return; }
      const age = Date.now() - new Date(row.createdAt).getTime();
      if (age > RING_MS) return;
      const peer = peerOf(row.athleteId);
      setCall({ id: row.id, athleteId: row.athleteId, video: row.video, role: 'callee', phase: 'incoming', peer });
      tone.play('incoming');
      notifySystem(row.video ? 'Εισερχόμενη βιντεοκλήση' : 'Εισερχόμενη κλήση', `από ${peer.name}`);
      clearTimeout(rtc.current.ringTimer);
      rtc.current.ringTimer = setTimeout(() => {
        if (callRef.current?.id === row.id && callRef.current.phase === 'incoming') { tone.stop(); setCall(null); }
      }, RING_MS - age + 3000);
      return;
    }
    if (type !== 'UPDATE' || !c || c.id !== row.id) return;
    if (row.status === 'accepted' && c.role === 'callee' && !rtc.current.acceptedHere) {
      // Απάντησε από άλλη συσκευή του.
      tone.stop();
      setCall(null);
    } else if (row.status === 'declined') finish('Απέρριψε την κλήση');
    else if (row.status === 'busy') finish('Είναι σε άλλη κλήση');
    else if (row.status === 'cancelled' || row.status === 'missed') {
      if (c.phase === 'incoming') { tone.stop(); setCall(null); } else finish(null);
    } else if (row.status === 'ended' && c.phase !== 'ended') finish('Η κλήση τελείωσε');
  };
  useEffect(() => {
    if (!user?.id) return;
    // Αν με καλούν τη στιγμή που ανοίγω την εφαρμογή.
    ringingForMe(user.id).then((row) => { if (row) handle.current('INSERT', row); }).catch(() => {});
    return onCalls(user.id, (type, row) => handle.current(type, row));
  }, [user?.id]);

  // Κλείσιμο καρτέλας στη μέση της κλήσης: ενημερώνεται ο άλλος.
  useEffect(() => {
    const bye = () => {
      const c = callRef.current;
      if (c?.id && c.phase !== 'ended' && c.phase !== 'incoming') send({ t: 'bye' });
    };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, []);

  // Κινητό με κλειδωμένη περιστροφή οθόνης: αν το γυρίσεις οριζόντια, η κάμερα στέλνει «ξαπλωμένη» εικόνα.
  // Ο αισθητήρας κλίσης λέει πώς κρατάς το κινητό, και ο άλλος γυρίζει την εικόνα σωστά.
  const inCall = !!call && ['connecting', 'active', 'reconnecting'].includes(call.phase);
  useEffect(() => {
    if (!inCall || !isMobile() || typeof DeviceMotionEvent === 'undefined') return;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    let dev = 0;
    const report = () => {
      const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
      const deg = ((dev - screenAngle) % 360 + 360) % 360;
      if (deg === rtc.current.rot) return;
      rtc.current.rot = deg;
      setMyRot(deg);
      send({ t: 'rot', deg });
    };
    const onMotion = (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      const x = ios ? -g.x : g.x;
      const y = ios ? -g.y : g.y;
      // Με περιθώριο, ώστε να μην «τρεμοπαίζει» σε ενδιάμεσες κλίσεις.
      let next = dev;
      if (Math.abs(x) > 6.5 && Math.abs(x) > Math.abs(y) * 1.4) next = x < 0 ? 270 : 90; // (επιβεβαιωμένο σε αληθινό Android)
      else if (Math.abs(y) > 6.5 && Math.abs(y) > Math.abs(x) * 1.4) next = y < 0 ? 180 : 0;
      if (next !== dev) { dev = next; report(); }
    };
    window.addEventListener('devicemotion', onMotion);
    screen.orientation?.addEventListener?.('change', report);
    // Ξανά κάθε 3 δευτερόλεπτα (αν χαθεί ένα μήνυμα ή ο άλλος μόλις συνδέθηκε).
    const again = setInterval(() => { if (rtc.current.rot !== undefined) send({ t: 'rot', deg: rtc.current.rot }); }, 3000);
    return () => { clearInterval(again); window.removeEventListener('devicemotion', onMotion); screen.orientation?.removeEventListener?.('change', report); };
  }, [inCall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!inCall) setMyRot(0); }, [inCall]);

  // Κινητό: η οθόνη δεν σβήνει μόνη της όσο κρατά η κλήση.
  useEffect(() => {
    if (!inCall || !navigator.wakeLock) return;
    let lock = null;
    let alive = true;
    const take = () => navigator.wakeLock.request('screen').then((l) => { if (alive) lock = l; else l.release(); }).catch(() => {});
    take();
    const back = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', back);
    return () => { alive = false; document.removeEventListener('visibilitychange', back); lock?.release().catch(() => {}); };
  }, [inCall]);

  const value = { call, start };
  return (
    <CallContext.Provider value={value}>
      {children}
      {call && (
        <CallScreen
          call={call} streams={streams} media={media} myRot={myRot} since={since} mini={mini} setMini={setMini}
          onAccept={accept} onDecline={decline} onHangup={hangup}
          onMic={toggleMic} onCam={toggleCam} onScreen={toggleScreen} onFlip={flip}
        />
      )}
    </CallContext.Provider>
  );
}

/* ---------- Κουμπιά στην κεφαλίδα της συνομιλίας ---------- */
export function CallButtons({ athleteId }) {
  const { call, start } = useCalls();
  if (!athleteId || typeof window === 'undefined' || !navigator.mediaDevices) return null;
  return (
    <span className="call-buttons">
      <button type="button" className="icon-btn" onClick={() => start(athleteId, true)} disabled={!!call} aria-label="Βιντεοκλήση" title="Βιντεοκλήση">
        <VideoIcon />
      </button>
      <button type="button" className="icon-btn" onClick={() => start(athleteId, false)} disabled={!!call} aria-label="Κλήση" title="Κλήση">
        <PhoneIcon />
      </button>
    </span>
  );
}

/* ---------- Η οθόνη της κλήσης ---------- */

// onShape(πλάτος, ύψος): το σχήμα της εικόνας (κάθετη από κινητό, οριζόντια από υπολογιστή).
function Video({ stream, muted, className, style, onShape }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  // Το σχήμα αλλάζει όταν φτάσει η εικόνα (συχνά μετά τον ήχο), όταν γυρίσει το κινητό ή αλλάξει κάμερα:
  // ακούμε τα γεγονότα του browser και, για σιγουριά, ελέγχουμε και κάθε μισό δευτερόλεπτο.
  const shapeRef = useRef(onShape);
  shapeRef.current = onShape;
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let last = '';
    const check = () => {
      if (!v.videoWidth || !v.videoHeight) return;
      const now = `${v.videoWidth}x${v.videoHeight}`;
      if (now === last) return;
      last = now;
      shapeRef.current?.(v.videoWidth, v.videoHeight);
    };
    v.addEventListener('loadedmetadata', check);
    v.addEventListener('resize', check);
    const t = setInterval(check, 500);
    return () => { v.removeEventListener('loadedmetadata', check); v.removeEventListener('resize', check); clearInterval(t); };
  }, []);
  return <video ref={ref} className={className} style={style} autoPlay playsInline muted={muted} />;
}

// Το μέγεθος ενός στοιχείου (ζωντανά, όταν αλλάζει το παράθυρο ή η σμίκρυνση).
function useSize() {
  const [el, setEl] = useState(null);
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

function Audio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function Avatar({ peer, size = 'big' }) {
  return (
    <span className={`call-avatar ${size}`}>
      {peer.avatar ? <Photo id={peer.avatar} alt="" /> : <span>{peer.name.charAt(0).toUpperCase()}</span>}
    </span>
  );
}

function Timer({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{fmtSecs(Math.max(0, Math.floor((now - since) / 1000)))}</>;
}

function CallScreen({ call, streams, media, myRot = 0, since, mini, setMini, onAccept, onDecline, onHangup, onMic, onCam, onScreen, onFlip }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [stageRef, stage] = useSize();
  const [remoteShape, setRemoteShape] = useState(null);
  const [localShape, setLocalShape] = useState(null);
  if (!mounted) return null;

  const kind = call.video ? 'βιντεοκλήση' : 'κλήση';
  const status = {
    incoming: `Εισερχόμενη ${kind}…`,
    outgoing: 'Κουδουνίζει…',
    connecting: 'Σύνδεση…',
    reconnecting: 'Επανασύνδεση…',
    active: since ? <Timer since={since} /> : 'Σύνδεση…',
    ended: call.note || 'Η κλήση τελείωσε',
  }[call.phase];

  // Εισερχόμενη: μικρό παράθυρο πάνω στη σελίδα.
  if (call.phase === 'incoming') {
    return createPortal(
      <div className="call-incoming" role="alertdialog" aria-label={`Εισερχόμενη ${kind} από ${call.peer.name}`}>
        <Avatar peer={call.peer} size="mid" />
        <div className="call-incoming-text"><b>{call.peer.name}</b><span>{status}</span></div>
        <button type="button" className="call-btn danger" onClick={onDecline} aria-label="Απόρριψη" title="Απόρριψη"><PhoneOffIcon /></button>
        <button type="button" className="call-btn accept" onClick={onAccept} aria-label="Απάντηση" title="Απάντηση">
          {call.video ? <VideoIcon /> : <PhoneIcon />}
        </button>
      </div>,
      document.body
    );
  }

  const showRemote = media.remoteCam && streams.remote && call.phase !== 'ended';
  const showLocal = (media.cam || media.screen) && streams.local && call.phase !== 'ended';
  const live = call.phase !== 'ended' && call.phase !== 'outgoing';
  // Αν το σχήμα της εικόνας ταιριάζει με την οθόνη, τη γεμίζει· αλλιώς φαίνεται ολόκληρη
  // (π.χ. κάθετο βίντεο από κινητό σε οριζόντια οθόνη υπολογιστή), με θολό φόντο στα πλάγια — χωρίς «ζουμ».
  // Ο άλλος κρατά το κινητό οριζόντια με κλειδωμένη οθόνη: γυρίζουμε την εικόνα του (και το σχήμα της).
  // (και αν εγώ κρατώ το κινητό μου οριζόντια, με κλειδωμένη οθόνη, τη γυρίζουμε ανάλογα)
  const rot = (((media.remoteRot || 0) - myRot) % 360 + 360) % 360;
  const sideways = rot % 180 !== 0;
  const shape = remoteShape && (sideways ? { w: remoteShape.h, h: remoteShape.w } : remoteShape);
  const turn = (pad = 0) => (!rot || !stage ? undefined : sideways
    ? { left: '50%', top: '50%', width: stage.h + pad, height: stage.w + pad, transform: `translate(-50%, -50%) rotate(${rot}deg)` }
    : { transform: `rotate(${rot}deg)` });
  const ratio = shape && stage?.h ? (shape.w / shape.h) / (stage.w / stage.h) : 1;
  const whole = media.remoteScreen || ratio < 0.8 || ratio > 1.25;
  const localPortrait = localShape && localShape.h > localShape.w;

  return createPortal(
    <div className={`call${mini ? ' mini' : ''}${showRemote ? ' has-video' : ''}`} role="dialog" aria-label={`${call.video ? 'Βιντεοκλήση' : 'Κλήση'} με ${call.peer.name}`}>
      <Audio stream={streams.remote} />
      <div className="call-stage" ref={stageRef} onClick={mini ? () => setMini(false) : undefined}>
        {showRemote && whole && !media.remoteScreen && <Video stream={streams.remote} muted className="call-remote-bg" style={turn(80)} />}
        <Video
          stream={streams.remote} muted onShape={(w, h) => setRemoteShape({ w, h })} style={turn()}
          className={`call-remote${showRemote ? '' : ' hidden'}${whole ? ' whole' : ''}${media.remoteScreen ? ' screen' : ''}`}
        />
        {!showRemote && (
          <div className="call-who">
            <Avatar peer={call.peer} />
            <b>{call.peer.name}</b>
            <span className={call.phase === 'ended' && call.note ? 'call-note' : ''}>{status}</span>
          </div>
        )}
        {showRemote && (
          <div className="call-top"><b>{call.peer.name}</b><span>{status}</span></div>
        )}
        {showLocal && (
          <Video
            stream={media.screen ? null : streams.local} muted onShape={(w, h) => setLocalShape({ w, h })}
            className={`call-local${media.screen ? ' hidden' : ''}${localPortrait ? ' portrait' : ''}`}
            style={localShape ? { aspectRatio: `${localShape.w} / ${localShape.h}` } : undefined}
          />
        )}
        {media.screen && <span className="call-sharing"><ScreenIcon size={16} /> Κοινή χρήση οθόνης</span>}
      </div>

      {call.phase !== 'ended' && (
        <div className="call-bar">
          {live && (
            <>
              <button type="button" className={`call-btn${media.mic ? '' : ' off'}`} onClick={onMic} aria-label={media.mic ? 'Σίγαση' : 'Κατάργηση σίγασης'} title={media.mic ? 'Σίγαση' : 'Κατάργηση σίγασης'}>
                {media.mic ? <MicIcon /> : <MicOffIcon />}
              </button>
              <button type="button" className={`call-btn${media.cam ? '' : ' off'}`} onClick={onCam} aria-label={media.cam ? 'Κλείσιμο κάμερας' : 'Άνοιγμα κάμερας'} title={media.cam ? 'Κλείσιμο κάμερας' : 'Άνοιγμα κάμερας'}>
                {media.cam ? <VideoIcon /> : <VideoOffIcon />}
              </button>
              {!mini && navigator.mediaDevices?.getDisplayMedia && !isMobile() && (
                <button type="button" className={`call-btn${media.screen ? ' on' : ''}`} onClick={onScreen} aria-label="Κοινή χρήση οθόνης" title={media.screen ? 'Διακοπή κοινής χρήσης' : 'Κοινή χρήση οθόνης'}>
                  <ScreenIcon />
                </button>
              )}
              {!mini && media.canFlip && media.cam && (
                <button type="button" className="call-btn" onClick={onFlip} aria-label="Αλλαγή κάμερας" title="Αλλαγή κάμερας"><FlipIcon /></button>
              )}
            </>
          )}
          <button type="button" className="call-btn danger" onClick={onHangup} aria-label="Τερματισμός" title="Τερματισμός"><PhoneOffIcon /></button>
          {!isMobile() && (
            <button type="button" className="call-btn ghost" onClick={() => setMini(!mini)} aria-label={mini ? 'Μεγέθυνση' : 'Σμίκρυνση'} title={mini ? 'Μεγέθυνση' : 'Σμίκρυνση (συνέχισε να δουλεύεις στην εφαρμογή)'}>
              <MinimizeIcon />
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
