-- FormLog – 027: καταγραφή προπόνησης (σετ, κιλά, επαναλήψεις, RIR) πάνω στο πρόγραμμα
-- Τρέξε το ΜΙΑ φορά, μετά το 026: Supabase → SQL Editor → New query → επικόλληση → Run.

-- Μία προπόνηση = μία μέρα του προγράμματος σε μία ημερομηνία.
-- exercises: [{ "key": "leg extension", "name": "Leg extension", "sets": [{ "kg": 72.5, "reps": 13, "rir": 1, "done": true }] }]
create table public.workout_logs (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes (id) on delete cascade,
  owner        uuid default auth.uid() references auth.users (id) on delete set null,   -- ποιος την κατέγραψε
  date         date not null,
  day_key      text not null check (char_length(day_key) between 1 and 80),             -- η μέρα του προγράμματος
  day_name     text not null default '' check (char_length(day_name) <= 100),
  exercises    jsonb not null default '[]'::jsonb
               check (jsonb_typeof(exercises) = 'array' and pg_column_size(exercises) < 60000),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  updated_at   timestamptz not null default now(),
  unique (athlete_id, date, day_key)
);
create index workout_logs_athlete_idx on public.workout_logs (athlete_id, date desc);

alter table public.workout_logs enable row level security;
-- Ίδιος κανόνας με βάρος/ημερολόγιο: ο αθλούμενος και ο προπονητής του.
create policy "workout_logs: όσοι έχουν πρόσβαση στον φάκελο"
  on public.workout_logs for all to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id));
revoke all on public.workout_logs from anon;

-- Ο «καταγραφέας» δεν πλαστογραφείται · updated_at μόνο του.
create trigger workout_logs_force_owner before insert or update on public.workout_logs
  for each row execute function public.force_owner();
create function public.touch_workout_log()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger workout_logs_touch before update on public.workout_logs
  for each row execute function public.touch_workout_log();

-- Ζωντανά: ο προπονητής βλέπει την προπόνηση όσο γίνεται (και ο αθλούμενος στις άλλες συσκευές του).
create trigger workout_logs_live after insert or update or delete on public.workout_logs
  for each row execute function public.live_athlete_data('plan');

-- Αλλαγή προπονητή: ο παλιός φάκελος ενώνεται στον νέο — οι προπονήσεις πάνε μαζί (αλλιώς θα σβήνονταν).
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  inv public.invites;
  ath public.athletes;
  old public.athletes;
begin
  if me is null then raise exception 'not_authenticated'; end if;

  select * into inv from public.invites where token = p_token for update;
  if not found then raise exception 'invalid'; end if;
  if inv.revoked_at is not null then raise exception 'revoked'; end if;
  if inv.used_at is not null then raise exception 'used'; end if;
  if inv.expires_at < now() then raise exception 'expired'; end if;
  if inv.coach_id = me then raise exception 'own_invite'; end if;

  select email into my_email from auth.users where id = me;
  if inv.email is not null and lower(inv.email) <> lower(my_email) then raise exception 'email_mismatch'; end if;
  if (select type from public.profiles where id = me) is distinct from 'personal' then raise exception 'not_personal'; end if;
  if exists (select 1 from public.athletes where owner = me and self and coach_id is not null) then
    raise exception 'already_coached';
  end if;

  select * into ath from public.athletes where id = inv.athlete_id for update;
  if not found or ath.owner <> inv.coach_id or ath.coach_id is distinct from inv.coach_id then
    raise exception 'invalid';
  end if;

  -- Το προηγούμενο προσωπικό αρχείο (αν υπάρχει) μπαίνει στον κοινό φάκελο.
  -- Αν την ίδια μέρα υπάρχει βάρος/καθημερινά και στα δύο, κρατάμε του αθλούμενου.
  select * into old from public.athletes where owner = me and self;
  if found then
    delete from public.weigh_ins w where w.athlete_id = ath.id
      and exists (select 1 from public.weigh_ins x where x.athlete_id = old.id and x.date = w.date);
    update public.weigh_ins set athlete_id = ath.id where athlete_id = old.id;
    delete from public.daily_logs d where d.athlete_id = ath.id
      and exists (select 1 from public.daily_logs x where x.athlete_id = old.id and x.date = d.date);
    update public.daily_logs set athlete_id = ath.id where athlete_id = old.id;
    update public.checkins set athlete_id = ath.id where athlete_id = old.id;
    -- οι προπονήσεις του (ιστορικό κιλών/επαναλήψεων) μένουν δικές του
    delete from public.workout_logs w where w.athlete_id = ath.id
      and exists (select 1 from public.workout_logs x where x.athlete_id = old.id and x.date = w.date and x.day_key = w.day_key);
    update public.workout_logs set athlete_id = ath.id where athlete_id = old.id;
    -- ο κοινός φάκελος θυμάται τον φάκελο φωτογραφιών του παλιού αρχείου
    update public.athletes set merged_ids = merged_ids || old.id || old.merged_ids where id = ath.id;
    delete from public.athletes where id = old.id;
  end if;

  update public.athletes
    set owner = me, self = true, client_consent_at = now()
    where id = ath.id;
  update public.invites
    set used_at = now(), used_by = me, used_email = my_email
    where id = inv.id;

  return ath.id;
end;
$$;
