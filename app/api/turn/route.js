// Στοιχεία σύνδεσης για τις κλήσεις (WebRTC).
// Οι περισσότερες κλήσεις συνδέονται απευθείας (STUN). Σε δίκτυα που το μπλοκάρουν, η κλήση περνά από
// αναμεταδότη (TURN). Τα κλειδιά μένουν στον server (Vercel), ένα από τα δύο:
//   Metered (δωρεάν, χωρίς κάρτα, 20 GB/μήνα):           METERED_TURN_USERNAME, METERED_TURN_CREDENTIAL
//                                                          ή METERED_TURN_APP (π.χ. formlog), METERED_TURN_API_KEY
//   Cloudflare (δωρεάν 1.000 GB/μήνα, θέλει κάρτα):       CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
// Χωρίς αυτά, η κλήση δουλεύει μόνο με απευθείας σύνδεση.

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

export const dynamic = 'force-dynamic';

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Μόνο για συνδεδεμένους χρήστες: ελέγχουμε το token της συνεδρίας στο Supabase.
async function signedIn(auth) {
  if (!auth.startsWith('Bearer ')) return false;
  const res = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: KEY, Authorization: auth }, cache: 'no-store' }).catch(() => null);
  return !!res?.ok;
}

// …και μόνο σε όποιον έχει κλήση αυτή τη στιγμή (κουδουνίζει ή σε εξέλιξη, των τελευταίων ωρών):
// αλλιώς οποιοσδήποτε λογαριασμός θα έπαιρνε τα στοιχεία του αναμεταδότη και θα «έκαιγε» το όριό του.
// (Οι κανόνες της βάσης επιστρέφουν μόνο κλήσεις όπου ο χρήστης καλεί ή καλείται.)
async function inCall(auth) {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`${SUPA}/rest/v1/calls?select=id&status=in.(ringing,accepted)&created_at=gte.${encodeURIComponent(since)}&limit=1`, {
    headers: { apikey: KEY, Authorization: auth }, cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return false;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (!(await signedIn(auth))) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await inCall(auth))) return Response.json({ error: 'no_call' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  let iceServers = STUN;
  if (keyId && token) {
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 6 * 60 * 60 }), // ισχύει 6 ώρες (αρκεί για μια κλήση)
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        const list = [].concat(data.iceServers || []);
        // Η θύρα 53 μπλοκάρεται από τους browsers· την παραλείπουμε.
        const clean = list
          .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }))
          .filter((s) => s.urls.length);
        if (clean.length) iceServers = clean;
      }
    } catch {}
  }

  // Metered με σταθερά στοιχεία (Credentials → username/password).
  const user = process.env.METERED_TURN_USERNAME;
  const pass = process.env.METERED_TURN_CREDENTIAL;
  if (iceServers === STUN && user && pass) {
    iceServers = [
      { urls: ['stun:stun.relay.metered.ca:80', ...STUN[0].urls] },
      {
        urls: [
          'turn:standard.relay.metered.ca:80',
          'turn:standard.relay.metered.ca:80?transport=tcp',
          'turn:standard.relay.metered.ca:443',
          'turns:standard.relay.metered.ca:443?transport=tcp',
        ],
        username: user,
        credential: pass,
      },
    ];
  }

  const app = process.env.METERED_TURN_APP;
  const apiKey = process.env.METERED_TURN_API_KEY;
  if (iceServers === STUN && app && apiKey) {
    try {
      const res = await fetch(`https://${encodeURIComponent(app)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`, { cache: 'no-store' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) iceServers = [...STUN, ...list];
      }
    } catch {}
  }
  return Response.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
