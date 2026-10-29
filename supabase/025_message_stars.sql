-- FormLog – 025: μηνύματα με αστέρι (για να βρίσκεις γρήγορα ό,τι σημαντικό)
-- Τρέξε το ΜΙΑ φορά, μετά το 024: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Ο καθένας βάζει αστέρι μόνο σε μηνύματα που μπορεί να διαβάσει (συνομιλία ή ομάδα),
-- και βλέπει μόνο τα δικά του αστέρια. Αν σβηστεί το μήνυμα, φεύγει και το αστέρι.

create table public.message_stars (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id        uuid references public.messages (id) on delete cascade,
  group_message_id  uuid references public.group_messages (id) on delete cascade,
  created_at        timestamptz not null default now(),
  check ((message_id is null) <> (group_message_id is null))   -- ακριβώς ένα από τα δύο
);
create unique index message_stars_msg_uq on public.message_stars (user_id, message_id) where message_id is not null;
create unique index message_stars_gmsg_uq on public.message_stars (user_id, group_message_id) where group_message_id is not null;
create index message_stars_user_idx on public.message_stars (user_id, created_at desc);

alter table public.message_stars enable row level security;

create policy "message_stars: βλέπω τα δικά μου" on public.message_stars
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "message_stars: αστέρι μόνο σε μήνυμα που βλέπω" on public.message_stars
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (message_id is null or exists (select 1 from public.messages m where m.id = message_id))
    and (group_message_id is null or exists (select 1 from public.group_messages g where g.id = group_message_id))
  );
create policy "message_stars: αφαιρώ τα δικά μου" on public.message_stars
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.message_stars from anon, authenticated;
grant select, delete on public.message_stars to authenticated;
grant insert (message_id, group_message_id) on public.message_stars to authenticated;
