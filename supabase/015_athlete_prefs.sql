-- FormLog – 015: επιλογές του προπονητή ανά αθλούμενο (καρφίτσωμα, αγαπημένα, σίγαση, αρχειοθέτηση, μη αναγνωσμένο)
-- Τρέξε το ΜΙΑ φορά, μετά το 014: Supabase → SQL Editor → New query → επικόλληση → Run.

create table public.athlete_prefs (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  athlete_id     uuid not null references public.athletes (id) on delete cascade,
  pinned         boolean not null default false,
  favorite       boolean not null default false,
  muted          boolean not null default false,
  archived       boolean not null default false,
  marked_unread  boolean not null default false,
  primary key (user_id, athlete_id)
);

alter table public.athlete_prefs enable row level security;

-- Ο καθένας βλέπει και αλλάζει μόνο τις δικές του επιλογές, για αθλούμενους στους οποίους έχει πρόσβαση.
create policy "athlete_prefs: μόνο τα δικά μου" on public.athlete_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_access_athlete(athlete_id));

revoke all on public.athlete_prefs from anon, authenticated;
grant select, delete on public.athlete_prefs to authenticated;
grant insert (athlete_id, pinned, favorite, muted, archived, marked_unread) on public.athlete_prefs to authenticated;
-- (το athlete_id χρειάζεται για το «upsert»· ο κανόνας παραπάνω ελέγχει την πρόσβαση)
grant update (athlete_id, pinned, favorite, muted, archived, marked_unread) on public.athlete_prefs to authenticated;
