// Παράγει το app/walls.css: μοτίβα (SVG, inline) για το φόντο της συνομιλίας.
// Χρήση: node scripts/walls.js app/walls.css
const fs = require('fs');
const out = process.argv[2] || 'app/walls.css';

// «A:» μπροστά = σχέδιο με το κεχριμπαρί του λογότυπου· τα υπόλοιπα με το πράσινο του site.
const GYM = [
  // αλτήρας
  '<path d="M7 7v10M17 7v10M4.5 9.5v5M19.5 9.5v5M7 12h10"/>',
  // kettlebell
  '<circle cx="12" cy="15" r="6"/><path d="M8.6 10.6A4 4 0 0 1 9 5h6a4 4 0 0 1 .4 5.6"/>',
  // χρονόμετρο
  '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3h4M12 3v3.5M18 7l1.5-1.5"/>',
  // καρδιά με παλμό
  '<path d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.4 12 20 12 20z"/><path d="M6.5 12.5h2.5l1.5-2.5 2 4.5 1.5-2h3.5"/>',
  // παγούρι
  '<path d="M10 2.5h4M10.5 2.5v3L8.5 8v12a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5V8l-2-2.5v-3M8.5 13h7"/>',
  // δίσκος βαρών
  '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2"/><path d="M12 5.5v1.5"/>',
  // κεραυνός (ενέργεια)
  'A:<path d="M13 2.5 5.5 13h6l-1 8.5L18 11h-6z"/>',
  // φωτογραφική μηχανή (φωτογραφίες προόδου)
  '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  // ζυγαριά
  '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 10a4.5 4.5 0 0 1 7 0M12 10.5l1.5-2"/>',
  // παπούτσι
  '<path d="M3 17V9.5l4 1.3 2-2.8 3.5 3.5 5.5 1.5a3 3 0 0 1 3 3V17zM3 17h18M8 13.5l1.2-1.2M10.5 15l1.2-1.2"/>',
  // μπάρα
  '<path d="M2.5 12h19M6 8v8M8.5 9v6M18 8v8M15.5 9v6"/>',
  // μετάλλιο
  'A:<path d="m8 3 4 6 4-6"/><circle cx="12" cy="15" r="5.5"/>',
];

const FOOD = [
  // μήλο
  '<path d="M12 7.5c-2-1.5-6.5-1-6.5 4 0 4.5 3 9.5 6.5 8 3.5 1.5 6.5-3.5 6.5-8 0-5-4.5-5.5-6.5-4z"/><path d="M12 7.5c0-2 1-3.5 3-4.5"/>',
  // καρότο
  'A:<path d="M14.5 9.5 4 20l2-6.5 5-5.5a3 3 0 0 1 3.5 1.5zM14.5 9.5 18 6M15 8l1-4M16 9l4-1"/>',
  // αβοκάντο
  '<path d="M12 3c3 0 5 5 6 9a6 6 0 0 1-12 0c1-4 3-9 6-9z"/><circle cx="12" cy="14.5" r="2.5"/>',
  // αυγό
  '<path d="M12 3c3.5 0 6 6 6 10.5a6 6 0 0 1-12 0C6 9 8.5 3 12 3z"/>',
  // φύλλο
  '<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19l8-8"/>',
  // μπανάνα
  'A:<path d="M4 12.5c3 5.5 11 6.5 16-3l-1.2-2c-3 6-9 7-13.3 3.2zM18.8 7.5l.7-2"/>',
  // ποτήρι νερό
  '<path d="M6 4h12l-1.5 16h-9zM7 9h10"/>',
  // μπρόκολο
  '<path d="M12 21v-6.5M9.5 21h5M12 14.5c-4 0-6.5-2-5.5-5 0-2 2-3 3-3 1-2 4-2 5 0 2 0 3.5 2 2.5 4 1 3-1 4-5 4z"/>',
  // κεράσια
  '<circle cx="8" cy="17" r="3"/><circle cx="16" cy="17" r="3"/><path d="M8 14c1-5 3-8 6-10M16 14c0-4-1-7-2-10M14 4h3"/>',
  // μπολ
  '<path d="M3 12h18a9 9 0 0 1-18 0zM8 12c0-2 1-4 3-4M13 12c0-3 2-4 4-3"/>',
  // ψάρι
  '<path d="M3 12c3-4.5 9-6 14 0-5 6-11 4.5-14 0zM17 12l4-3.5v7z"/>',
  // λεμόνι
  'A:<path d="M5 12a7 5.5 0 0 0 14 0 7 5.5 0 0 0-14 0zM5 12H3.5M19 12h1.5"/>',
];

// Τα σημάδια του FormLog: γωνίες κάδρου (όπως στο λογότυπο), σύγκριση, άνοδος, πρόοδος.
const BRAND = [
  '<path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/>',
  'A:<rect x="10" y="6.5" width="4" height="11" rx="2"/>',
  '<path d="M4 17.5l5-5 4 3 7-8M15 7.5h5v5"/>',
  '<rect x="3" y="5.5" width="8" height="13" rx="2"/><rect x="13" y="5.5" width="8" height="13" rx="2"/>',
  '<path d="M12 4a8 8 0 1 1-8 8"/>',
  '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  '<path d="M7 10V7.5a.5.5 0 0 1 .5-.5H10M14 7h2.5a.5.5 0 0 1 .5.5V10M17 14v2.5a.5.5 0 0 1-.5.5H14M10 17H7.5a.5.5 0 0 1-.5-.5V14"/>',
  'A:<circle cx="12" cy="12" r="2.2"/>',
  '<path d="M4 12h3l2-4 3 8 2-4h6"/>',
  '<path d="M6 18v-6M10 18V9M14 18v-4M18 18V6"/>',
];

// Ψευδοτυχαίο αλλά σταθερό: κάθε build βγάζει το ίδιο μοτίβο.
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

function tile(icons, { size = 360, cols = 7, seed = 7, scale = 1.3 } = {}) {
  const r = rng(seed);
  const cell = size / cols;
  let main = '';
  let accent = '';
  for (let y = 0; y < cols; y++) {
    for (let x = 0; x < cols; x++) {
      const icon = icons[(x * 7 + y * 3) % icons.length];
      const cx = x * cell + cell / 2 + (r() - 0.5) * cell * 0.35 + (y % 2 ? cell / 4 : 0);
      const cy = y * cell + cell / 2 + (r() - 0.5) * cell * 0.35;
      const rot = Math.round((r() - 0.5) * 70);
      const s = scale * (0.85 + r() * 0.3);
      const g = `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(2)}) translate(-12 -12)">${icon.replace(/^A:/, '')}</g>`;
      if (icon.startsWith('A:')) accent += g; else main += g;
    }
  }
  const group = (color, opacity, body) =>
    `<g fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
  return ({ ink, op, amber, aop }) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    group(ink, op, main) + group(amber, aop, accent) + '</svg>';
}

const uri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')}")`;

// Κάθε θέμα έχει δικό του τόνο, όλοι από τα χρώματα του site (app/globals.css):
//   πράσινο (--primary/--soft), γραφίτης (--ink), κεχριμπαρί (--amber του λογότυπου).
const GREEN = '#0e8a6b', GREEN_D = '#3ccb9f', INK = '#16202a', INK_D = '#e8eef2', AMBER = '#e8a33d', AMBER_D = '#f0b45a';
const THEMES = {
  // Ορίζοντας: απαλό πράσινο, μεγάλα αραιά σχέδια
  brand: {
    draw: tile(BRAND, { seed: 5, cols: 5, scale: 1.7 }),
    light: { bg: '#e3f2ec', ink: GREEN, op: 0.17, amber: AMBER, aop: 0.38 },
    dark: { bg: '#0f1f1a', ink: GREEN_D, op: 0.12, amber: AMBER_D, aop: 0.2 },
  },
  // Ατσάλι: γραφίτης, πυκνά σχέδια
  gym: {
    draw: tile(GYM, { seed: 11, cols: 8, scale: 1.15 }),
    light: { bg: '#e6eaee', ink: INK, op: 0.13, amber: AMBER, aop: 0.4 },
    dark: { bg: '#161c22', ink: INK_D, op: 0.08, amber: AMBER_D, aop: 0.2 },
  },
  // Περιβόλι: απαλό κεχριμπαρί, πράσινα φρούτα/λαχανικά
  food: {
    draw: tile(FOOD, { seed: 23, cols: 7, scale: 1.35 }),
    light: { bg: '#f8f0e1', ink: GREEN, op: 0.16, amber: AMBER, aop: 0.42 },
    dark: { bg: '#1c1810', ink: GREEN_D, op: 0.1, amber: AMBER_D, aop: 0.22 },
  },
};

let css = '/* Παράγεται από το scripts/walls.js: φόντο της συνομιλίας (Λογαριασμός → Εμφάνιση). */\n';
let dark = '';
let forced = '';
for (const [id, t] of Object.entries(THEMES)) {
  const sel = (pre) => `${pre}.wall-${id} .chat-scroll, ${pre}.wall-swatch.wall-${id}`;
  const d = `background: ${t.dark.bg} ${uri(t.draw(t.dark))} 0 0 / 360px;`;
  css += `${sel('')} { background: ${t.light.bg} ${uri(t.draw(t.light))} 0 0 / 360px; }\n`;
  // Σκούρο: με το θέμα της συσκευής (εκτός αν διάλεξε «Φωτεινό»), ή όταν διάλεξε «Σκούρο».
  dark += `  ${sel(":root:not([data-theme='light']) ")} { ${d} }\n`;
  forced += `${sel(":root[data-theme='dark'] ")} { ${d} }\n`;
}
css += `@media (prefers-color-scheme: dark) {\n${dark}}\n${forced}`;
fs.writeFileSync(out, css);
console.log('ok', css.length);
