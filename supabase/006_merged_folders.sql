-- FormLog – 006: φωτογραφίες αρχείων που ενώθηκαν
-- Τρέξε το ΜΙΑ φορά, μετά το 005: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Όταν ένας αθλούμενος με υπάρχον προσωπικό αρχείο αποδέχεται πρόσκληση, το αρχείο του
-- ενώνεται με τον φάκελο του προπονητή. Οι φωτογραφίες του όμως μένουν στον παλιό φάκελο
-- (<παλιό athlete id>/…). Εδώ ο κοινός φάκελος θυμάται τους παλιούς φακέλους, ώστε όποιος
-- έχει πρόσβαση στον κοινό να βλέπει και αυτές τις φωτογραφίες.

alter table public.athletes
  add column merged_ids uuid[] not null default '{}';

create or replace function public.can_access_photo_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    folder = (select auth.uid())::text
    or exists (
      select 1 from public.athletes a
      where (select auth.uid()) in (a.owner, a.coach_id)
        and (a.id::text = folder or folder = any (a.merged_ids::text[]))
    );
$$;

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
