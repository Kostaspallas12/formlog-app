// Λήψη των δεδομένων μου (GDPR): ένα ZIP με
//   φωτογραφίες/…jpg   οι φωτογραφίες ως κανονικά αρχεία
//   καταγραφές.csv     ημερομηνία, βάρος, φωτογραφίες, σημείωση – ανοίγει σε κάθε πρόγραμμα πινάκων
//   βάρος.csv          ο πίνακας βάρους (ημερομηνία, κιλά, σημείωση) – ανοίγει σε κάθε πρόγραμμα πινάκων
//   καθημερινά.csv     θερμίδες, προπόνηση, βήματα και νερό ανά ημέρα – ανοίγει σε κάθε πρόγραμμα πινάκων
//   δεδομένα.json      όλα τα δεδομένα σε μορφή για μεταφορά σε άλλη υπηρεσία
// Ο προπονητής παίρνει έναν φάκελο ανά αθλούμενο.

import { strToU8, zipSync } from 'fflate';
import { getPhoto, listAthletes, listCheckins, listDailyLogs, listWeighIns, withWeights } from './storage';
import { ANGLES, todayISO } from './utils';

const ANGLE_FILE = { front: 'μπροστά', side: 'πλάγια', back: 'πίσω' };

// Ονόματα που επιτρέπονται σε φάκελο Windows/Mac
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '').trim() || 'χωρίς όνομα';

// CSV για ελληνικά προγράμματα πινάκων: διαχωριστικό ";" και υποδιαστολή ","
// Ασφάλεια (CSV injection): κείμενο που ξεκινά με = + - @ θα το εκτελούσε το πρόγραμμα πινάκων ως τύπο
// (π.χ. σημείωση «=HYPERLINK(…)»). Του βάζουμε μπροστά ' ώστε να μένει απλό κείμενο. Οι αριθμοί μένουν ως έχουν.
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');

const README = `Τα δεδομένα σου από το FormLog

φωτογραφίες/     Οι φωτογραφίες προόδου, με όνομα "ημερομηνία πλευρά.jpg".
καταγραφές.csv   Οι καταγραφές με φωτογραφίες (ημερομηνία, βάρος, φωτογραφίες, σημείωση). Ανοίγει σε κάθε πρόγραμμα πινάκων.
βάρος.csv        Όλο το ιστορικό βάρους (ημερομηνία, κιλά, σημείωση). Ανοίγει σε κάθε πρόγραμμα πινάκων.
καθημερινά.csv   Θερμίδες, πρόγραμμα προπόνησης, βήματα και νερό (L) ανά ημέρα. Ανοίγει σε κάθε πρόγραμμα πινάκων.
δεδομένα.json    Όλα τα δεδομένα του λογαριασμού σε μορφή κατάλληλη για μεταφορά σε άλλη υπηρεσία.
`;

// Φωτογραφίες + CSV ενός αθλούμενου μέσα στον φάκελο `dir` ('' για τη ρίζα)
async function addAthlete(files, dir, athlete) {
  const weighIns = await listWeighIns(athlete.id);
  const checkins = withWeights(await listCheckins(athlete.id), weighIns);
  const used = new Set();
  const rows = [['Ημερομηνία', 'Βάρος (kg)', 'Μπροστά', 'Πλάγια', 'Πίσω', 'Σημείωση']];
  const json = [];

  for (const c of checkins) {
    const photoFiles = {};
    for (const a of ANGLES) {
      const id = c.photos[a.id];
      const blob = id && (await getPhoto(id));
      if (!blob) continue;
      // Δύο καταγραφές την ίδια μέρα: "… (2).jpg"
      let name = `${c.date} ${ANGLE_FILE[a.id]}.jpg`;
      for (let n = 2; used.has(name); n++) name = `${c.date} ${ANGLE_FILE[a.id]} (${n}).jpg`;
      used.add(name);
      files[`${dir}φωτογραφίες/${name}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
      photoFiles[a.id] = `φωτογραφίες/${name}`;
    }
    rows.push([
      c.date,
      c.weight != null ? String(c.weight).replace('.', ',') : '',
      photoFiles.front ?? '', photoFiles.side ?? '', photoFiles.back ?? '',
      c.note,
    ]);
    json.push({ date: c.date, weight: c.weight, note: c.note, photos: photoFiles, createdAt: c.createdAt });
  }

  files[`${dir}καταγραφές.csv`] = strToU8(csv(rows));

  const kgRows = [['Ημερομηνία', 'Βάρος (kg)', 'Σημείωση']];
  for (const w of weighIns) kgRows.push([w.date, String(w.weight).replace('.', ','), w.note]);
  files[`${dir}βάρος.csv`] = strToU8(csv(kgRows));

  const daily = await listDailyLogs(athlete.id);
  const gr = (v) => (v == null ? '' : String(v).replace('.', ','));
  const dayRows = [['Ημερομηνία', 'Θερμίδες (kcal)', 'Προπόνηση', 'Βήματα', 'Νερό (L)']];
  for (const d of daily) dayRows.push([d.date, gr(d.calories), d.workout, gr(d.steps), gr(d.water)]);
  files[`${dir}καθημερινά.csv`] = strToU8(csv(dayRows));

  return {
    checkins: json,
    weighIns: weighIns.map((w) => ({ date: w.date, weight: w.weight, note: w.note, createdAt: w.createdAt })),
    daily: daily.map(({ id, athleteId, ...d }) => d),
  };
}

export async function buildExportZip(user) {
  const { email, name, type, createdAt, consent } = user;
  const account = { email, name, type, createdAt, consent };
  const athletes = await listAthletes();
  const files = { 'ΔΙΑΒΑΣΕ ΜΕ.txt': strToU8(README) };
  const data = { exportedAt: new Date().toISOString(), account, athletes: [] };

  if (account.type === 'coach') {
    const usedDirs = new Set();
    for (const a of athletes.filter((x) => x.coachId === user.id)) {
      let dir = safeName(a.name);
      for (let n = 2; usedDirs.has(dir); n++) dir = `${safeName(a.name)} (${n})`;
      usedDirs.add(dir);
      const parts = await addAthlete(files, `${dir}/`, a);
      data.athletes.push({ name: a.name, age: a.age, heightCm: a.height, folder: dir, createdAt: a.createdAt, consentConfirmedAt: a.consentConfirmedAt, ...parts });
    }
  } else {
    const me = athletes.find((a) => a.self && a.owner === user.id);
    if (me) Object.assign(data, { age: me.age, heightCm: me.height }, await addAthlete(files, '', me));
    delete data.athletes;
  }

  files['δεδομένα.json'] = strToU8(JSON.stringify(data, null, 2));
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

export const exportFileName = () => `formlog-${todayISO()}.zip`;
