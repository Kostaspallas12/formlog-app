-- FormLog – 022: «σήματα» ζωντανής ενημέρωσης για ΟΛΑ (χωρίς refresh, και προς τις δύο πλευρές)
-- Τρέξε το ΜΙΑ φορά, μετά το 021: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Γιατί: το απλό realtime στέλνει μια αλλαγή μόνο σε όποιον ΜΠΟΡΕΙ ακόμα να δει τη γραμμή.
-- Π.χ. όταν ο αθλούμενος διακόπτει τη συνεργασία, ο προπονητής χάνει την πρόσβαση και δεν μαθαίνει τίποτα.
-- Εδώ η ίδια η βάση αφήνει ένα μικρό «σήμα» (τι άλλαξε, χωρίς δεδομένα) σε όποιον επηρεάζεται,
-- και το site ξαναδιαβάζει μόνο ό,τι χρειάζεται.
--   athlete → σύνδεση/διακοπή, όνομα, φωτογραφία, ηλικία/ύψος
--   data    → καταγραφές, βάρος, καθημερινά
--   plan    → πρόγραμμα προπόνησης/διατροφής
--   invite  → νέα/ακυρωμένη/απορριφθείσα πρόσκληση
--   group   → ομάδες και μέλη

create table public.live_signals (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,  -- ποιος το λαμβάνει
  kind        text not null check (kind in ('athlete', 'data', 'plan', 'invite', 'group')),
  ref         uuid,                                                        -- αθλούμενος ή ομάδα
  created_at  timestamptz not null default now()
);
create index live_signals_user_idx on public.live_signals (user_id, created_at);
create index live_signals_age_idx on public.live_signals (created_at);

alter table public.live_signals enable row level security;
create policy "live_signals: μόνο ο παραλήπτης" on public.live_signals
  for select to authenticated using ((select auth.uid()) = user_id);
-- Από το site μόνο ανάγνωση· τα γράφει μόνο η βάση.
revoke all on public.live_signals from anon, authenticated;
grant select on public.live_signals to authenticated;

-- Αφήνει σήμα σε κάθε παραλήπτη (εκτός από αυτόν που έκανε την αλλαγή — εκείνος την έχει ήδη).
create function public.live_signal(p_users uuid[], p_kind text, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  -- Τα σήματα χρειάζονται μόνο για λίγα δευτερόλεπτα.
  delete from public.live_signals where created_at < now() - interval '10 minutes';
  foreach u in array coalesce((select array_agg(distinct x) from unnest(p_users) x where x is not null), '{}'::uuid[]) loop
    continue when u is not distinct from auth.uid();
    -- Μία αλλαγή με πολλές γραμμές (π.χ. συγχώνευση φακέλων) → ένα σήμα.
    continue when exists (
      select 1 from public.live_signals s
      where s.user_id = u and s.kind = p_kind and s.ref is not distinct from p_ref and s.created_at = now()
    );
    insert into public.live_signals (user_id, kind, ref) values (u, p_kind, p_ref);
  end loop;
end;
$$;
revoke execute on function public.live_signal(uuid[], text, uuid) from public, anon, authenticated;

-- Φάκελος αθλούμενου: σύνδεση/διακοπή/αλλαγές → ιδιοκτήτης + προπονητής (παλιός και νέος).
create function public.live_athletes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.live_signal(array[old.owner, old.coach_id], 'athlete', old.id);
    return old;
  end if;
  perform public.live_signal(
    array[new.owner, new.coach_id] || case when tg_op = 'UPDATE' then array[old.owner, old.coach_id] else '{}'::uuid[] end,
    'athlete', new.id);
  return new;
end;
$$;
create trigger athletes_live after insert or update or delete on public.athletes
  for each row execute function public.live_athletes();

-- Καταγραφές, βάρος, καθημερινά, πρόγραμμα → ιδιοκτήτης + προπονητής του φακέλου.
create function public.live_athlete_data()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  aid uuid := case when tg_op = 'DELETE' then old.athlete_id else new.athlete_id end;
begin
  perform public.live_signal(
    (select array[a.owner, a.coach_id] from public.athletes a where a.id = aid),
    tg_argv[0], aid);
  if tg_op = 'UPDATE' and old.athlete_id is distinct from new.athlete_id then
    perform public.live_signal(
      (select array[a.owner, a.coach_id] from public.athletes a where a.id = old.athlete_id),
      tg_argv[0], old.athlete_id);
  end if;
  return null;
end;
$$;
create trigger checkins_live after insert or update or delete on public.checkins
  for each row execute function public.live_athlete_data('data');
create trigger weigh_ins_live after insert or update or delete on public.weigh_ins
  for each row execute function public.live_athlete_data('data');
create trigger daily_logs_live after insert or update or delete on public.daily_logs
  for each row execute function public.live_athlete_data('data');
create trigger athlete_plans_live after insert or update or delete on public.athlete_plans
  for each row execute function public.live_athlete_data('plan');

-- Προσκλήσεις → ο προπονητής + ο χρήστης με αυτό το email (αν έχει ήδη λογαριασμό).
create function public.live_invites()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.live_signal(
    array[r.coach_id] || coalesce((select array_agg(u.id) from auth.users u where r.email is not null and lower(u.email) = lower(r.email)), '{}'::uuid[]),
    'invite', r.athlete_id);
  return null;
end;
$$;
create trigger invites_live after insert or update or delete on public.invites
  for each row execute function public.live_invites();

-- Ομάδες: αλλαγή/διαγραφή → προπονητής + μέλη (πριν σβηστούν τα μέλη μαζί με την ομάδα).
create function public.live_groups()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.live_signal(
    array[r.coach_id] || coalesce((select array_agg(m.user_id) from public.group_members m where m.group_id = r.id), '{}'::uuid[]),
    'group', r.id);
  return r;
end;
$$;
create trigger groups_live_update after update on public.groups
  for each row execute function public.live_groups();
create trigger groups_live_delete before delete on public.groups
  for each row execute function public.live_groups();

-- Μέλη: προστέθηκε/έφυγε → το μέλος + όλη η ομάδα (για τη λίστα μελών).
create function public.live_group_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.live_signal(
    array[r.user_id]
      || coalesce((select array[g.coach_id] from public.groups g where g.id = r.group_id), '{}'::uuid[])
      || coalesce((select array_agg(m.user_id) from public.group_members m where m.group_id = r.group_id), '{}'::uuid[]),
    'group', r.group_id);
  return null;
end;
$$;
create trigger group_members_live after insert or delete on public.group_members
  for each row execute function public.live_group_members();

-- Όνομα/φωτογραφία προφίλ → ο προπονητής μου και οι αθλούμενοί μου.
create function public.live_profiles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.live_signal(
    coalesce((select array_agg(a.coach_id) from public.athletes a where a.owner = new.id and a.coach_id <> new.id), '{}'::uuid[])
      || coalesce((select array_agg(a.owner) from public.athletes a where a.coach_id = new.id and a.owner <> new.id), '{}'::uuid[]),
    'athlete', null);
  return null;
end;
$$;
create trigger profiles_live after update of name, avatar on public.profiles
  for each row execute function public.live_profiles();

revoke execute on function public.live_athletes(), public.live_athlete_data(), public.live_invites(),
  public.live_groups(), public.live_group_members(), public.live_profiles() from public, anon, authenticated;

alter publication supabase_realtime add table public.live_signals;
