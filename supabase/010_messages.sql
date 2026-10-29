-- FormLog – 010: συνομιλία προπονητή ↔ αθλούμενου (σαν εφαρμογή μηνυμάτων)
-- Τρέξε το ΜΙΑ φορά, μετά το 009: Supabase → SQL Editor → New query → επικόλληση → Run.

-- Κάθε συνομιλία ανήκει στον φάκελο ενός αθλούμενου (athlete_id).
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  sender      uuid default auth.uid() references auth.users (id) on delete set null,  -- ποιος το έστειλε
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz                                                              -- πότε το διάβασε ο άλλος
);
create index messages_athlete_idx on public.messages (athlete_id, created_at);
create index messages_unread_idx on public.messages (athlete_id) where read_at is null;

alter table public.messages enable row level security;

-- Βλέπουν μόνο ο αθλούμενος (κάτοχος) και ο προπονητής του.
create policy "messages: βλέπουν αθλούμενος και προπονητής"
  on public.messages for select to authenticated
  using (public.can_access_athlete(athlete_id));

-- Στέλνει μόνο ως ο εαυτός του, και μόνο όταν ο αθλούμενος έχει συνδεθεί με τον προπονητή.
create policy "messages: στέλνουν αθλούμενος και προπονητής"
  on public.messages for insert to authenticated
  with check (
    sender = (select auth.uid())
    and exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.coach_id is not null and a.coach_id <> a.owner
        and (select auth.uid()) in (a.owner, a.coach_id)
    )
  );

-- «Διαβάστηκε»: μόνο ο παραλήπτης, όχι αυτός που το έστειλε.
create policy "messages: ο παραλήπτης το σημειώνει διαβασμένο"
  on public.messages for update to authenticated
  using (public.can_access_athlete(athlete_id) and sender is distinct from (select auth.uid()))
  with check (public.can_access_athlete(athlete_id));

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (athlete_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- Ρύθμιση: ειδοποίηση για νέο μήνυμα (ναι/όχι), για προπονητή και αθλούμενο.
alter table public.profiles
  add column notify_messages boolean not null default true;
grant update (name, notify_checkins, notify_messages) on public.profiles to authenticated;

-- Ζωντανά μηνύματα (χωρίς ανανέωση σελίδας).
alter publication supabase_realtime add table public.messages;
