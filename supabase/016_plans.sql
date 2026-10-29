-- FormLog – 016: πρόγραμμα προπόνησης και διατροφής ανά αθλούμενο
-- Τρέξε το ΜΙΑ φορά, μετά το 015: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Κάθε αθλούμενος έχει το δικό του πρόγραμμα προπόνησης και το δικό του πρόγραμμα διατροφής.
-- Τα γράφει (ή ανεβάζει σε αρχείο) ΜΟΝΟ ο προπονητής του· ο αθλούμενος τα βλέπει.
-- Αν διακοπεί η συνεργασία, το πρόγραμμα μένει στον αθλούμενο (όπως και το υπόλοιπο αρχείο του).

-- (Αν είχε τρέξει παλιότερη μορφή αυτού του αρχείου, καθαρίζει ό,τι είχε φτιάξει.)
drop trigger if exists athletes_clear_plans on public.athletes;
drop function if exists public.clear_plans_on_coach_change();
drop function if exists public.assign_plan(uuid, uuid);
drop function if exists public.unassign_plan(uuid, text);
drop table if exists public.plan_assignments;
drop table if exists public.plans;
drop function if exists public.can_read_plan(uuid);
drop function if exists public.touch_plan();


-- ============================================================
-- 1. Πίνακας: ένα πρόγραμμα κάθε είδους ανά αθλούμενο
--    content: ό,τι γράφει ο προπονητής · files: αρχεία που ανέβασε [{ path, name, size, type }]
-- ============================================================
create table public.athlete_plans (
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  kind        text not null check (kind in ('training', 'nutrition')),
  title       text not null default '' check (char_length(title) <= 120),
  content     jsonb not null default '{}'::jsonb check (pg_column_size(content) < 200000),
  files       jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 10),
  updated_at  timestamptz not null default now(),
  primary key (athlete_id, kind)
);

create function public.touch_athlete_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger athlete_plans_touch before update on public.athlete_plans
  for each row execute function public.touch_athlete_plan();

-- Είναι ο συνδεδεμένος χρήστης ο προπονητής αυτού του αθλούμενου;
create function public.is_coach_of(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.athletes where id = aid and coach_id = (select auth.uid()));
$$;

revoke execute on function public.is_coach_of(uuid) from public, anon;
grant execute on function public.is_coach_of(uuid) to authenticated;


-- ============================================================
-- 2. Κανόνες ασφαλείας: βλέπουν αθλούμενος και προπονητής · γράφει μόνο ο προπονητής
-- ============================================================
alter table public.athlete_plans enable row level security;

create policy "athlete_plans: βλέπουν αθλούμενος και προπονητής" on public.athlete_plans
  for select to authenticated using (public.can_access_athlete(athlete_id));

create policy "athlete_plans: γράφει ο προπονητής" on public.athlete_plans
  for insert to authenticated with check (public.is_coach_of(athlete_id));

create policy "athlete_plans: αλλάζει ο προπονητής" on public.athlete_plans
  for update to authenticated using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));

create policy "athlete_plans: σβήνει ο προπονητής" on public.athlete_plans
  for delete to authenticated using (public.is_coach_of(athlete_id));

revoke all on public.athlete_plans from anon, authenticated;
grant select, delete on public.athlete_plans to authenticated;
-- (τα athlete_id/kind χρειάζονται και στο update για το «upsert»· ο κανόνας ελέγχει την πρόσβαση)
grant insert (athlete_id, kind, title, content, files) on public.athlete_plans to authenticated;
grant update (athlete_id, kind, title, content, files) on public.athlete_plans to authenticated;


-- ============================================================
-- 3. Αρχεία προγράμματος: ιδιωτικός χώρος "plans", φάκελος <athlete id>/
--    PDF, έγγραφα, πίνακες, κείμενο, φωτογραφίες · έως 10 MB το καθένα
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plans', 'plans', false, 10485760, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png'
])
on conflict (id) do nothing;

-- Ο φάκελος είναι το id του αθλούμενου (κείμενο)· οτιδήποτε άλλο απορρίπτεται.
create function public.plan_folder_access(folder text, write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athletes a
    where a.id::text = folder
      and (
        a.coach_id = (select auth.uid())
        or (not write and a.owner = (select auth.uid()))
      )
  );
$$;

revoke execute on function public.plan_folder_access(text, boolean) from public, anon;
grant execute on function public.plan_folder_access(text, boolean) to authenticated;

create policy "plans: βλέπουν αθλούμενος και προπονητής" on storage.objects for select to authenticated
  using (bucket_id = 'plans' and public.plan_folder_access((storage.foldername(name))[1], false));
create policy "plans: ανεβάζει ο προπονητής" on storage.objects for insert to authenticated
  with check (bucket_id = 'plans' and public.plan_folder_access((storage.foldername(name))[1], true));
create policy "plans: σβήνει ο προπονητής" on storage.objects for delete to authenticated
  using (bucket_id = 'plans' and public.plan_folder_access((storage.foldername(name))[1], true));
