-- FormLog – 019: προσκλήσεις μέσα στην εφαρμογή (σαν «αίτημα φιλίας»)
-- Τρέξε το ΜΙΑ φορά, μετά το 018: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Ο προπονητής δημιουργεί αθλούμενο και βάζει το email του. Αν υπάρχει λογαριασμός με αυτό
-- το email, ο χρήστης βλέπει την πρόσκληση ΜΕΣΑ στην εφαρμογή και πατάει Αποδοχή/Απόρριψη —
-- χωρίς να χρειάζεται το link. Το link παραμένει ως εφεδρεία (για νέους χρήστες).

-- Οι ενεργές προσκλήσεις που αφορούν το email μου.
create function public.my_invites()
returns table (token text, coach_id uuid, coach_name text, athlete_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.token,
    i.coach_id,
    (select p.name from public.profiles p where p.id = i.coach_id),
    (select a.name from public.athletes a where a.id = i.athlete_id),
    i.created_at
  from public.invites i
  where i.email is not null
    and i.email = lower((select u.email from auth.users u where u.id = (select auth.uid())))
    and i.used_at is null
    and i.revoked_at is null
    and i.expires_at > now()
    and i.coach_id <> (select auth.uid())
  order by i.created_at desc;
$$;

revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

-- Απόρριψη πρόσκλησης από τον χρήστη που αφορά (το email του ταιριάζει).
create function public.decline_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me_email text;
begin
  select lower(u.email) into me_email from auth.users u where u.id = auth.uid();
  update public.invites
    set revoked_at = now()
    where token = p_token
      and used_at is null and revoked_at is null
      and email is not null and email = me_email;
end;
$$;

revoke execute on function public.decline_invite(text) from public, anon;
grant execute on function public.decline_invite(text) to authenticated;
