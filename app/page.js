import Image from 'next/image';
import Link from 'next/link';
import HomeRedirect from '@/components/HomeRedirect';

// Η αρχική σελίδα: δείχνει την ίδια την εφαρμογή (πραγματικά στιγμιότυπα), με λίγο κείμενο.
// Τα στιγμιότυπα είναι στο public/landing/app-*.jpg (2880×1800, το κινητό 780×1688).

const FEATURES = [
  {
    id: 'checkin',
    label: 'Check-in',
    title: 'Κάθε check-in, έτοιμο για έλεγχο',
    text: 'Φωτογραφίες, βάρος και ερωτηματολόγιο σε μία οθόνη. Δίπλα στην προηγούμενη τιμή, ένα βελάκι δείχνει αμέσως τι βελτιώθηκε και τι όχι.',
    points: [
      'Σύγκριση με όποιο check-in θέλεις, ακόμα και το πρώτο',
      'Η απάντησή σου πηγαίνει κατευθείαν στη συνομιλία',
      '«Προς έλεγχο» και «Ελέγχθηκε», για να μη σου ξεφεύγει κανείς',
    ],
    img: '/landing/app-compare.jpg',
    alt: 'Έλεγχος check-in: φωτογραφίες δίπλα στο πρώτο check-in και ερωτηματολόγιο με βελάκια βελτίωσης',
  },
  {
    id: 'chat',
    label: 'Επικοινωνία',
    title: 'Μίλα μαζί τους χωρίς άλλη εφαρμογή',
    text: 'Μηνύματα, φωτογραφίες, φωνητικά, κλήσεις και βιντεοκλήσεις με κοινή χρήση οθόνης, μέσα στο FormLog.',
    points: ['Βιντεοκλήση με ένα κλικ, και από το κινητό', 'Ομάδες με κοινή συνομιλία', 'Ειδοποίηση τη στιγμή που έρχεται κάτι νέο'],
    img: '/landing/app-chat.jpg',
    alt: 'Συνομιλία προπονητή και αθλούμενου μέσα στην εφαρμογή',
  },
  {
    id: 'overview',
    label: 'Επισκόπηση',
    title: 'Ξέρεις ποιος σε χρειάζεται σήμερα',
    text: 'Check-in προς έλεγχο, νέα μηνύματα και αθλούμενοι χωρίς καταγραφή για πάνω από 7 ημέρες, σε μία ματιά.',
    points: [],
    img: '/landing/app-overview.jpg',
    alt: 'Η επισκόπηση του προπονητή με τα check-in προς έλεγχο',
  },
];

const MORE = [
  ['Πρόγραμμα προπόνησης και διατροφής', 'Γράψε το ή ανέβασε έτοιμο αρχείο. Ο αθλούμενος το βλέπει και το κατεβάζει σε PDF.'],
  ['Βάρος με γράφημα', 'Κάθε ζύγισμα σε πίνακα και γράφημα, με τη μεταβολή από την αρχή.'],
  ['Ημερολόγιο', 'Ύπνος, νερό, θερμίδες και βήματα κάθε μέρας, με στόχους που ορίζεις εσύ.'],
  ['Δικές σου ερωτήσεις', 'Το ερωτηματολόγιο του check-in το φτιάχνεις εσύ: κλίμακα 1–10, Ναι/Όχι ή κείμενο.'],
  ['Ιδιωτικές φωτογραφίες', 'Τις βλέπετε μόνο εσύ και ο αθλούμενος. Δεν δημοσιεύονται και δεν πουλιούνται.'],
  ['Λήψη όλων των δεδομένων', 'Φωτογραφίες και καταγραφές σε ένα αρχείο, όποτε τα θέλεις.'],
];

const FAQ = [
  ['Ποιος βλέπει τις φωτογραφίες;', 'Μόνο ο αθλούμενος και ο προπονητής του, και μόνο όσο συνεργάζονται.'],
  ['Χρειάζεται εγκατάσταση;', 'Όχι. Ανοίγει στον browser, στον υπολογιστή και στο κινητό.'],
  ['Μπορώ να σβήσω τα δεδομένα μου;', 'Ναι. Μία καταγραφή ή ολόκληρο τον λογαριασμό, οριστικά, όποτε θέλεις.'],
];

const Points = ({ items }) => (
  <ul className="lp-points">
    {items.map((t) => <li key={t}><span className="ms" aria-hidden="true">check</span>{t}</li>)}
  </ul>
);

export default function Home() {
  return (
    <>
      <HomeRedirect />
      <main className="lp">
        <section className="lp-hero">
          <p className="lp-eyebrow">Για online προπονητές</p>
          <h1>Οι αθλούμενοί σου, τα check-in τους και οι συνομιλίες σας. Σε ένα μέρος.</h1>
          <p className="lp-lede">
            Check-in με φωτογραφίες και ερωτηματολόγιο, έλεγχος με σύγκριση από την πρώτη μέρα, συνομιλία και
            βιντεοκλήσεις. Στον υπολογιστή και στο κινητό.
          </p>
          <div className="lp-cta">
            <Link href="/signup?type=coach" className="btn primary big">Δοκίμασέ το δωρεάν</Link>
            <a href="#features" className="btn big">Δες πώς δουλεύει</a>
          </div>
          <div className="lp-shot lp-hero-shot">
            <Image
              src="/landing/app-table.jpg" width={2880} height={1800} priority sizes="(max-width: 1200px) 100vw, 1160px"
              alt="Η Πρόοδος ενός αθλούμενου: πίνακας με τα check-in, φωτογραφίες, βάρος, ενέργεια, ύπνο και κατάσταση ελέγχου"
            />
          </div>
        </section>

        <section id="features" className="lp-features">
          {FEATURES.map((f, i) => (
            <div className={`lp-row${i % 2 ? ' flip' : ''}`} key={f.id}>
              <div className="lp-text">
                <p className="lp-label">{f.label}</p>
                <h2>{f.title}</h2>
                <p>{f.text}</p>
                {f.points.length > 0 && <Points items={f.points} />}
              </div>
              <div className="lp-shot">
                <Image src={f.img} width={2880} height={1800} sizes="(max-width: 900px) 100vw, 640px" alt={f.alt} />
              </div>
            </div>
          ))}
        </section>

        <section className="lp-more">
          <div className="lp-wrap">
            <h2>Και όλα όσα χρειάζεσαι ακόμα</h2>
            <div className="lp-more-grid">
              {MORE.map(([title, text]) => (
                <div key={title}><h3>{title}</h3><p>{text}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section id="athletes" className="lp-wrap lp-row lp-athletes">
          <div className="lp-shot lp-phone">
            <Image src="/landing/app-mobile.jpg" width={780} height={1688} sizes="320px" alt="Η εφαρμογή στο κινητό του αθλούμενου" />
          </div>
          <div className="lp-text">
            <p className="lp-label">Για αθλούμενους</p>
            <h2>Ένα λεπτό από το κινητό</h2>
            <p>
              Τρεις φωτογραφίες, το βάρος και λίγες ερωτήσεις, και το check-in φτάνει στον προπονητή. Ο αθλούμενος
              βλέπει την πρόοδό του, το πρόγραμμα και τις απαντήσεις σου.
            </p>
            <p className="lp-note">
              Χωρίς προπονητή; Το FormLog δουλεύει και για προσωπική χρήση. <Link href="/signup?type=personal">Ξεκίνα</Link>
            </p>
          </div>
        </section>

        <section id="pricing" className="lp-wrap lp-pricing">
          <h2>Τιμές</h2>
          <div className="lp-plan">
            <p className="lp-price"><b>0 €</b><span>όσο είμαστε σε beta</span></p>
            <Points items={['Απεριόριστοι αθλούμενοι', 'Check-in, συνομιλία και βιντεοκλήσεις', 'Πρόγραμμα, Ημερολόγιο και Βάρος']} />
            <Link href="/signup?type=coach" className="btn primary big">Δοκίμασέ το δωρεάν</Link>
          </div>
        </section>

        <section id="faq" className="lp-wrap lp-faq">
          <h2>Συχνές ερωτήσεις</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
