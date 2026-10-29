-- FormLog – 023: τα ζωντανά σήματα φτάνουν και σε αυτόν που έκανε την αλλαγή
-- Τρέξε το ΜΙΑ φορά, μετά το 022: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Γιατί: ο ίδιος χρήστης μπορεί να έχει ανοιχτό και κινητό και υπολογιστή — ό,τι αλλάζει στο ένα
-- πρέπει να φαίνεται αμέσως και στο άλλο. Επίσης η αυτόματη αποχώρηση από τις ομάδες
-- μετά από διακοπή συνεργασίας φαίνεται πλέον αμέσως και σε αυτόν που διέκοψε.

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
