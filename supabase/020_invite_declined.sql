-- FormLog – 020: ο προπονητής βλέπει όταν ο χρήστης απορρίπτει την πρόσκληση
-- Τρέξε το ΜΙΑ φορά, μετά το 019: Supabase → SQL Editor → New query → επικόλληση → Run.

alter table public.invites add column declined_at timestamptz;

-- Η απόρριψη σημειώνει «declined» (όχι «revoked»), ώστε ο προπονητής να το βλέπει ως «Απέρριψε».
create or replace function public.decline_invite(p_token text)
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
    set declined_at = now()
    where token = p_token
      and used_at is null and revoked_at is null and declined_at is null
      and email is not null and email = me_email;
end;
$$;

-- Οι προσκλήσεις μου δεν περιλαμβάνουν όσες έχω ήδη απορρίψει.
create or replace function public.my_invites()
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
    and i.declined_at is null
    and i.expires_at > now()
    and i.coach_id <> (select auth.uid())
  order by i.created_at desc;
$$;
