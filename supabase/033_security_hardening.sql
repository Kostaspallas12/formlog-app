-- FormLog – 033: ενίσχυση ασφαλείας (μετά τον πλήρη έλεγχο της 29/10/2026)
-- Τρέξε το ΜΙΑ φορά, μετά το 032: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- 1. Ερωτήσεις check-in και πεδία/στόχοι Ημερολογίου: όταν ο αθλούμενος έχει προπονητή, τα αλλάζει
--    ΜΟΝΟ ο προπονητής (πριν τα άλλαζε και ο αθλούμενος, παρακάμπτοντας την εφαρμογή).
--    Κρατιούνται μόνο έγκυρες ερωτήσεις (έως 15).
-- 2. Απαντήσεις check-in: κρατιούνται μόνο έγκυρες τιμές (αριθμός 1–10, ναι/όχι, κείμενο έως 500)
--    — «σκουπίδια» δεν μπορούν πια να «ρίξουν» τη σελίδα του προπονητή.
-- 3. Προσκλήσεις: έως 15 προσπάθειες την ώρα ανά προπονητή — μετράνε και οι αποτυχημένες
--    (όχι μαζικός έλεγχος email τρίτων).
-- 4. Μηνύματα: έως 30 το λεπτό ανά αποστολέα, σε συνομιλίες και ομάδες (όχι spam).


-- ============================================================
-- 1. Ερωτήσεις και Ημερολόγιο: τα ορίζει ο προπονητής
-- ============================================================
create or replace function public.guard_athlete_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Αθλούμενος με προπονητή: ό,τι κι αν στείλει, οι ερωτήσεις και τα πεδία/στόχοι μένουν όπως τα έβαλε ο προπονητής.
  if new.coach_id is not null and new.coach_id <> new.owner and auth.uid() = new.owner then
    new.checkin_form := old.checkin_form;
    new.journal := old.journal;
  end if;
  -- Μόνο έγκυρες ερωτήσεις (ό,τι άλλο πετιέται), έως 15.
  if new.checkin_form is not null and new.checkin_form is distinct from old.checkin_form then
    new.checkin_form := coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e ->> 'id',
          'label', left(btrim(e ->> 'label'), 80),
          'kind', e ->> 'kind',
          'better', case when e ->> 'better' in ('up', 'down', 'yes', 'no') then e ->> 'better' end
        ) || case when jsonb_typeof(e -> 'short') = 'string' then jsonb_build_object('short', left(e ->> 'short', 30)) else '{}'::jsonb end
        order by i)
      from jsonb_array_elements(new.checkin_form) with ordinality as x(e, i)
      where i <= 15
        and jsonb_typeof(e) = 'object'
        and coalesce(e ->> 'id', '') ~ '^[A-Za-z0-9_-]{1,40}$'
        and jsonb_typeof(e -> 'label') = 'string' and btrim(e ->> 'label') <> ''
        and e ->> 'kind' in ('scale', 'yesno', 'text')
    ), '[]'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_athlete_settings() from public, anon, authenticated;

drop trigger if exists athletes_guard_settings on public.athletes;
create trigger athletes_guard_settings before update on public.athletes
  for each row execute function public.guard_athlete_settings();


-- ============================================================
-- 2. Απαντήσεις check-in: μόνο έγκυρες τιμές
-- ============================================================
create or replace function public.clean_checkin_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.answers is distinct from old.answers then
    new.answers := coalesce((
      select jsonb_object_agg(k, v)
      from jsonb_each(new.answers) as x(k, v)
      where k ~ '^[A-Za-z0-9_-]{1,40}$'
        and (
          (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10))
          or jsonb_typeof(v) = 'boolean'
          or (jsonb_typeof(v) = 'string' and char_length(v #>> '{}') between 1 and 500)
        )
    ), '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function public.clean_checkin_answers() from public, anon, authenticated;

drop trigger if exists checkins_clean_answers on public.checkins;
create trigger checkins_clean_answers before insert or update on public.checkins
  for each row execute function public.clean_checkin_answers();


-- ============================================================
-- 3. Προσκλήσεις: όριο προσπαθειών (μετράνε και οι αποτυχημένες)
-- ============================================================
-- Κάθε προσπάθεια καταγράφεται εδώ· κανείς δεν τον βλέπει από την εφαρμογή.
create table if not exists public.invite_attempts (
  coach_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists invite_attempts_coach_idx on public.invite_attempts (coach_id, created_at);
alter table public.invite_attempts enable row level security;
revoke all on public.invite_attempts from anon, authenticated;

-- Ίδια με το 029, με δύο αλλαγές:
--   - όριο 15 προσπαθειών την ώρα (too_many)
--   - οι λόγοι απόρριψης επιστρέφονται ως 'error:<λόγος>' (όχι exception), ώστε η προσπάθεια να μένει καταγεγραμμένη
create or replace function public.create_invite(p_athlete uuid, p_email text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  addr text := nullif(lower(trim(p_email)), '');
  target uuid;
  current_coach uuid;
begin
  if (select type from public.profiles where id = me) is distinct from 'coach' then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from public.athletes where id = p_athlete and owner = me and coach_id = me) then
    raise exception 'not_allowed';
  end if;

  -- Μία προσπάθεια τη φορά ανά προπονητή (για να μετράει σωστά και με ταυτόχρονα αιτήματα).
  perform pg_advisory_xact_lock(hashtext('invite:' || me::text));
  delete from public.invite_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.invite_attempts where coach_id = me and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'too_many';
  end if;
  insert into public.invite_attempts (coach_id) values (me);

  if addr is not null then
    select u.id into target from auth.users u where lower(u.email) = addr;
    if target is not null then
      if target = me then return 'error:own_email'; end if;
      if (select type from public.profiles where id = target) = 'coach' then return 'error:coach_account'; end if;
      select a.coach_id into current_coach from public.athletes a
        where a.owner = target and a.self and a.coach_id is not null and a.coach_id <> a.owner;
      if current_coach = me then return 'error:already_yours'; end if;
      if current_coach is not null then return 'error:already_coached'; end if;
    end if;
  end if;

  update public.invites set revoked_at = now()
    where athlete_id = p_athlete and used_at is null and revoked_at is null;
  insert into public.invites (token, athlete_id, coach_id, email)
    values (t, p_athlete, me, addr);
  return t;
end;
$$;
revoke execute on function public.create_invite(uuid, text) from public, anon;
grant execute on function public.create_invite(uuid, text) to authenticated;


-- ============================================================
-- 4. Μηνύματα: έως 30 το λεπτό ανά αποστολέα (συνομιλίες + ομάδες μαζί)
-- ============================================================
create index if not exists messages_sender_idx on public.messages (sender, created_at);
create index if not exists group_messages_sender_idx on public.group_messages (sender, created_at);

create or replace function public.limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Γραμμές κλήσεων (τις γράφει η βάση) και ό,τι δεν στέλνει ο ίδιος ο χρήστης: χωρίς όριο.
  if auth.uid() is null or new.sender is distinct from auth.uid() or coalesce(to_jsonb(new) ->> 'call', '') <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('msg:' || new.sender::text));
  if (select count(*) from public.messages where sender = new.sender and created_at > now() - interval '1 minute')
     + (select count(*) from public.group_messages where sender = new.sender and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Δεν μπορείς να στείλεις τόσα μηνύματα τόσο γρήγορα. Περίμενε λίγο και δοκίμασε ξανά.';
  end if;
  return new;
end;
$$;
revoke execute on function public.limit_message_rate() from public, anon, authenticated;

drop trigger if exists messages_rate on public.messages;
create trigger messages_rate before insert on public.messages
  for each row execute function public.limit_message_rate();
drop trigger if exists group_messages_rate on public.group_messages;
create trigger group_messages_rate before insert on public.group_messages
  for each row execute function public.limit_message_rate();
