// Πρόγραμμα προπόνησης/διατροφής → αρχείο PDF με την ταυτότητα του FormLog (λογότυπο, χρώματα).
// Η γραμματοσειρά (Noto Sans, με πλήρη ελληνικά) μπαίνει μέσα στο αρχείο, ώστε να ανοίγει σωστά
// σε κάθε κινητό/υπολογιστή χωρίς «σπασμένους» χαρακτήρες. Φορτώνεται μόνο όταν ζητηθεί PDF.
import { PDFDocument, rgb, LineCapStyle } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fmtDate } from './utils';
import { MACROS, PLAN_KINDS, isText, textLines } from '@/components/PlanView';

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// Τα χρώματα του site (φωτεινό θέμα — το χαρτί είναι πάντα λευκό).
const C = {
  primary: hex('#0e8a6b'), ink: hex('#16202a'), muted: hex('#64727f'), line: hex('#e3e8ed'),
  soft: hex('#e3f4ee'), amber: hex('#e8a33d'), white: rgb(1, 1, 1),
};
const A4 = [595.28, 841.89];
const M = 48; // περιθώριο
const W = A4[0] - 2 * M; // πλάτος περιεχομένου
const BOTTOM = 64; // χώρος για το υποσέλιδο

// Το λογότυπο (ίδιο σχέδιο με το components/Logo.js), σε κλίμακα 64 → size.
const LOGO_BG = 'M15 0H49A15 15 0 0 1 64 15V49A15 15 0 0 1 49 64H15A15 15 0 0 1 0 49V15A15 15 0 0 1 15 0Z';
const LOGO_FRAME = 'M10 19v-6a3 3 0 0 1 3-3h6M45 10h6a3 3 0 0 1 3 3v6M54 45v6a3 3 0 0 1-3 3h-6M19 54h-6a3 3 0 0 1-3-3v-6';
const LOGO_F = 'M23 44V20h17a2.5 2.5 0 0 1 2.5 2.5v2.5A2.5 2.5 0 0 1 40 27.5H30.5v3.5h7a2.5 2.5 0 0 1 2.5 2.5v2A2.5 2.5 0 0 1 37.5 38h-7v6a2.5 2.5 0 0 1-2.5 2.5h-2.5A2.5 2.5 0 0 1 23 44z';
const LOGO_DOT = 'M38 41.5A2.5 2.5 0 0 1 43 41.5V44A2.5 2.5 0 0 1 38 44Z';

const filled = (s) => String(s ?? '').trim() !== '';
const roundRect = (w, h, r) => `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;

let fontBytes = null;
const loadFonts = () => {
  fontBytes ??= Promise.all(['/fonts/NotoSans-Regular.ttf', '/fonts/NotoSans-Bold.ttf'].map(async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error('font');
    return r.arrayBuffer();
  })).catch((e) => { fontBytes = null; throw e; });
  return fontBytes;
};

// plan: { kind, title, content, updatedAt } · names: { athlete, coach }
export async function buildPlanPdf(plan, names = {}) {
  const [regBytes, boldBytes] = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Ολόκληρη η γραμματοσειρά (όχι «μόνο τα γράμματα που χρησιμοποιούνται»): το κόψιμο
  // της βιβλιοθήκης χαλάει ελληνικούς χαρακτήρες σε κάποιους αναγνώστες PDF.
  const reg = await doc.embedFont(regBytes, { subset: false });
  const bold = await doc.embedFont(boldBytes, { subset: false });
  const kind = PLAN_KINDS[plan.kind];
  const docTitle = filled(plan.title) ? plan.title.trim() : kind.long.charAt(0).toUpperCase() + kind.long.slice(1);
  doc.setTitle(`${docTitle} · FormLog`);
  doc.setAuthor(names.coach || 'FormLog');
  doc.setCreator('FormLog');
  doc.setProducer('FormLog');
  doc.setLanguage('el-GR');

  // Ελληνικά χωρίς εκπλήξεις: ενωμένοι τόνοι (NFC) και μόνο χαρακτήρες που έχει η γραμματοσειρά
  // (π.χ. emoji φεύγουν αντί να βγουν κουτάκια).
  const known = new Set(reg.getCharacterSet());
  const clean = (t) => [...String(t ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')]
    .filter((ch) => ch === '\n' || known.has(ch.codePointAt(0)))
    .join('');

  // Σπάει κείμενο σε γραμμές που χωράνε στο πλάτος (κρατά τις αλλαγές γραμμής του προπονητή).
  const wrap = (text, font, size, width) => {
    const out = [];
    for (const para of clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; continue; }
        if (line) out.push(line);
        // λέξη μεγαλύτερη από τη γραμμή: σπάει σε κομμάτια
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let n = rest.length - 1;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n -= 1;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  };

  let page;
  let y;
  const text = (s, x, yy, font, size, color = C.ink) => page.drawText(clean(s), { x, y: yy, font, size, color });
  const textRight = (s, xr, yy, font, size, color) => text(s, xr - font.widthOfTextAtSize(clean(s), size), yy, font, size, color);
  const logo = (x, top, size) => {
    const scale = size / 64;
    page.drawSvgPath(LOGO_BG, { x, y: top, scale, color: C.primary });
    page.drawSvgPath(LOGO_FRAME, { x, y: top, scale, borderColor: C.white, borderWidth: 3.2, borderOpacity: 0.9, borderLineCap: LineCapStyle.Round });
    page.drawSvgPath(LOGO_F, { x, y: top, scale, color: C.white });
    page.drawSvgPath(LOGO_DOT, { x, y: top, scale, color: C.amber });
  };
  const box = (x, top, w, h, r, color) => page.drawSvgPath(roundRect(w, h, r), { x, y: top, color });

  const newPage = (first) => {
    page = doc.addPage(A4);
    const top = A4[1] - M;
    if (first) {
      logo(M, top, 30);
      text('FormLog', M + 40, top - 21, bold, 17, C.ink);
      textRight(kind.long.charAt(0).toUpperCase() + kind.long.slice(1), M + W, top - 20, reg, 10.5, C.muted);
      y = top - 62;
    } else {
      logo(M, top, 18);
      text(docTitle, M + 26, top - 13, reg, 9.5, C.muted);
      page.drawLine({ start: { x: M, y: top - 26 }, end: { x: M + W, y: top - 26 }, thickness: 0.6, color: C.line });
      y = top - 50;
    }
  };
  const ensure = (h) => { if (y - h < BOTTOM) newPage(false); };

  // ---- Κεφαλίδα: τίτλος + για ποιον / από ποιον
  newPage(true);
  for (const l of wrap(docTitle, bold, 22, W)) { ensure(30); text(l, M, y, bold, 22); y -= 29; }
  const meta = [
    filled(names.athlete) && `Για: ${names.athlete}`,
    filled(names.coach) && `Προπονητής: ${names.coach}`,
    plan.updatedAt && `Ενημερώθηκε ${fmtDate(plan.updatedAt.slice(0, 10))}`,
  ].filter(Boolean).join('  ·  ');
  if (meta) { for (const l of wrap(meta, reg, 10, W)) { text(l, M, y + 4, reg, 10, C.muted); y -= 15; } }
  page.drawRectangle({ x: M, y: y - 4, width: 56, height: 3, color: C.primary });
  y -= 30;

  const c = plan.content || {};
  const heading = (s) => {
    ensure(48);
    const label = clean(s);
    const w = Math.min(W, bold.widthOfTextAtSize(label, 12) + 24);
    box(M, y + 8, w, 24, 12, C.soft);
    text(label, M + 12, y - 8, bold, 12, C.primary);
    y -= 34;
  };

  if (isText(c)) {
    // ---- Κείμενο όπως το επικόλλησε ο προπονητής: οι γραμμές του, επικεφαλίδες με πράσινη ετικέτα
    for (const l of textLines(c.text)) {
      if (l.kind === 'gap') { y -= 8; continue; }
      if (l.kind === 'h') { y -= 4; heading(l.text); continue; }
      for (const w of wrap(l.text, reg, 11, W - 12)) { ensure(16); text(w, M + 12, y, reg, 11); y -= 16; }
    }
  } else if (plan.kind === 'training') {
    // ---- Προπόνηση: ανά ημέρα, ασκήσεις με σετ × επαναλήψεις και διάλειμμα
    const days = (c.days || []).filter((d) => d.exercises?.some((e) => filled(e.name)));
    days.forEach((d, i) => {
      heading(filled(d.name) ? d.name : `Ημέρα ${i + 1}`);
      const nameW = W - 150;
      d.exercises.filter((e) => filled(e.name)).forEach((e, j) => {
        const nameLines = wrap(e.name, bold, 11.5, nameW);
        const noteLines = filled(e.note) ? wrap(e.note, reg, 9.5, nameW) : [];
        const h = nameLines.length * 15 + noteLines.length * 13 + 12;
        ensure(h);
        const rowTop = y;
        text(String(j + 1), M + 2, y, bold, 10.5, C.muted);
        nameLines.forEach((l) => { text(l, M + 24, y, bold, 11.5); y -= 15; });
        noteLines.forEach((l) => { text(l, M + 24, y + 1, reg, 9.5, C.muted); y -= 13; });
        const dose = [e.sets, e.reps].filter(filled).map((x) => String(x).trim()).join(' × ');
        if (dose) textRight(dose, M + W, rowTop, bold, 11.5, C.ink);
        if (filled(e.rest)) textRight(`διάλειμμα ${String(e.rest).trim()}`, M + W, rowTop - 14, reg, 9.5, C.muted);
        y = Math.min(y, rowTop - (filled(e.rest) ? 28 : 15));
        page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.6, color: C.line });
        y -= 12;
      });
      y -= 14;
    });
  } else {
    // ---- Διατροφή: μακροθρεπτικά σε κάρτες + γεύματα
    const macros = MACROS.filter((m) => filled(c[m.id]));
    if (macros.length) {
      ensure(62);
      const gap = 10;
      const bw = (W - gap * (macros.length - 1)) / macros.length;
      macros.forEach((m, i) => {
        const x = M + i * (bw + gap);
        box(x, y + 10, bw, 54, 10, C.soft);
        const v = clean(String(c[m.id]).trim());
        text(v, x + 12, y - 12, bold, 16, C.ink);
        text(m.unit, x + 16 + bold.widthOfTextAtSize(v, 16), y - 12, reg, 9.5, C.muted);
        text(m.label, x + 12, y - 30, reg, 9.5, C.muted);
      });
      y -= 72;
    }
    const meals = (c.meals || []).filter((x) => filled(x.text));
    meals.forEach((x, i) => {
      heading(filled(x.name) ? x.name : `Γεύμα ${i + 1}`);
      for (const l of wrap(x.text, reg, 11, W - 12)) { ensure(16); text(l, M + 12, y, reg, 11); y -= 16; }
      y -= 14;
    });
  }

  // ---- Σημειώσεις του προπονητή
  if (filled(c.notes)) {
    const lines = wrap(c.notes, reg, 10.5, W - 32);
    const h = 40 + lines.length * 15;
    ensure(Math.min(h, 120));
    if (y - h >= BOTTOM) box(M, y + 12, W, h, 12, C.soft); // πλαίσιο όταν χωράει σε μία σελίδα
    const barH = Math.min(h, y + 12 - BOTTOM);
    page.drawRectangle({ x: M, y: y + 12 - barH, width: 3, height: barH, color: C.primary });
    text('Σημειώσεις', M + 16, y - 8, bold, 11, C.primary);
    y -= 30;
    for (const l of lines) { ensure(16); text(l, M + 16, y, reg, 10.5); y -= 15; }
  }

  // ---- Υποσέλιδο σε κάθε σελίδα
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 42 }, end: { x: M + W, y: 42 }, thickness: 0.6, color: C.line });
    p.drawText('FormLog', { x: M, y: 28, font: bold, size: 9, color: C.primary });
    p.drawText(clean(`· ${kind.long}`), { x: M + bold.widthOfTextAtSize('FormLog', 9) + 4, y: 28, font: reg, size: 9, color: C.muted });
    const n = clean(`Σελίδα ${i + 1} από ${pages.length}`);
    p.drawText(n, { x: M + W - reg.widthOfTextAtSize(n, 9), y: 28, font: reg, size: 9, color: C.muted });
  });

  return { bytes: await doc.save(), title: docTitle };
}

// Κατεβάζει το PDF (στο κινητό: στις Λήψεις / «Αποθήκευση στα Αρχεία»).
export async function downloadPlanPdf(plan, names) {
  const { bytes, title } = await buildPlanPdf(plan, names);
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Πρόγραμμα';
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
