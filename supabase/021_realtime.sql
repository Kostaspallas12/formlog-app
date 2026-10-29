-- FormLog – 021: ζωντανή ενημέρωση (realtime) χωρίς refresh
-- Τρέξε το ΜΙΑ φορά, μετά το 020: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Με το realtime, οι αλλαγές φαίνονται αμέσως:
--   invites        → αποδοχή/απόρριψη/νέα πρόσκληση (ο προπονητής το βλέπει ζωντανά)
--   athletes       → σύνδεση/διακοπή προπονητή, νέος αθλούμενος, όνομα, φωτογραφία
--   athlete_plans  → όταν ο προπονητής αλλάζει πρόγραμμα, ο αθλούμενος το βλέπει αμέσως
-- Ο κανόνας ασφαλείας μένει ίδιος: ο καθένας λαμβάνει μόνο αλλαγές που έχει δικαίωμα να δει.

alter publication supabase_realtime add table public.invites;
alter publication supabase_realtime add table public.athletes;
alter publication supabase_realtime add table public.athlete_plans;
