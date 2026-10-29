-- FormLog – 026: Ημερολόγιο (ύπνος + ποιότητα ύπνου) και πεδία/στόχοι ανά αθλούμενο
-- Τρέξε το ΜΙΑ φορά, μετά το 025: Supabase → SQL Editor → New query → επικόλληση → Run.

-- Ύπνος στην ημερήσια γραμμή: τι ώρα κοιμήθηκε, τι ώρα ξύπνησε, πώς κοιμήθηκε (1–5).
-- (Οι ώρες ύπνου υπολογίζονται από τις δύο ώρες, και όταν κοιμηθεί μετά τα μεσάνυχτα.)
alter table public.daily_logs
  add column sleep_start   time,
  add column sleep_end     time,
  add column sleep_quality smallint check (sleep_quality between 1 and 5);

-- Μια γραμμή χρειάζεται τουλάχιστον μία τιμή (τώρα μετράει και ο ύπνος).
alter table public.daily_logs drop constraint if exists daily_logs_check;
alter table public.daily_logs add constraint daily_logs_has_value check (
  calories is not null or nullif(trim(workout), '') is not null or steps is not null or water is not null
  or sleep_start is not null or sleep_end is not null or sleep_quality is not null
);

-- Ποια πεδία παρακολουθεί κάθε αθλούμενος και οι στόχοι του (τα ορίζει ο προπονητής).
-- π.χ. { "off": ["steps"], "targets": { "sleep": 8, "water": 3, "steps": 8000, "calories": 2400 } }
alter table public.athletes
  add column journal jsonb not null default '{}'::jsonb
  check (jsonb_typeof(journal) = 'object' and pg_column_size(journal) < 4000);
grant update (journal) on public.athletes to authenticated;
