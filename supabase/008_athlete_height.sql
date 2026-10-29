-- FormLog – 008: ύψος αθλούμενου (σε εκατοστά)
-- Τρέξε το ΜΙΑ φορά, μετά το 007: Supabase → SQL Editor → New query → επικόλληση → Run.

alter table public.athletes
  add column height_cm integer check (height_cm between 80 and 250);

-- Το ύψος το αλλάζει όποιος έχει πρόσβαση στον φάκελο (όπως όνομα και ηλικία).
grant update (name, age, height_cm) on public.athletes to authenticated;
