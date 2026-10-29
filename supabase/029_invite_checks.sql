-- FormLog – 029: έλεγχος του email πριν σταλεί πρόσκληση
-- Τρέξε το ΜΙΑ φορά, μετά το 028: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Πριν: ο προπονητής έβλεπε «Η πρόσκληση στάλθηκε» ακόμα κι όταν ο αθλούμενος είχε ήδη άλλον
-- προπονητή — και εκείνος δεν μπορούσε να την αποδεχτεί. Τώρα η πρόσκληση δεν στέλνεται και ο
-- προπονητής μαθαίνει αμέσως τον λόγο (μόνο αυτόν: όχι ποιος είναι ο άλλος προπονητής).
--   already_coached  → ο αθλούμενος συνεργάζεται ήδη με άλλον προπονητή
--   already_yours    → είναι ήδη δικός του αθλούμενος
--   coach_account    → το email ανήκει σε λογαριασμό προπονητή
--   own_email        → είναι το δικό του email

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

  if addr is not null then
    select u.id into target from auth.users u where lower(u.email) = addr;
    if target is not null then
      if target = me then raise exception 'own_email'; end if;
      if (select type from public.profiles where id = target) = 'coach' then raise exception 'coach_account'; end if;
      select a.coach_id into current_coach from public.athletes a
        where a.owner = target and a.self and a.coach_id is not null and a.coach_id <> a.owner;
      if current_coach = me then raise exception 'already_yours'; end if;
      if current_coach is not null then raise exception 'already_coached'; end if;
    end if;
  end if;

  update public.invites set revoked_at = now()
    where athlete_id = p_athlete and used_at is null and revoked_at is null;
  insert into public.invites (token, athlete_id, coach_id, email)
    values (t, p_athlete, me, addr);
  return t;
end;
$$;
