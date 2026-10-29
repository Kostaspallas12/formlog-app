// Αποθήκευση στο Supabase: βάση (αθλούμενοι, καταγραφές) και Storage (φωτογραφίες).
// Οι κανόνες ασφαλείας (RLS) στη βάση εξασφαλίζουν ότι κάθε χρήστης βλέπει μόνο τα δικά του.
// Η δομή της βάσης είναι στο supabase/schema.sql.

import { currentUserId, supabase } from './supabase';
import { makeThumb } from './images';

const BUCKET = 'photos';
const VOICE_BUCKET = 'voice';

// Ρίχνει το σφάλμα του Supabase ώστε να το πιάσει όποιος καλεί.
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

/* ---------- Λογαριασμός ---------- */

export const getProfile = async (id) =>
  check(await supabase.from('profiles').select('*').eq('id', id).maybeSingle());

export const updateProfileName = async (id, name) =>
  check(await supabase.from('profiles').update({ name }).eq('id', id));

// Ρυθμίσεις ειδοποιήσεων, π.χ. { notify_checkins: false }
export const updateProfileSettings = async (id, patch) =>
  check(await supabase.from('profiles').update(patch).eq('id', id));

/* ---------- Συνομιλία προπονητή ↔ αθλούμενου ---------- */

const toMessage = (r) => ({
  id: r.id, athleteId: r.athlete_id, sender: r.sender, body: r.body, photo: r.photo ?? null, audio: r.audio ?? null, audioSecs: r.audio_secs ?? null,
  createdAt: r.created_at, readAt: r.read_at, call: r.call ?? null,
});

// Τα τελευταία 300 μηνύματα μιας συνομιλίας, από το παλιότερο στο νεότερο.
export const listMessages = async (athleteId) =>
  check(await supabase.from('messages').select('*').eq('athlete_id', athleteId)
    .order('created_at', { ascending: false }).limit(300)).reverse().map(toMessage);

// photo: διαδρομή φωτογραφίας από addPhoto (προαιρετική· τότε το κείμενο είναι λεζάντα).
export async function sendMessage(athleteId, body, attach = {}) {
  const row = { athlete_id: athleteId, body: (body || '').trim() };
  if (attach.photo) row.photo = attach.photo;
  if (attach.audio) { row.audio = attach.audio; row.audio_secs = attach.audioSecs ?? null; }
  return toMessage(check(await supabase.from('messages').insert(row).select().single()));
}

// Ό,τι έστειλε ο άλλος σε αυτή τη συνομιλία σημειώνεται «διαβάστηκε».
export const markMessagesRead = async (athleteId, meId) =>
  check(await supabase.from('messages').update({ read_at: new Date().toISOString() })
    .eq('athlete_id', athleteId).is('read_at', null).neq('sender', meId));

// Αδιάβαστα μηνύματα προς εμένα (σε όλες τις συνομιλίες μου).
export const listUnreadMessages = async (meId) =>
  check(await supabase.from('messages').select('*').is('read_at', null).neq('sender', meId)
    .order('created_at')).map(toMessage);

// Ζωντανά: νέα μηνύματα (INSERT) και «διαβάστηκε» (UPDATE). Χωρίς athleteId: όλες οι συνομιλίες μου.
export function onMessages(athleteId, cb) {
  const filter = athleteId ? { filter: `athlete_id=eq.${athleteId}` } : {};
  const ch = supabase.channel(`messages:${athleteId || 'all'}:${uuid()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', ...filter },
      ({ eventType, new: r }) => r?.id && cb(eventType, toMessage(r)))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/* ---------- Ειδοποιήσεις (για τον προπονητή) ---------- */

// Οι αδιάβαστες ειδοποιήσεις: [{ id, athleteId, createdAt }]
export const listUnreadNotifications = async () =>
  check(await supabase.from('notifications').select('id, athlete_id, created_at').is('read_at', null))
    .map((r) => ({ id: r.id, athleteId: r.athlete_id, createdAt: r.created_at }));

// Ο προπονητής άνοιξε τον αθλούμενο: ό,τι είχε έρθει από αυτόν θεωρείται διαβασμένο.
export const markAthleteRead = async (athleteId) =>
  check(await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('athlete_id', athleteId).is('read_at', null));

// Ζωντανά: κάθε νέα ειδοποίηση μόλις δημιουργηθεί. Επιστρέφει συνάρτηση για σταμάτημα.
export function onNotification(userId, cb) {
  const ch = supabase.channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      ({ new: r }) => cb({ id: r.id, athleteId: r.athlete_id, createdAt: r.created_at }))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/* ---------- Επιλογές του προπονητή ανά αθλούμενο (καρφίτσωμα, αγαπημένα, σίγαση, αρχείο, μη αναγνωσμένο) ---------- */

const PREF_KEYS = { pinned: 'pinned', favorite: 'favorite', muted: 'muted', archived: 'archived', markedUnread: 'marked_unread' };

// { athleteId → { pinned, favorite, muted, archived, markedUnread } }
export async function listAthletePrefs() {
  const rows = check(await supabase.from('athlete_prefs').select('*'));
  return Object.fromEntries(rows.map((r) => [r.athlete_id, {
    pinned: r.pinned, favorite: r.favorite, muted: r.muted, archived: r.archived, markedUnread: r.marked_unread,
  }]));
}

// patch π.χ. { pinned: true }
export async function setAthletePref(athleteId, patch) {
  const row = { athlete_id: athleteId };
  for (const [k, v] of Object.entries(patch)) row[PREF_KEYS[k]] = v;
  check(await supabase.from('athlete_prefs').upsert(row, { onConflict: 'user_id,athlete_id' }));
}

/* ---------- Προγράμματα προπόνησης και διατροφής ---------- */

// Κάθε αθλούμενος έχει ένα πρόγραμμα κάθε είδους ('training' | 'nutrition'), που το γράφει ο προπονητής του.
// content: η μορφή περιγράφεται στο components/PlanView.js · files: [{ path, name, size, type }]
const PLAN_BUCKET = 'plans';
const toPlan = (r) => ({
  athleteId: r.athlete_id, kind: r.kind, title: r.title ?? '', content: r.content ?? {}, files: r.files ?? [], updatedAt: r.updated_at,
});

// { training: πρόγραμμα | null, nutrition: πρόγραμμα | null }
export async function getAthletePlans(athleteId) {
  const rows = check(await supabase.from('athlete_plans').select('*').eq('athlete_id', athleteId));
  const out = { training: null, nutrition: null };
  for (const r of rows) out[r.kind] = toPlan(r);
  return out;
}

export const saveAthletePlan = async (athleteId, kind, { title = '', content = {}, files = [] }) =>
  toPlan(check(await supabase.from('athlete_plans')
    .upsert({ athlete_id: athleteId, kind, title: title.trim(), content, files }, { onConflict: 'athlete_id,kind' })
    .select().single()));

export async function deleteAthletePlan(athleteId, kind, files = []) {
  await removePlanFiles(files.map((f) => f.path)).catch(() => {});
  check(await supabase.from('athlete_plans').delete().eq('athlete_id', athleteId).eq('kind', kind));
}

// Τύποι αρχείων που δέχεται ο χώρος "plans" (ίδιοι με το supabase/016_plans.sql).
export const PLAN_FILE_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
export const PLAN_FILE_MAX = 10 * 1024 * 1024;

// Ανεβάζει ένα αρχείο από τον υπολογιστή στον φάκελο του αθλούμενου.
export async function uploadPlanFile(athleteId, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const type = PLAN_FILE_TYPES[ext];
  if (!type) throw new Error('type');
  if (file.size > PLAN_FILE_MAX) throw new Error('size');
  const path = `${athleteId}/${uuid()}.${ext}`;
  check(await supabase.storage.from(PLAN_BUCKET).upload(path, file, { contentType: type, upsert: false }));
  return { path, name: file.name.slice(0, 120), size: file.size, type };
}

export async function downloadPlanFile(path) {
  const { data, error } = await supabase.storage.from(PLAN_BUCKET).download(path);
  if (error) throw error;
  return data;
}

export async function removePlanFiles(paths) {
  if (paths.length) check(await supabase.storage.from(PLAN_BUCKET).remove(paths));
}

/* ---------- Ομάδες (ομαδικές συνομιλίες προπονητή με πολλούς αθλούμενους) ---------- */

const toGroup = (r) => ({
  id: r.id, name: r.name, coachId: r.coach_id, coachOnly: r.coach_only, members: r.members ?? 0,
  unread: r.unread ?? 0, lastBody: r.last_body ?? null, lastPhoto: !!r.last_photo, lastAt: r.last_at ?? null,
});

// Οι ομάδες μου (ως προπονητής ή μέλος), με αδιάβαστα και το τελευταίο μήνυμα.
export const listMyGroups = async () => check(await supabase.rpc('my_groups')).map(toGroup);

export const getGroup = async (id) => {
  const r = check(await supabase.from('groups').select('*').eq('id', id).maybeSingle());
  return r && toGroup(r);
};

// Νέα ομάδα με όνομα και μέλη (ids φακέλων συνδεδεμένων αθλούμενων).
export async function createGroup(name, athleteIds = [], coachOnly = false) {
  const g = check(await supabase.from('groups').insert({ name: name.trim(), coach_only: coachOnly }).select().single());
  for (const a of athleteIds) check(await supabase.rpc('add_group_member', { p_group: g.id, p_athlete: a }));
  return g.id;
}

export const updateGroup = async (id, { name, coachOnly }) => {
  const patch = {};
  if (name !== undefined) patch.name = name.trim();
  if (coachOnly !== undefined) patch.coach_only = coachOnly;
  return check(await supabase.from('groups').update(patch).eq('id', id));
};

export const addGroupMember = async (groupId, athleteId) =>
  check(await supabase.rpc('add_group_member', { p_group: groupId, p_athlete: athleteId }));

// Αφαίρεση μέλους από τον προπονητή — ή αποχώρηση του ίδιου (userId = ο εαυτός μου).
export const removeGroupMember = async (groupId, userId) =>
  check(await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId));

export async function deleteGroup(id) {
  await removeFolder(id).catch(() => {}); // οι φωτογραφίες της ομάδας
  check(await supabase.from('groups').delete().eq('id', id));
}

// Ο προπονητής και τα μέλη της ομάδας, με ονόματα.
export const groupPeople = async (id) =>
  check(await supabase.rpc('group_people', { p_group: id }))
    .map((r) => ({ userId: r.user_id, name: r.name, isCoach: r.is_coach, athleteId: r.athlete_id }));

const toGroupMessage = (r) => ({
  id: r.id, groupId: r.group_id, sender: r.sender, body: r.body, photo: r.photo ?? null, audio: r.audio ?? null, audioSecs: r.audio_secs ?? null, createdAt: r.created_at,
});

export const listGroupMessages = async (groupId) =>
  check(await supabase.from('group_messages').select('*').eq('group_id', groupId)
    .order('created_at', { ascending: false }).limit(300)).reverse().map(toGroupMessage);

export async function sendGroupMessage(groupId, body, attach = {}) {
  const row = { group_id: groupId, body: (body || '').trim() };
  if (attach.photo) row.photo = attach.photo;
  if (attach.audio) { row.audio = attach.audio; row.audio_secs = attach.audioSecs ?? null; }
  return toGroupMessage(check(await supabase.from('group_messages').insert(row).select().single()));
}

/* ---------- Φωνητικά μηνύματα ---------- */
export async function uploadVoice(chatId, blob, ext) {
  const path = chatId + '/' + uuid() + '.' + ext;
  check(await supabase.storage.from(VOICE_BUCKET).upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false }));
  return path;
}
export async function getVoice(path) {
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).download(path);
  if (error) throw error;
  return data;
}

export const markGroupRead = async (groupId) => check(await supabase.rpc('mark_group_read', { p_group: groupId }));

// Ζωντανά: νέα μηνύματα ομάδας. Χωρίς groupId: όλες οι ομάδες μου.
export function onGroupMessages(groupId, cb) {
  const filter = groupId ? { filter: `group_id=eq.${groupId}` } : {};
  const ch = supabase.channel(`group_messages:${groupId || 'all'}:${uuid()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', ...filter },
      ({ new: r }) => r?.id && cb('INSERT', toGroupMessage(r)))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// Γενική ζωντανή παρακολούθηση ενός πίνακα (με τους κανόνες ασφαλείας: λαμβάνεις μόνο ό,τι βλέπεις).
// filter: π.χ. 'coach_id=eq.<id>' · cb() καλείται σε κάθε αλλαγή.
export function onTableChanges(table, filter, cb) {
  const ch = supabase.channel(`${table}:${filter || 'all'}:${uuid()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/* ---------- Μηνύματα με αστέρι ---------- */

// Ποια μηνύματα έχω με αστέρι (μόνο τα id, για να φαίνεται το αστέρι μέσα στη συνομιλία).
export async function listStarIds() {
  const rows = check(await supabase.from('message_stars').select('message_id, group_message_id'));
  return new Set(rows.map((r) => r.message_id || r.group_message_id));
}

export async function setStar(messageId, isGroup, on) {
  const col = isGroup ? 'group_message_id' : 'message_id';
  if (on) {
    const { error } = await supabase.from('message_stars').insert({ [col]: messageId });
    if (error && error.code !== '23505') throw error; // ήδη με αστέρι: εντάξει
  } else {
    check(await supabase.from('message_stars').delete().eq(col, messageId));
  }
}

// Όλα τα μηνύματα με αστέρι, πιο πρόσφατο αστέρι πρώτα. (Όσα δεν βλέπω πια, π.χ. μετά από διακοπή, παραλείπονται.)
export async function listStarred() {
  const rows = check(await supabase.from('message_stars')
    .select('id, created_at, message:messages(*), group_message:group_messages(*)')
    .order('created_at', { ascending: false }));
  return rows
    .filter((r) => r.message || r.group_message)
    .map((r) => ({ id: r.id, starredAt: r.created_at, group: !!r.group_message, msg: r.message ? toMessage(r.message) : toGroupMessage(r.group_message) }));
}

/* ---------- Αλλαγές του προπονητή (ειδοποιήσεις ανά ενότητα για τον αθλούμενο) ---------- */

// { archive: 2, plan: 1, ... } — πόσες αλλαγές του προπονητή δεν έχει δει ακόμα σε κάθε ενότητα.
export async function listCoachUpdates() {
  const rows = check(await supabase.from('coach_updates').select('section, count'));
  return Object.fromEntries(rows.map((r) => [r.section, r.count]));
}

// Ο αθλούμενος άνοιξε την ενότητα: διαβάστηκε.
export async function clearCoachUpdate(section) {
  check(await supabase.from('coach_updates').delete().eq('section', section));
}

// Ζωντανά: νέα αλλαγή του προπονητή. cb({ section, count })
export function onCoachUpdates(userId, cb) {
  const ch = supabase.channel(`coach_updates:${userId}:${uuid()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_updates', filter: `user_id=eq.${userId}` },
      ({ new: r }) => r?.section && cb({ section: r.section, count: r.count }))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// Ζωντανά «σήματα» από τη βάση: τι άλλαξε και για ποιον αθλούμενο/ομάδα (χωρίς δεδομένα).
// Φτάνουν και όταν ο χρήστης μόλις έχασε την πρόσβαση (π.χ. διακοπή συνεργασίας). cb({ kind, ref })
// onResync: η σύνδεση κόπηκε και ξαναστήθηκε — ό,τι έγινε στο ενδιάμεσο πρέπει να ξαναδιαβαστεί.
export function onSignals(userId, cb, onResync) {
  let first = true;
  const ch = supabase.channel(`live_signals:${userId}:${uuid()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_signals', filter: `user_id=eq.${userId}` },
      ({ new: r }) => r?.kind && cb({ id: r.id, kind: r.kind, ref: r.ref, actor: r.actor ?? null }))
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (first) first = false;
      else onResync?.();
    });
  return () => { supabase.removeChannel(ch); };
}

/* ---------- Online (ποιοι αθλούμενοι έχουν ανοιχτή την εφαρμογή αυτή τη στιγμή) ---------- */

// Ο αθλούμενος δηλώνει «είμαι μέσα» στο κανάλι του προπονητή του.
export function announcePresence(coachId, athleteId) {
  const ch = supabase.channel(`presence:${coachId}`, { config: { presence: { key: athleteId } } });
  ch.subscribe((status) => { if (status === 'SUBSCRIBED') ch.track({ athleteId }); });
  return () => { supabase.removeChannel(ch); };
}

// Ο προπονητής βλέπει ποιοι είναι μέσα: cb(Set από athleteId).
export function watchPresence(coachId, cb) {
  const ch = supabase.channel(`presence:${coachId}`);
  ch.on('presence', { event: 'sync' }, () =>
    cb(new Set(Object.values(ch.presenceState()).flat().map((x) => x.athleteId))));
  ch.subscribe();
  return () => { supabase.removeChannel(ch); };
}

/* ---------- Αθλούμενοι ---------- */

const num = (v) => (v == null ? null : Number(v));

// owner: σε ποιον ανήκουν τα δεδομένα · coachId: ποιος προπονητής έχει πρόσβαση
// linked: ο φάκελος ανήκει στον ίδιο τον αθλούμενο (αποδέχτηκε πρόσκληση) και έχει προπονητή
const toAthlete = (r) => r && ({
  id: r.id, owner: r.owner, coachId: r.coach_id ?? null, name: r.name, self: r.self, age: num(r.age), height: num(r.height_cm),
  mergedIds: r.merged_ids ?? [], // φάκελοι φωτογραφιών παλιών αρχείων που ενώθηκαν σε αυτόν
  avatar: r.avatar ?? null,
  journal: r.journal ?? {}, // Ημερολόγιο: { off: [πεδία που δεν παρακολουθεί], targets: { sleep, water, steps, calories } }
  checkinForm: r.checkin_form ?? null, // ερωτήσεις του check-in (κενό = οι προεπιλεγμένες)
  linked: !!r.coach_id && r.coach_id !== r.owner,
  consentConfirmedAt: r.consent_confirmed_at, clientConsentAt: r.client_consent_at, createdAt: r.created_at,
});

// Όσοι αθλούμενοι φαίνονται στον χρήστη (το RLS: δικοί του ή όσοι προπονεί).
export const listAthletes = async () =>
  check(await supabase.from('athletes').select('*').order('created_at')).map(toAthlete);

export const getAthlete = async (id) =>
  toAthlete(check(await supabase.from('athletes').select('*').eq('id', id).maybeSingle()));

// asCoach: ο προπονητής φτιάχνει φάκελο για αθλούμενο και κρατά πρόσβαση ως προπονητής.
export async function addAthlete(name, { self = false, asCoach = false, consentConfirmedAt = null, age = null, height = null } = {}) {
  const insert = { name: name.trim(), self, consent_confirmed_at: consentConfirmedAt };
  if (age != null) insert.age = age;
  if (height != null) insert.height_cm = height;
  if (asCoach) insert.coach_id = await currentUserId();
  const row = check(await supabase.from('athletes').insert(insert).select().single());
  return toAthlete(row);
}

// Αλλαγή στοιχείων αθλούμενου (ηλικία, ύψος).
export async function updateAthlete(id, { age, height }) {
  const patch = {};
  if (age !== undefined) patch.age = age;
  if (height !== undefined) patch.height_cm = height;
  return toAthlete(check(await supabase.from('athletes').update(patch).eq('id', id).select().single()));
}

/* ---------- Προπονητής ↔ αθλούμενος ---------- */
// Όλοι οι έλεγχοι (μοναδικός σύνδεσμος, μιας χρήσης, λήξη, email) γίνονται μέσα στη βάση.

// Ο λόγος απόρριψης έρχεται ως 'error:<λόγος>' (ώστε η βάση να μετράει και τις αποτυχημένες προσπάθειες).
export async function createInvite(athleteId, email = '') {
  const r = check(await supabase.rpc('create_invite', { p_athlete: athleteId, p_email: email || null }));
  if (typeof r === 'string' && r.startsWith('error:')) throw new Error(r.slice(6));
  return r;
}

// Γιατί δεν στάλθηκε μια πρόσκληση (από τον έλεγχο της βάσης) → κωδικός ή null.
const INVITE_ERRORS = ['already_coached', 'already_yours', 'coach_account', 'own_email', 'too_many'];
export const inviteErrorCode = (err) => INVITE_ERRORS.find((c) => String(err?.message || err || '').includes(c)) || null;
// …και το μήνυμα για τον προπονητή (μόνο ο λόγος — όχι ποιος είναι ο άλλος προπονητής).
export const INVITE_ERROR_TEXT = {
  already_coached: 'Αυτός ο αθλούμενος συνεργάζεται ήδη με άλλον προπονητή, οπότε η πρόσκληση δεν στάλθηκε. Θα μπορείς να τον προσκαλέσεις όταν διακόψει την τρέχουσα συνεργασία.',
  already_yours: 'Αυτός ο αθλούμενος είναι ήδη συνδεδεμένος μαζί σου.',
  coach_account: 'Αυτό το email ανήκει σε λογαριασμό προπονητή. Οι αθλούμενοι χρειάζονται λογαριασμό «Προσωπική χρήση».',
  own_email: 'Αυτό είναι το δικό σου email.',
  too_many: 'Έστειλες πολλές προσκλήσεις μέσα σε λίγη ώρα. Δοκίμασε ξανά σε λίγο.',
};

export const revokeInvite = async (athleteId) =>
  check(await supabase.rpc('revoke_invite', { p_athlete: athleteId }));

// Οι προσκλήσεις του προπονητή (για να δείχνει «αναμένει αποδοχή» / «συνδέθηκε»).
export const listInvites = async () =>
  check(await supabase.from('invites').select('*').order('created_at', { ascending: false })).map((r) => ({
    id: r.id, token: r.token, athleteId: r.athlete_id, email: r.email, createdAt: r.created_at,
    expiresAt: r.expires_at, usedAt: r.used_at, usedEmail: r.used_email, revokedAt: r.revoked_at, declinedAt: r.declined_at,
  }));

export async function inviteInfo(token) {
  const rows = check(await supabase.rpc('invite_info', { p_token: token }));
  const r = rows?.[0];
  return r && { status: r.status, coachName: r.coach_name, athleteName: r.athlete_name, emailLocked: r.email_locked };
}

// (Μετά από σύνδεση/αποσύνδεση ο φάκελος του χρήστη αλλάζει, οπότε ξεχνάμε τον αποθηκευμένο.)
export async function acceptInvite(token) {
  const r = check(await supabase.rpc('accept_invite', { p_token: token }));
  selfPending = null;
  return r;
}

export async function disconnectCoach(athleteId) {
  const r = check(await supabase.rpc('disconnect_coach', { p_athlete: athleteId }));
  selfPending = null;
  return r;
}

// Οι προσκλήσεις που αφορούν ΕΜΕΝΑ (ταιριάζει το email μου) — για το πλαίσιο «αίτημα» μέσα στην εφαρμογή.
export const listMyInvites = async () =>
  check(await supabase.rpc('my_invites')).map((r) => ({
    token: r.token, coachId: r.coach_id, coachName: r.coach_name, athleteName: r.athlete_name, createdAt: r.created_at,
  }));

export const declineInvite = async (token) => check(await supabase.rpc('decline_invite', { p_token: token }));

export async function getMyCoach() {
  const r = check(await supabase.rpc('get_my_coach'))?.[0];
  return r ? { athleteId: r.athlete_id, name: r.coach_name, since: r.since } : null;
}

// Ο προσωπικός λογαριασμός έχει πάντα έναν αθλούμενο: τον εαυτό του.
// (Κρατάμε την κλήση σε εξέλιξη ώστε δύο ταυτόχρονες κλήσεις να μη φτιάξουν δύο.)
let selfPending = null;
export function getSelfAthlete(user) {
  if (!selfPending) {
    selfPending = (async () => {
      const mine = () => supabase.from('athletes').select('*').eq('self', true).eq('owner', user.id);
      const found = check(await mine().maybeSingle());
      if (found) return toAthlete(found);
      try {
        return await addAthlete(user.name, { self: true });
      } catch (e) {
        // Το έφτιαξε ήδη άλλη καρτέλα (μοναδικός self ανά χρήστη στη βάση)
        if (e.code !== '23505') throw e;
        return toAthlete(check(await mine().single()));
      }
    })().finally(() => { selfPending = null; });
  }
  return selfPending;
}

export async function deleteAthlete(id) {
  const checkins = await listCheckins(id);
  // Πρώτα οι φωτογραφίες (μετά τη διαγραφή του φακέλου δεν θα είχαμε πια πρόσβαση στον φάκελό τους).
  await removePhotos(checkins.flatMap((c) => Object.values(c.photos)));
  const a = await getAthlete(id);
  for (const folder of [id, ...(a?.mergedIds ?? [])]) await removeFolder(folder);
  // Τα αρχεία του προγράμματός του (αν δεν έχει τρέξει ακόμα το SQL 016, απλώς δεν υπάρχουν).
  const plans = await getAthletePlans(id).catch(() => ({}));
  await removePlanFiles(Object.values(plans).flatMap((p) => p?.files.map((f) => f.path) ?? [])).catch(() => {});
  check(await supabase.from('athletes').delete().eq('id', id)); // καταγραφές και πρόγραμμα σβήνονται μαζί
}

/* ---------- Καταγραφές ---------- */

// Μόνο απλές τιμές (αριθμός, ναι/όχι, σύντομο κείμενο): ό,τι άλλο αγνοείται, ώστε να μη «σπάει» η σελίδα.
const cleanValues = (a) => Object.fromEntries(
  Object.entries(a && typeof a === 'object' && !Array.isArray(a) ? a : {})
    .filter(([, v]) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 500)),
);

const toCheckin = (r) => ({
  id: r.id, athleteId: r.athlete_id, date: r.date,
  weight: r.weight == null ? null : Number(r.weight),
  photos: r.photos ?? {}, note: r.note ?? '', createdAt: r.created_at,
  answers: cleanValues(r.answers), // ερωτηματολόγιο: { id ερώτησης: τιμή }
  reviewedAt: r.reviewed_at ?? null, // πότε το έλεγξε ο προπονητής
});

// Ταξινομημένες από την παλαιότερη στη νεότερη.
export const listCheckins = async (athleteId) =>
  check(
    await supabase.from('checkins').select('*').eq('athlete_id', athleteId)
      .order('date').order('created_at')
  ).map(toCheckin);

// Όλες οι καταγραφές του χρήστη με ένα αίτημα (το RLS επιστρέφει μόνο τις δικές του).
// Για τη λίστα του προπονητή, αντί για ένα αίτημα ανά αθλούμενο.
export const listAllCheckins = async () =>
  check(await supabase.from('checkins').select('id, athlete_id, date, photos, created_at, reviewed_at').order('date').order('created_at')).map(toCheckin);

// (Το βάρος δεν αποθηκεύεται εδώ αλλά στον πίνακα βάρους – δες setWeighIn.)
export const putCheckin = async (c) =>
  check(await supabase.from('checkins').upsert({
    id: c.id, athlete_id: c.athleteId, date: c.date, weight: null,
    photos: c.photos, note: c.note, created_at: c.createdAt, answers: c.answers ?? {},
  }));

// «Ελέγχθηκε» (μόνο ο προπονητής· η βάση αγνοεί την αλλαγή από οποιονδήποτε άλλον).
export const setCheckinReviewed = async (id, reviewed) =>
  check(await supabase.from('checkins').update({ reviewed_at: reviewed ? new Date().toISOString() : null }).eq('id', id));

export async function deleteCheckin(c) {
  check(await supabase.from('checkins').delete().eq('id', c.id));
  await removePhotos(Object.values(c.photos));
}

/* ---------- Βάρος ---------- */
// Ένα βάρος ανά αθλούμενο ανά ημέρα (πίνακας weigh_ins). Είναι η μόνη πηγή για το βάρος:
// ο πίνακας βάρους, το γράφημα και οι καταγραφές με φωτογραφίες διαβάζουν όλα από εδώ.

const toWeighIn = (r) => ({
  id: r.id, athleteId: r.athlete_id, date: r.date,
  weight: Number(r.weight), note: r.note ?? '', createdAt: r.created_at,
});

// Ταξινομημένα από το παλαιότερο στο νεότερο.
export const listWeighIns = async (athleteId) =>
  check(await supabase.from('weigh_ins').select('*').eq('athlete_id', athleteId).order('date')).map(toWeighIn);

// Όλο το βάρος του χρήστη με ένα αίτημα (για τη λίστα του προπονητή).
export const listAllWeighIns = async () =>
  check(await supabase.from('weigh_ins').select('id, athlete_id, date, weight, created_at').order('date')).map(toWeighIn);

// Γράφει το βάρος μιας ημέρας· αν υπάρχει ήδη για εκείνη τη μέρα, το αντικαθιστά.
// Η σημείωση αλλάζει μόνο αν δοθεί.
export async function setWeighIn({ athleteId, date, weight, note }) {
  const row = { athlete_id: athleteId, date, weight };
  if (note !== undefined) row.note = note;
  check(await supabase.from('weigh_ins').upsert(row, { onConflict: 'athlete_id,date' }));
}

export async function updateWeighIn(id, patch) {
  const row = {};
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.weight !== undefined) row.weight = patch.weight;
  if (patch.note !== undefined) row.note = patch.note;
  check(await supabase.from('weigh_ins').update(row).eq('id', id));
}

export const deleteWeighIn = async (id) => check(await supabase.from('weigh_ins').delete().eq('id', id));

export const deleteWeighInOn = async (athleteId, date) =>
  check(await supabase.from('weigh_ins').delete().eq('athlete_id', athleteId).eq('date', date));

// Βάζει σε κάθε καταγραφή το βάρος της ημέρας της (από τον πίνακα βάρους).
export function withWeights(checkins, weighIns) {
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  return checkins.map((c) => ({ ...c, weight: byDate.get(c.date) ?? null }));
}

/* ---------- Καθημερινά ---------- */
// Μία γραμμή ανά αθλούμενο ανά ημέρα: θερμίδες, πρόγραμμα προπόνησης, βήματα, νερό (L).

const hhmm = (t) => (t ? String(t).slice(0, 5) : null); // '23:30:00' → '23:30'
const toDaily = (r) => ({
  id: r.id, athleteId: r.athlete_id, date: r.date, createdAt: r.created_at,
  calories: num(r.calories), workout: r.workout ?? '', steps: num(r.steps), water: num(r.water),
  sleepStart: hhmm(r.sleep_start), sleepEnd: hhmm(r.sleep_end), sleepQuality: num(r.sleep_quality),
});

// Ταξινομημένα από το παλαιότερο στο νεότερο.
export const listDailyLogs = async (athleteId) =>
  check(await supabase.from('daily_logs').select('*').eq('athlete_id', athleteId).order('date')).map(toDaily);

const dailyRow = (v) => {
  const row = {};
  for (const k of ['date', 'calories', 'steps', 'water']) if (v[k] !== undefined) row[k] = v[k];
  if (v.workout !== undefined) row.workout = v.workout?.trim() || null;
  if (v.sleepStart !== undefined) row.sleep_start = v.sleepStart || null;
  if (v.sleepEnd !== undefined) row.sleep_end = v.sleepEnd || null;
  if (v.sleepQuality !== undefined) row.sleep_quality = v.sleepQuality || null;
  return row;
};

// Ημερολόγιο: αλλάζει ένα ή περισσότερα πεδία μιας ημέρας (τα υπόλοιπα μένουν ως έχουν).
// Αν μετά την αλλαγή η μέρα μένει τελείως άδεια, η γραμμή σβήνεται.
const DAILY_KEYS = ['calories', 'workout', 'steps', 'water', 'sleepStart', 'sleepEnd', 'sleepQuality'];
export async function saveDailyFields(athleteId, date, current, patch) {
  const next = { ...(current || {}), ...patch };
  const empty = DAILY_KEYS.every((k) => (k === 'workout' ? !String(next[k] || '').trim() : next[k] == null || next[k] === ''));
  if (empty) {
    check(await supabase.from('daily_logs').delete().eq('athlete_id', athleteId).eq('date', date));
    return;
  }
  // Πρώτα αλλαγή της υπάρχουσας γραμμής· νέα γραμμή μόνο αν δεν υπάρχει ακόμα.
  // (Όχι upsert: η βάση ελέγχει τη γραμμή που στέλνεται πριν δει ότι υπάρχει ήδη, οπότε
  // το «άδειασμα» ενός πεδίου, π.χ. ώρες ύπνου, θα απορριπτόταν ως «γραμμή χωρίς τιμές».)
  const changes = dailyRow(patch);
  const updated = check(await supabase.from('daily_logs').update(changes)
    .eq('athlete_id', athleteId).eq('date', date).select('id'));
  if (!updated.length) check(await supabase.from('daily_logs').insert({ athlete_id: athleteId, date, ...changes }));
}

// Πεδία και στόχοι του Ημερολογίου ενός αθλούμενου.
export async function setAthleteJournal(athleteId, journal) {
  check(await supabase.from('athletes').update({ journal }).eq('id', athleteId));
}

// Οι ερωτήσεις του check-in (null = οι προεπιλεγμένες της εφαρμογής).
export async function setCheckinForm(athleteId, form) {
  check(await supabase.from('athletes').update({ checkin_form: form }).eq('id', athleteId));
}


/* ---------- Φωτογραφίες ---------- */
// Το "id" μιας φωτογραφίας είναι η διαδρομή της στο Storage: <user id>/<uuid>.jpg
// Δίπλα της υπάρχει και μικρή έκδοση:                           <user id>/<uuid>.thumb.jpg
// (Οι κάρτες και το αρχείο κατεβάζουν τη μικρή· μεγέθυνση και σύγκριση την κανονική.)

export const thumbPath = (path) => path.replace(/\.jpg$/, '.thumb.jpg');

const photoCache = new Map(); // 'full:διαδρομή' ή 'thumb:διαδρομή' → Promise<Blob | null>

const upload = (path, blob) =>
  supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });

// Ανεβάζει { full, thumb } (από processImage) και επιστρέφει τη διαδρομή της κανονικής.
// Οι νέες φωτογραφίες μπαίνουν στον φάκελο του αθλούμενου (<athlete id>/…), ώστε να τις
// βλέπουν και ο αθλούμενος και ο προπονητής του.
export async function addPhoto({ full, thumb }, athleteId) {
  const path = `${athleteId || (await currentUserId())}/${uuid()}.jpg`;
  // Η κανονική και η μικρή ανεβαίνουν ταυτόχρονα.
  // (Αν αποτύχει η μικρή, δεν πειράζει: θα φτιαχτεί την πρώτη φορά που θα χρειαστεί.)
  const [main, small] = await Promise.all([upload(path, full), thumb ? upload(thumbPath(path), thumb) : null]);
  check(main);
  photoCache.set('full:' + path, Promise.resolve(full));
  if (thumb && !small?.error) photoCache.set('thumb:' + path, Promise.resolve(thumb));
  return path;
}

async function download(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  return error ? null : data;
}

// Η μικρή έκδοση· αν λείπει (παλιά φωτογραφία), τη φτιάχνει από την κανονική και την αποθηκεύει.
async function loadThumb(path) {
  const thumb = await download(thumbPath(path));
  if (thumb) return thumb;
  const full = await getPhoto(path, 'full');
  if (!full) return null;
  try {
    const made = await makeThumb(full);
    upload(thumbPath(path), made).catch(() => {});
    return made;
  } catch {
    return full;
  }
}

// size: 'full' (κανονική) ή 'thumb' (μικρή)
export function getPhoto(path, size = 'full') {
  const key = `${size}:${path}`;
  if (!photoCache.has(key)) {
    const p = (size === 'thumb' ? loadThumb(path) : download(path)).then((blob) => {
      if (!blob) photoCache.delete(key);
      return blob;
    });
    photoCache.set(key, p);
  }
  return photoCache.get(key);
}

// Σβήνει τις φωτογραφίες μαζί με τις μικρές τους εκδόσεις.
export async function removePhotos(paths) {
  const list = paths.filter(Boolean).flatMap((p) => [p, thumbPath(p)]);
  for (const p of paths.filter(Boolean)) {
    photoCache.delete('full:' + p);
    photoCache.delete('thumb:' + p);
  }
  for (let i = 0; i < list.length; i += 100) {
    check(await supabase.storage.from(BUCKET).remove(list.slice(i, i + 100)));
  }
}

/* ---------- Δικαιώματα χρήστη (GDPR) ---------- */
// Η λήψη δεδομένων (ZIP) είναι στο lib/exportZip.js.

// Οριστική διαγραφή: πρώτα όλες οι φωτογραφίες από το Storage,
// μετά ο λογαριασμός (προφίλ, αθλούμενοι, καταγραφές σβήνονται μαζί στη βάση).
// Σβήνει όλα τα αρχεία ενός φακέλου στο Storage.
async function removeFolder(folder) {
  let last = null;
  for (;;) {
    const files = check(await supabase.storage.from(BUCKET).list(folder, { limit: 1000 }));
    if (!files.length) break;
    // Αν δεν σβήστηκε τίποτα από τον προηγούμενο γύρο, σταματάμε αντί να κολλήσουμε.
    if (files[0].name === last) throw new Error('Δεν ήταν δυνατή η διαγραφή των φωτογραφιών.');
    last = files[0].name;
    await removePhotos(files.map((f) => `${folder}/${f.name}`));
  }
}

export async function deleteMyAccount() {
  const uid = await currentUserId();
  // Οι φάκελοι που ΑΝΗΚΟΥΝ στον χρήστη (δικός του, ή αθλούμενοι προπονητή χωρίς λογαριασμό).
  // Οι συνδεδεμένοι αθλούμενοι ενός προπονητή κρατούν τα δεδομένα τους.
  const owned = (await listAthletes()).filter((a) => a.owner === uid);
  for (const a of owned) {
    await removePhotos((await listCheckins(a.id)).flatMap((c) => Object.values(c.photos)));
    for (const folder of [a.id, ...a.mergedIds]) await removeFolder(folder);
  }
  await removeFolder(uid); // παλιές φωτογραφίες
  check(await supabase.rpc('delete_my_account'));
  photoCache.clear();
}

/* ---------- Φωτογραφία προφίλ (avatar) ---------- */
// Αποθηκεύεται στον ίδιο χώρο "photos", στον φάκελο του αθλούμενου ή του χρήστη.

async function uploadAvatar(folder, blob) {
  const path = folder + "/avatar-" + uuid() + ".jpg";
  check(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }));
  photoCache.set("thumb:" + path, Promise.resolve(blob));
  photoCache.set("full:" + path, Promise.resolve(blob));
  return path;
}

// Φωτογραφία ενός αθλούμενου (τη βάζει ο προπονητής ή ο ίδιος).
export async function setAthleteAvatar(athleteId, blob) {
  const cur = check(await supabase.from("athletes").select("avatar").eq("id", athleteId).maybeSingle());
  const path = await uploadAvatar(athleteId, blob);
  check(await supabase.from("athletes").update({ avatar: path }).eq("id", athleteId));
  if (cur && cur.avatar) removePhotos([cur.avatar]).catch(() => {});
  return path;
}

export async function clearAthleteAvatar(athleteId) {
  const cur = check(await supabase.from("athletes").select("avatar").eq("id", athleteId).maybeSingle());
  check(await supabase.from("athletes").update({ avatar: null }).eq("id", athleteId));
  if (cur && cur.avatar) removePhotos([cur.avatar]).catch(() => {});
}

// Η δική μου φωτογραφία (ράγα + λογαριασμός). Για προσωπικό λογαριασμό μπαίνει και στον φάκελό του,
// ώστε να τη βλέπει και ο προπονητής του.
export async function setMyAvatar(user, blob) {
  if (user.type === "personal") {
    const self = await getSelfAthlete(user);
    const path = await setAthleteAvatar(self.id, blob);
    check(await supabase.from("profiles").update({ avatar: path }).eq("id", user.id));
    return path;
  }
  const prof = await getProfile(user.id);
  const path = await uploadAvatar(user.id, blob);
  check(await supabase.from("profiles").update({ avatar: path }).eq("id", user.id));
  if (prof && prof.avatar) removePhotos([prof.avatar]).catch(() => {});
  return path;
}

export async function clearMyAvatar(user) {
  const prof = await getProfile(user.id);
  if (user.type === "personal") {
    const self = await getSelfAthlete(user);
    check(await supabase.from("athletes").update({ avatar: null }).eq("id", self.id));
    if (self.avatar) removePhotos([self.avatar]).catch(() => {});
  }
  check(await supabase.from("profiles").update({ avatar: null }).eq("id", user.id));
  if (prof && prof.avatar) removePhotos([prof.avatar]).catch(() => {});
}
