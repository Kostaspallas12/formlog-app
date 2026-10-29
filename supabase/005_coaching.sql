-- FormLog – 005: σύνδεση προπονητή–αθλούμενου με πρόσκληση
-- Τρέξε το ΜΙΑ φορά, μετά το 004: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Μοντέλο φακέλου αθλούμενου (πίνακας athletes):
--   owner     σε ποιον ΑΝΗΚΟΥΝ τα δεδομένα
--   coach_id  ποιος προπονητής έχει πρόσβαση (ή κανείς)
--   self      ο «δικός μου» φάκελος ενός προσωπικού λογαριασμού
--
--   Προσωπικός χρήστης χωρίς προπονητή:      owner = χρήστης,     coach_id = null,       self = true
--   Αθλούμενος που έφτιαξε ο προπονητής      owner = προπονητής,  coach_id = προπονητής, self = false
--     (πριν αποδεχτεί πρόσκληση)
--   Συνδεδεμένος αθλούμενος:                 owner = αθλούμενος,  coach_id = προπονητής, self = true
--
-- Ποιος βλέπει έναν φάκελο: ο owner και ο coach_id. Αν ο αθλούμενος «διακόψει τη συνεργασία»,
-- το coach_id γίνεται null και ο φάκελος μένει μόνο σε εκείνον. Αν ο προπονητής σβήσει τον
-- λογαριασμό του, οι συνδεδεμένοι αθλούμενοι κρατούν τα δεδομένα τους.


-- ============================================================
-- 1. Νέες στήλες στους αθλούμενους
-- ============================================================
alter table public.athletes
  add column coach_id uuid references auth.users (id) on delete set null,
  add column client_consent_at timestamptz;   -- πότε συναίνεσε ο ίδιος ο αθλούμενος (με την πρόσκληση)

create index athletes_coach_idx on public.athletes (coach_id);

-- Οι αθλούμενοι που έχουν φτιάξει οι προπονητές μέχρι τώρα.
update public.athletes set coach_id = owner where not self;


-- ============================================================
-- 2. Ποιος έχει πρόσβαση σε έναν φάκελο (χρησιμοποιείται από όλους τους κανόνες)
-- ============================================================
create function public.can_access_athlete(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athletes a
    where a.id = aid and (select auth.uid()) in (a.owner, a.coach_id)
  );
$$;

revoke execute on function public.can_access_athlete(uuid) from public, anon;
grant execute on function public.can_access_athlete(uuid) to authenticated;


-- ============================================================
-- 3. Κανόνες ασφαλείας (RLS): κάτοχος ή προπονητής
-- ============================================================
drop policy "athletes: μόνο του κατόχου" on public.athletes;

create policy "athletes: βλέπουν κάτοχος και προπονητής"
  on public.athletes for select to authenticated
  using ((select auth.uid()) in (owner, coach_id));

create policy "athletes: αλλάζουν κάτοχος και προπονητής"
  on public.athletes for update to authenticated
  using ((select auth.uid()) in (owner, coach_id))
  with check ((select auth.uid()) in (owner, coach_id));

-- Νέος φάκελος: μόνο δικός μου (ο προπονητής φτιάχνει και ορίζει τον εαυτό του ως προπονητή).
create policy "athletes: νέος φάκελος μόνο για τον εαυτό μου"
  on public.athletes for insert to authenticated
  with check ((select auth.uid()) = owner and (coach_id is null or coach_id = (select auth.uid())));

-- Σβήνει μόνο ο κάτοχος (ο προπονητής δεν σβήνει φάκελο συνδεδεμένου αθλούμενου).
create policy "athletes: σβήνει μόνο ο κάτοχος"
  on public.athletes for delete to authenticated
  using ((select auth.uid()) = owner);

-- Οι αλλαγές κατόχου/προπονητή γίνονται ΜΟΝΟ μέσα από τις λειτουργίες της πρόσκλησης.
revoke update on public.athletes from authenticated;
grant update (name, age) on public.athletes to authenticated;

-- Καταγραφές, βάρος, καθημερινά: όποιος έχει πρόσβαση στον φάκελο.
-- Η στήλη owner εκεί σημαίνει «ποιος το ανέβασε»· αν σβηστεί εκείνος, η γραμμή μένει.
drop policy "checkins: μόνο του κατόχου" on public.checkins;
drop policy "weigh_ins: μόνο του κατόχου" on public.weigh_ins;
drop policy "daily_logs: μόνο του κατόχου" on public.daily_logs;

create policy "checkins: όσοι έχουν πρόσβαση στον φάκελο"
  on public.checkins for all to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id));

create policy "weigh_ins: όσοι έχουν πρόσβαση στον φάκελο"
  on public.weigh_ins for all to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id));

create policy "daily_logs: όσοι έχουν πρόσβαση στον φάκελο"
  on public.daily_logs for all to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id));

alter table public.checkins   alter column owner drop not null;
alter table public.weigh_ins  alter column owner drop not null;
alter table public.daily_logs alter column owner drop not null;
alter table public.checkins   drop constraint checkins_owner_fkey,
  add constraint checkins_owner_fkey foreign key (owner) references auth.users (id) on delete set null;
alter table public.weigh_ins  drop constraint weigh_ins_owner_fkey,
  add constraint weigh_ins_owner_fkey foreign key (owner) references auth.users (id) on delete set null;
alter table public.daily_logs drop constraint daily_logs_owner_fkey,
  add constraint daily_logs_owner_fkey foreign key (owner) references auth.users (id) on delete set null;


-- ============================================================
-- 4. Φωτογραφίες: φάκελος ανά αθλούμενο (<athlete id>/…)
--    Οι παλιές φωτογραφίες (<user id>/…) συνεχίζουν να δουλεύουν.
-- ============================================================
drop policy "photos: ο χρήστης βλέπει τις δικές του" on storage.objects;
drop policy "photos: ο χρήστης ανεβάζει στον φάκελό του" on storage.objects;
drop policy "photos: ο χρήστης σβήνει τις δικές του" on storage.objects;

create function public.can_access_photo_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- ο παλιός προσωπικός φάκελος του χρήστη
    folder = (select auth.uid())::text
    -- ο φάκελος ενός αθλούμενου στον οποίο έχω πρόσβαση
    or exists (
      select 1 from public.athletes a
      where a.id::text = folder and (select auth.uid()) in (a.owner, a.coach_id)
    );
$$;

-- Ο προπονητής βλέπει και τις παλιές φωτογραφίες ενός συνδεδεμένου αθλούμενου (από τον
-- προσωπικό του φάκελο, αν ο αθλούμενος έφερε το προηγούμενο αρχείο του).
create function public.can_read_photo_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_photo_folder(folder)
    or exists (
      select 1 from public.athletes a
      where a.coach_id = (select auth.uid()) and a.owner::text = folder
    );
$$;

revoke execute on function public.can_access_photo_folder(text) from public, anon;
revoke execute on function public.can_read_photo_folder(text) from public, anon;
grant execute on function public.can_access_photo_folder(text) to authenticated;
grant execute on function public.can_read_photo_folder(text) to authenticated;

create policy "photos: βλέπουν όσοι έχουν πρόσβαση"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_read_photo_folder((storage.foldername(name))[1]));

create policy "photos: ανεβάζουν όσοι έχουν πρόσβαση"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_access_photo_folder((storage.foldername(name))[1]));

create policy "photos: σβήνουν όσοι έχουν πρόσβαση"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_access_photo_folder((storage.foldername(name))[1]));


-- ============================================================
-- 5. Προσκλήσεις
-- ============================================================
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,                 -- 64 τυχαίοι χαρακτήρες, αδύνατο να μαντευτεί
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  coach_id    uuid not null references auth.users (id) on delete cascade,
  email       text,                                 -- προαιρετικό: μόνο αυτό το email μπορεί να την αποδεχτεί
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  used_email  text,
  revoked_at  timestamptz
);

create index invites_athlete_idx on public.invites (athlete_id);

alter table public.invites enable row level security;

-- Ο προπονητής βλέπει τις δικές του προσκλήσεις. Όλα τα υπόλοιπα γίνονται από τις λειτουργίες παρακάτω.
create policy "invites: ο προπονητής βλέπει τις δικές του"
  on public.invites for select to authenticated
  using ((select auth.uid()) = coach_id);

revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;

-- Νέα πρόσκληση για έναν (μη συνδεδεμένο) αθλούμενο. Ακυρώνει τις προηγούμενες.
create function public.create_invite(p_athlete uuid, p_email text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not exists (select 1 from public.athletes where id = p_athlete and owner = me and coach_id = me) then
    raise exception 'not_allowed';
  end if;
  update public.invites set revoked_at = now()
    where athlete_id = p_athlete and used_at is null and revoked_at is null;
  insert into public.invites (token, athlete_id, coach_id, email)
    values (t, p_athlete, me, nullif(lower(trim(p_email)), ''));
  return t;
end;
$$;

create function public.revoke_invite(p_athlete uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites set revoked_at = now()
    where athlete_id = p_athlete and coach_id = auth.uid() and used_at is null and revoked_at is null;
end;
$$;

-- Τι δείχνει η σελίδα της πρόσκλησης (και σε όποιον δεν έχει συνδεθεί ακόμα).
create function public.invite_info(p_token text)
returns table (status text, coach_name text, athlete_name text, email_locked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites where token = p_token;
  if not found then
    return query select 'invalid'::text, null::text, null::text, false;
    return;
  end if;
  return query
    select
      case
        when inv.revoked_at is not null then 'revoked'
        when inv.used_at is not null then 'used'
        when inv.expires_at < now() then 'expired'
        else 'valid'
      end,
      (select p.name from public.profiles p where p.id = inv.coach_id),
      (select a.name from public.athletes a where a.id = inv.athlete_id),
      inv.email is not null;
end;
$$;

-- Ο αθλούμενος αποδέχεται: ο φάκελος γίνεται δικός του και ο προπονητής κρατά πρόσβαση.
-- Αν είχε ήδη προσωπικό αρχείο, μεταφέρεται στον κοινό φάκελο.
create function public.accept_invite(p_token text)
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
  old_self uuid;
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
  select id into old_self from public.athletes where owner = me and self;
  if old_self is not null then
    delete from public.weigh_ins w where w.athlete_id = ath.id
      and exists (select 1 from public.weigh_ins x where x.athlete_id = old_self and x.date = w.date);
    update public.weigh_ins set athlete_id = ath.id where athlete_id = old_self;
    delete from public.daily_logs d where d.athlete_id = ath.id
      and exists (select 1 from public.daily_logs x where x.athlete_id = old_self and x.date = d.date);
    update public.daily_logs set athlete_id = ath.id where athlete_id = old_self;
    update public.checkins set athlete_id = ath.id where athlete_id = old_self;
    delete from public.athletes where id = old_self;
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

-- Διακοπή συνεργασίας (από τον αθλούμενο ή τον προπονητή): ο φάκελος μένει στον αθλούμενο.
create function public.disconnect_coach(p_athlete uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  update public.athletes
    set coach_id = null
    where id = p_athlete and coach_id is not null and owner <> coach_id and me in (owner, coach_id);
  if not found then raise exception 'not_allowed'; end if;
end;
$$;

-- Ο προπονητής του συνδεδεμένου χρήστη (για να βλέπει ο αθλούμενος με ποιον συνεργάζεται).
create function public.get_my_coach()
returns table (athlete_id uuid, coach_name text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, p.name, a.client_consent_at
  from public.athletes a
  join public.profiles p on p.id = a.coach_id
  where a.owner = (select auth.uid()) and a.self and a.coach_id is not null;
$$;

revoke execute on function public.create_invite(uuid, text) from public, anon;
revoke execute on function public.revoke_invite(uuid) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.disconnect_coach(uuid) from public, anon;
revoke execute on function public.get_my_coach() from public, anon;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.disconnect_coach(uuid) to authenticated;
grant execute on function public.get_my_coach() to authenticated;
-- Η σελίδα πρόσκλησης ανοίγει και πριν τη σύνδεση.
revoke execute on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;


-- ============================================================
-- 6. Διαγραφή λογαριασμού: ο προπονητής δεν παίρνει μαζί του τα δεδομένα των αθλούμενων
-- ============================================================
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Συνδεδεμένοι αθλούμενοι: κρατούν τον φάκελό τους, απλώς χωρίς προπονητή.
  update public.athletes set coach_id = null where coach_id = auth.uid() and owner <> auth.uid();
  -- Σβήνει τον χρήστη· οι δικοί του φάκελοι (και οι μη συνδεδεμένοι αθλούμενοι) σβήνονται μαζί.
  delete from auth.users where id = auth.uid();
end;
$$;
