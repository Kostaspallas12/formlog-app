-- FormLog – 017: φωτογραφία προφίλ (avatar)
-- Τρέξε το ΜΙΑ φορά, μετά το 016: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Η φωτογραφία προφίλ αποθηκεύεται στον ίδιο ιδιωτικό χώρο "photos", στον φάκελο του
-- αθλούμενου (ή του χρήστη), οπότε δεν χρειάζονται νέοι κανόνες ασφαλείας· προσθέτουμε
-- μόνο τη διαδρομή της σε μια στήλη.
--   athletes.avatar : η φωτογραφία ενός αθλούμενου (τη βάζει ο προπονητής ή ο ίδιος)
--   profiles.avatar : η δική μου φωτογραφία (για τη ράγα και τον λογαριασμό)

alter table public.profiles add column avatar text;
alter table public.athletes add column avatar text;

-- Οι στήλες avatar γράφονται από τους ίδιους που ήδη αλλάζουν τη γραμμή
-- (profiles: ο χρήστης το δικό του · athletes: κάτοχος ή προπονητής).
grant update (avatar) on public.profiles to authenticated;
grant update (avatar) on public.athletes to authenticated;
