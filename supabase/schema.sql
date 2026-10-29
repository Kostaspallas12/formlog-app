-- FormLog – βάση δεδομένων στο Supabase
-- Τρέξε το ΜΙΑ φορά: Supabase → SQL Editor → New query → επικόλληση → Run.
-- Μετά τρέξε με τη σειρά και τα επόμενα αρχεία (002_…, 003_…) αυτού του φακέλου.
--
-- Ασφάλεια: σε κάθε πίνακα είναι ενεργό το Row Level Security (RLS).
-- Κάθε χρήστης διαβάζει και αλλάζει ΜΟΝΟ τις δικές του γραμμές και φωτογραφίες,
-- όποιο αίτημα κι αν στείλει κάποιος στη βάση.


-- ============================================================
-- 1. Προφίλ: όνομα, τύπος λογαριασμού, απόδειξη συγκατάθεσης
--    (το email και ο κωδικός τα κρατάει το Supabase Auth)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  type        text not null check (type in ('personal', 'coach')),
  consent     jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: ο χρήστης βλέπει το δικό του"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: ο χρήστης αλλάζει το δικό του"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Από το site αλλάζει μόνο το όνομα· ο τύπος και η συγκατάθεση δεν πειράζονται.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

-- Με την εγγραφή φτιάχνεται αυτόματα το προφίλ.
-- Χωρίς αποδοχή όρων και συγκατάθεση για τα δεδομένα υγείας, η εγγραφή απορρίπτεται.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce((meta -> 'consent' ->> 'terms')::boolean, false) is not true
     or coalesce((meta -> 'consent' ->> 'healthData')::boolean, false) is not true then
    raise exception 'consent required';
  end if;

  insert into public.profiles (id, name, type, consent)
  values (
    new.id,
    coalesce(nullif(trim(meta ->> 'name'), ''), split_part(new.email, '@', 1)),
    case when meta ->> 'type' = 'coach' then 'coach' else 'personal' end,
    (meta -> 'consent') || jsonb_build_object('at', now())   -- η ώρα μπαίνει από τον server
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- 2. Αθλούμενοι
--    Ο προσωπικός λογαριασμός έχει έναν: τον εαυτό του (self = true).
-- ============================================================
create table public.athletes (
  id                    uuid primary key default gen_random_uuid(),
  owner                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (char_length(trim(name)) between 1 and 100),
  self                  boolean not null default false,
  consent_confirmed_at  timestamptz,
  created_at            timestamptz not null default now()
);

create index athletes_owner_idx on public.athletes (owner);
create unique index athletes_one_self_per_owner on public.athletes (owner) where self;

alter table public.athletes enable row level security;

create policy "athletes: μόνο του κατόχου"
  on public.athletes for all to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

revoke all on public.athletes from anon;


-- ============================================================
-- 3. Καταγραφές: ημερομηνία, βάρος, έως 3 φωτογραφίες, σημείωση
--    photos = { "front": "<διαδρομή στο Storage>", "side": …, "back": … }
-- ============================================================
create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  weight      numeric(5, 1) check (weight is null or (weight > 20 and weight < 400)),
  photos      jsonb not null default '{}'::jsonb,
  note        text not null default '' check (char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);

create index checkins_athlete_idx on public.checkins (athlete_id, date);
create index checkins_owner_idx on public.checkins (owner);

alter table public.checkins enable row level security;

-- Μόνο ο κάτοχος, και μόνο σε δικό του αθλούμενο.
create policy "checkins: μόνο του κατόχου"
  on public.checkins for all to authenticated
  using ((select auth.uid()) = owner)
  with check (
    (select auth.uid()) = owner
    and exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.owner = (select auth.uid())
    )
  );

revoke all on public.checkins from anon;


-- ============================================================
-- 4. Φωτογραφίες: ιδιωτικός χώρος (bucket) "photos"
--    Κάθε χρήστης έχει φάκελο με το id του: <user id>/<φωτογραφία>.jpg
--    Μόνο JPEG έως 5 MB (το site τις μικραίνει πριν το ανέβασμα).
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg']);

create policy "photos: ο χρήστης βλέπει τις δικές του"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: ο χρήστης ανεβάζει στον φάκελό του"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: ο χρήστης σβήνει τις δικές του"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ============================================================
-- 5. Διαγραφή λογαριασμού (GDPR)
--    Το site σβήνει πρώτα τις φωτογραφίες από το Storage και μετά καλεί αυτό.
--    Σβήνει τον χρήστη· προφίλ, αθλούμενοι και καταγραφές σβήνονται μαζί (on delete cascade).
-- ============================================================
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
