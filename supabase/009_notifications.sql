-- FormLog – 009: ειδοποιήσεις προπονητή για νέα check-in
-- Τρέξε το ΜΙΑ φορά, μετά το 008: Supabase → SQL Editor → New query → επικόλληση → Run.

-- Ρύθμιση του προπονητή: θέλει ειδοποιήσεις για νέα check-in; (αλλάζει από τον λογαριασμό του)
alter table public.profiles
  add column notify_checkins boolean not null default true;
grant update (name, notify_checkins) on public.profiles to authenticated;

-- Οι ειδοποιήσεις (μία για κάθε νέο check-in που ανέβασε ο ίδιος ο αθλούμενος).
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,      -- ποιος τη λαμβάνει (ο προπονητής)
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  checkin_id  uuid references public.checkins (id) on delete cascade,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications: ο παραλήπτης τις βλέπει"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "notifications: ο παραλήπτης τις διαβάζει"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "notifications: ο παραλήπτης τις σβήνει"
  on public.notifications for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Από το site: μόνο ανάγνωση, «διαβάστηκε» και διαγραφή. Τις φτιάχνει μόνο η βάση.
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Νέο check-in → ειδοποίηση στον προπονητή, αν το ανέβασε ο αθλούμενος (όχι ο ίδιος ο προπονητής)
-- και αν ο προπονητής δεν έχει κλείσει τις ειδοποιήσεις.
create function public.notify_coach_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coach uuid;
begin
  select a.coach_id into coach from public.athletes a where a.id = new.athlete_id;
  if coach is not null and coach <> new.owner
     and coalesce((select p.notify_checkins from public.profiles p where p.id = coach), true) then
    insert into public.notifications (user_id, athlete_id, checkin_id) values (coach, new.athlete_id, new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_coach_checkin() from public, anon, authenticated;

create trigger checkins_notify_coach
  after insert on public.checkins
  for each row execute function public.notify_coach_checkin();

-- Ζωντανή ενημέρωση στο site (χωρίς ανανέωση σελίδας).
alter publication supabase_realtime add table public.notifications;
