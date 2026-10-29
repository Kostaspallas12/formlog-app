// Επεξεργασία φωτογραφιών στον browser, πριν το ανέβασμα.
// Κάθε φωτογραφία αποθηκεύεται σε δύο εκδόσεις:
//   full  – 1600px στη μεγάλη πλευρά (~150-300 KB), για μεγέθυνση και σύγκριση
//   thumb – 400px (~20-30 KB), για κάρτες, αρχείο και φόρμες

const FULL = { side: 1600, quality: 0.85 };
const THUMB = { side: 400, quality: 0.8 };

function load(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

function draw(img, { side, quality }) {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality)
  );
}

// Από ένα αρχείο του χρήστη: { full, thumb } (JPEG). Η φωτογραφία ανοίγει μία φορά.
export async function processImage(file) {
  const img = await load(file);
  return { full: await draw(img, FULL), thumb: await draw(img, THUMB) };
}

// Μικρή έκδοση από μια ήδη αποθηκευμένη φωτογραφία (για παλιές φωτογραφίες χωρίς μικρή).
export async function makeThumb(blob) {
  return draw(await load(blob), THUMB);
}

// Φωτογραφία προφίλ: τετράγωνη (κόβεται στο κέντρο), 400px, JPEG.
export async function processAvatar(file) {
  const img = await load(file);
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  canvas.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 400, 400);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85)
  );
}
