'use client';

import { supabase } from './supabase';

// Κλήσεις και βιντεοκλήσεις (WebRTC, από συσκευή σε συσκευή).
// Η βάση (πίνακας calls) κρατά μόνο ποιος καλεί ποιον και την κατάσταση· η σύνδεση των δύο συσκευών
// (προσφορά/απάντηση/διαδρομές δικτύου) περνά από ένα ιδιωτικό κανάλι Realtime με το τυχαίο id της κλήσης.

const toCall = (r) => r && ({
  id: r.id, athleteId: r.athlete_id, caller: r.caller, callee: r.callee, video: r.video,
  status: r.status, createdAt: r.created_at, answeredAt: r.answered_at, endedAt: r.ended_at,
});

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return toCall(data);
};

export const startCall = (athleteId, video) => rpc('start_call', { p_athlete: athleteId, p_video: !!video });
export const setCallStatus = (id, status) => rpc('set_call_status', { p_call: id, p_status: status });

// Ζωντανά: νέα κλήση προς εμένα (INSERT) και κάθε αλλαγή κατάστασης των κλήσεών μου (UPDATE).
export function onCalls(userId, cb) {
  const ch = supabase.channel(`calls:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee=eq.${userId}` },
      ({ new: r }) => cb('INSERT', toCall(r)))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `callee=eq.${userId}` },
      ({ new: r }) => cb('UPDATE', toCall(r)))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `caller=eq.${userId}` },
      ({ new: r }) => cb('UPDATE', toCall(r)))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// Κλήση που ακόμα κουδουνίζει προς εμένα (π.χ. άνοιξα την εφαρμογή την ώρα που με καλούν).
export async function ringingForMe(userId) {
  const { data } = await supabase.from('calls').select('*')
    .eq('callee', userId).eq('status', 'ringing')
    .gt('created_at', new Date(Date.now() - RING_MS).toISOString())
    .order('created_at', { ascending: false }).limit(1);
  return toCall(data?.[0]) || null;
}

// Πόση ώρα κουδουνίζει πριν γίνει «αναπάντητη».
export const RING_MS = 45000;

// Οι διακομιστές για τη σύνδεση (απευθείας ή, όπου μπλοκάρεται, μέσω αναμεταδότη).
const FALLBACK_ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
export async function iceServers() {
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch('/api/turn', { headers: { Authorization: `Bearer ${data.session?.access_token}` } });
    if (res.ok) return (await res.json()).iceServers || FALLBACK_ICE;
  } catch {}
  return FALLBACK_ICE;
}

// Το κανάλι σύνδεσης μιας κλήσης: send(τύπος, δεδομένα) και on(τύπος → δεδομένα).
export function signalChannel(callId, onSignal) {
  const ch = supabase.channel(`rtc:${callId}`, { config: { broadcast: { self: false, ack: true } } });
  ch.on('broadcast', { event: 'sig' }, ({ payload }) => onSignal(payload));
  const ready = new Promise((resolve) => ch.subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); }));
  return {
    ready,
    send: async (payload) => { await ready; return ch.send({ type: 'broadcast', event: 'sig', payload }); },
    close: () => supabase.removeChannel(ch),
  };
}

// Κείμενο της γραμμής κλήσης στη συνομιλία και στις ειδοποιήσεις.
export const fmtSecs = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(x)}` : `${m}:${two(x)}`;
};
export function callText(call, mine) {
  const kind = call.video ? 'Βιντεοκλήση' : 'Κλήση';
  if (call.status === 'ended') return `${kind} · ${fmtSecs(call.secs || 0)}`;
  if (mine) return `${kind} χωρίς απάντηση`;
  return call.video ? 'Αναπάντητη βιντεοκλήση' : 'Αναπάντητη κλήση';
}
