-- FormLog – 004: ηλικία αθλούμενου
-- Τρέξε το ΜΙΑ φορά, μετά το 003: Supabase → SQL Editor → New query → επικόλληση → Run.

alter table public.athletes
  add column age integer check (age between 5 and 120);
