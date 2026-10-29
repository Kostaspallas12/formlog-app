-- FormLog – 030: διόρθωση — η διαγραφή λογαριασμού αποτύγχανε για όποιον είχε δεδομένα
-- Τρέξε το ΜΙΑ φορά, μετά το 029: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Γιατί: όταν σβήνεται ένας λογαριασμός, σβήνονται μαζί και τα δεδομένα του· κάθε τέτοια διαγραφή
-- έστελνε «ζωντανό σήμα» και στον ίδιο τον χρήστη που μόλις σβήνεται — και επειδή εκείνος δεν
-- υπάρχει πια, η βάση ακύρωνε ΟΛΗ τη διαγραφή («Κάτι πήγε στραβά»).
-- Τώρα: σήμα μόνο σε χρήστες που υπάρχουν ακόμα (το ίδιο και για τις ειδοποιήσεις ενοτήτων).

create or replace function public.live_signal(p_users uuid[], p_kind text, p_ref uuid)
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
    -- Χρήστης που σβήνεται αυτή τη στιγμή (διαγραφή λογαριασμού): κανένα σήμα.
    continue when not exists (select 1 from auth.users where id = u);
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

create or replace function public.note_coach_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  aid uuid := case when tg_op = 'DELETE' then old.athlete_id else new.athlete_id end;
  athlete_owner uuid;
begin
  select a.owner into athlete_owner from public.athletes a
    where a.id = aid and a.coach_id = auth.uid() and a.owner <> auth.uid();
  if athlete_owner is not null and exists (select 1 from auth.users where id = athlete_owner) then
    insert into public.coach_updates as c (user_id, section) values (athlete_owner, tg_argv[0])
    on conflict (user_id, section) do update
      set count = case when c.updated_at = now() then c.count else c.count + 1 end,
          updated_at = now();
  end if;
  return null;
end;
$$;
revoke execute on function public.note_coach_update() from public, anon, authenticated;
