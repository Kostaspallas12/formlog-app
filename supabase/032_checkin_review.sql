-- FormLog – 032: ερωτηματολόγιο check-in και «Ελέγχθηκε» από τον προπονητή
-- Τρέξε το ΜΙΑ φορά, μετά το 031: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- - athletes.checkin_form: οι ερωτήσεις του check-in (τις ορίζει ο προπονητής· χωρίς προπονητή, ο ίδιος).
--   Κενό = οι προεπιλεγμένες ερωτήσεις της εφαρμογής.
-- - checkins.answers: οι απαντήσεις ({ id ερώτησης: τιμή }).
-- - checkins.reviewed_at: πότε το έλεγξε ο προπονητής. Το αλλάζει ΜΟΝΟ ο προπονητής του φακέλου.

alter table public.athletes
  add column checkin_form jsonb
  check (checkin_form is null or (jsonb_typeof(checkin_form) = 'array' and pg_column_size(checkin_form) < 8000));
grant update (checkin_form) on public.athletes to authenticated;

alter table public.checkins
  add column answers jsonb not null default '{}'::jsonb
  check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 8000);
alter table public.checkins add column reviewed_at timestamptz;

-- Όσα υπάρχουν ήδη: θεωρούνται ελεγμένα (να μη βγουν ξαφνικά όλα «προς έλεγχο»).
update public.checkins set reviewed_at = created_at where reviewed_at is null;

create or replace function public.guard_checkin_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_coach boolean := exists (
    select 1 from public.athletes a
    where a.id = new.athlete_id and a.coach_id = auth.uid() and a.owner <> auth.uid()
  );
  before_val timestamptz := case when tg_op = 'INSERT' then null else old.reviewed_at end;
begin
  -- Καταγραφή που ανεβάζει ο ίδιος ο προπονητής: ήδη ελεγμένη.
  if tg_op = 'INSERT' then
    new.reviewed_at := case when is_coach then now() else null end;
    return new;
  end if;
  -- «Ελέγχθηκε»: μόνο ο προπονητής του φακέλου.
  if new.reviewed_at is distinct from before_val and not is_coach then
    new.reviewed_at := before_val;
  end if;
  -- Ο αθλούμενος άλλαξε φωτογραφίες ή απαντήσεις: ξανά «προς έλεγχο».
  if not is_coach and (new.answers is distinct from old.answers or new.photos is distinct from old.photos) then
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_checkin_review() from public, anon, authenticated;

create trigger checkins_guard_review before insert or update on public.checkins
  for each row execute function public.guard_checkin_review();
