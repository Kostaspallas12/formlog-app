-- FormLog – 011: διορθώσεις ασφαλείας (από τον έλεγχο ασφαλείας)
-- Τρέξε το ΜΙΑ φορά, μετά το 010: Supabase → SQL Editor → New query → επικόλληση → Run.

-- ------------------------------------------------------------
-- 1. Νέος φάκελος αθλούμενου: από το site μπαίνουν ΜΟΝΟ αυτές οι στήλες.
--    (Πριν, κάποιος μπορούσε να δηλώσει μόνος του merged_ids = φάκελοι άλλων και να
--    αποκτήσει πρόσβαση στις φωτογραφίες τους. Τα merged_ids τα γράφει μόνο η αποδοχή πρόσκλησης.)
-- ------------------------------------------------------------
revoke insert on public.athletes from authenticated;
grant insert (name, self, coach_id, consent_confirmed_at, age, height_cm) on public.athletes to authenticated;

-- ------------------------------------------------------------
-- 2. Ποιος ανέβασε μια καταγραφή / βάρος / καθημερινά: πάντα ο συνδεδεμένος χρήστης.
--    (Πριν, κάποιος μπορούσε να γράψει owner = άλλος χρήστης.)
-- ------------------------------------------------------------
create function public.force_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.owner := coalesce(auth.uid(), new.owner);
  else
    new.owner := old.owner;   -- ο «αποστολέας» δεν αλλάζει ποτέ
  end if;
  return new;
end;
$$;

create trigger checkins_force_owner before insert or update on public.checkins
  for each row execute function public.force_owner();
create trigger weigh_ins_force_owner before insert or update on public.weigh_ins
  for each row execute function public.force_owner();
create trigger daily_logs_force_owner before insert or update on public.daily_logs
  for each row execute function public.force_owner();

-- ------------------------------------------------------------
-- 3. Φωτογραφία μέσα από καταγραφή: ακριβής διαδρομή (όχι LIKE) και μόνο αν η φωτογραφία
--    βρίσκεται στον παλιό φάκελο αυτού που ανέβασε την καταγραφή.
--    (Πριν, κάποιος μπορούσε να φτιάξει δική του καταγραφή που «δείχνει» σε ξένη φωτογραφία.)
-- ------------------------------------------------------------
create or replace function public.can_read_photo(obj_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.checkins c
    join public.athletes a on a.id = c.athlete_id
    where (select auth.uid()) in (a.owner, a.coach_id)
      and c.owner is not null
      and split_part(obj_name, '/', 1) = c.owner::text
      and exists (
        select 1 from jsonb_each_text(c.photos) p
        where p.value = replace(obj_name, '.thumb.jpg', '.jpg')
      )
  );
$$;

-- ------------------------------------------------------------
-- 4. Προσκλήσεις βγάζουν μόνο λογαριασμοί προπονητή.
-- ------------------------------------------------------------
create or replace function public.create_invite(p_athlete uuid, p_email text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if (select type from public.profiles where id = me) is distinct from 'coach' then
    raise exception 'not_allowed';
  end if;
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
