// Από πού επιτρέπεται να φορτώνει/συνδέεται η σελίδα (Content-Security-Policy): μόνο από το ίδιο το site,
// τη βάση (Supabase) και τις γραμματοσειρές. Αν ποτέ ξέφευγε κακόβουλος κώδικας, δεν θα μπορούσε να φορτώσει
// ξένα scripts ούτε να στείλει δεδομένα σε ξένο server.
const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co').replace(/\/+$/, '');
const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  // (το Next.js χρειάζεται inline scripts· σε ανάπτυξη και eval)
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' blob: data:", // φωτογραφίες (blob), μοτίβα φόντου (data)
  "media-src 'self' blob:", // φωνητικά μηνύματα
  `connect-src 'self' ${supabase} ${supabase.replace(/^https:/, 'wss:')}`,
  "worker-src 'self' blob:", // οι ζωντανές ενημερώσεις τρέχουν σε worker
  "frame-src 'self' blob:", // προβολή PDF προγράμματος
  "object-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Security headers σε όλες τις σελίδες.
const securityHeaders = [
  // Κανένα άλλο site δεν μπορεί να «φορτώσει» το FormLog μέσα του (clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: csp },
  // Ο browser δεν «μαντεύει» τύπο αρχείου.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Σε εξωτερικά links δεν φεύγει η πλήρης διεύθυνση (π.χ. ο σύνδεσμος πρόσκλησης), μόνο το site.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Χωρίς μικρόφωνο / τοποθεσία· κάμερα μόνο για το ίδιο το site.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // ο server δεν ανακοινώνει τι τεχνολογία τρέχει
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
