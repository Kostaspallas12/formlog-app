-- FormLog – 003: καθημερινή καταγραφή (θερμίδες, πρόγραμμα προπόνησης, βήματα, νερό)
-- Τρέξε το ΜΙΑ φορά, μετά το 002: Supabase → SQL Editor → New query → επικόλληση → Run.

-- Μία γραμμή ανά αθλούμενο ανά ημέρα. Όλα τα πεδία είναι προαιρετικά, αρκεί να υπάρχει ένα.
create table public.daily_logs (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  calories    integer       check (calories between 0 and 15000),
  workout     text          check (char_length(workout) <= 100),   -- π.χ. «Πόδια», «Push», «Ξεκούραση»
  steps       integer       check (steps between 0 and 200000),
  water       numeric(4, 2) check (water between 0 and 15),        -- λίτρα
  created_at  timestamptz not null default now(),
  unique (athlete_id, date),
  check (calories is not null or nullif(trim(workout), '') is not null or steps is not null or water is not null)
);

create index daily_logs_owner_idx on public.daily_logs (owner);

alter table public.daily_logs enable row level security;

-- Μόνο ο κάτοχος, και μόνο σε δικό του αθλούμενο.
create policy "daily_logs: μόνο του κατόχου"
  on public.daily_logs for all to authenticated
  using ((select auth.uid()) = owner)
  with check (
    (select auth.uid()) = owner
    and exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.owner = (select auth.uid())
    )
  );

revoke all on public.daily_logs from anon;
