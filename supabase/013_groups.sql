-- FormLog – 013: ομάδες (ομαδικές συνομιλίες προπονητή με πολλούς αθλούμενους)
-- Τρέξε το ΜΙΑ φορά, μετά το 012: Supabase → SQL Editor → New query → επικόλληση → Run.

-- ------------------------------------------------------------
-- 1. Πίνακες
-- ------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  coach_only  boolean not null default false,   -- «μόνο ο προπονητής στέλνει» (ανακοινώσεις)
  created_at  timestamptz not null default now()
);
create index groups_coach_idx on public.groups (coach_id);

-- Μέλη = αθλούμενοι (λογαριασμοί) συνδεδεμένοι με τον προπονητή της ομάδας.
create table public.group_members (
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  added_at      timestamptz not null default now(),
  last_read_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  sender      uuid default auth.uid() references auth.users (id) on delete set null,
  body        text not null default '',
  photo       text,
  created_at  timestamptz not null default now(),
  constraint group_messages_content_check check (
    char_length(body) <= 4000 and (char_length(btrim(body)) > 0 or photo is not null)
  ),
  constraint group_messages_photo_path_check check (
    photo is null or photo ~ ('^' || group_id::text || '/[0-9a-f-]{36}\.jpg$')
  )
);
create index group_messages_group_idx on public.group_messages (group_id, created_at);

-- Τελευταία ανάγνωση του προπονητή (τα μέλη την έχουν στο group_members).
create table public.group_reads (
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ------------------------------------------------------------
-- 2. Ποιος έχει πρόσβαση σε μια ομάδα: ο προπονητής της και τα μέλη της.
-- ------------------------------------------------------------
create function public.in_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.groups g where g.id = gid and g.coach_id = (select auth.uid()))
      or exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = (select auth.uid()));
$$;
revoke execute on function public.in_group(uuid) from public, anon;
grant execute on function public.in_group(uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_reads enable row level security;

create policy "groups: βλέπουν προπονητής και μέλη" on public.groups
  for select to authenticated using (public.in_group(id));
create policy "groups: φτιάχνει μόνο προπονητής" on public.groups
  for insert to authenticated with check (
    coach_id = (select auth.uid())
    and (select type from public.profiles where id = (select auth.uid())) = 'coach'
  );
create policy "groups: αλλάζει ο προπονητής της" on public.groups
  for update to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "groups: σβήνει ο προπονητής της" on public.groups
  for delete to authenticated using (coach_id = (select auth.uid()));

create policy "group_members: βλέπουν προπονητής και μέλη" on public.group_members
  for select to authenticated using (public.in_group(group_id));
-- Το μέλος ενημερώνει μόνο το δικό του «διάβασα μέχρι εδώ» ή φεύγει από την ομάδα.
create policy "group_members: το μέλος ενημερώνει τον εαυτό του" on public.group_members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "group_members: αφαιρεί ο προπονητής ή φεύγει το μέλος" on public.group_members
  for delete to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = group_id and g.coach_id = (select auth.uid()))
  );

create policy "group_messages: βλέπουν προπονητής και μέλη" on public.group_messages
  for select to authenticated using (public.in_group(group_id));
create policy "group_messages: στέλνουν προπονητής και μέλη" on public.group_messages
  for insert to authenticated with check (
    sender = (select auth.uid())
    and public.in_group(group_id)
    -- σε ομάδα ανακοινώσεων στέλνει μόνο ο προπονητής
    and (
      not (select g.coach_only from public.groups g where g.id = group_id)
      or exists (select 1 from public.groups g where g.id = group_id and g.coach_id = (select auth.uid()))
    )
  );

create policy "group_reads: ο καθένας τα δικά του" on public.group_reads
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.in_group(group_id));

revoke all on public.groups, public.group_members, public.group_messages, public.group_reads from anon, authenticated;
grant select, delete on public.groups to authenticated;
grant insert (name, coach_only) on public.groups to authenticated;
grant update (name, coach_only) on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant update (last_read_at) on public.group_members to authenticated;
grant select on public.group_messages to authenticated;
grant insert (group_id, body, photo) on public.group_messages to authenticated;
grant select, insert, update, delete on public.group_reads to authenticated;

-- ------------------------------------------------------------
-- 3. Μέλη: προσθήκη μόνο μέσω της βάσης, μόνο συνδεδεμένων αθλούμενων του προπονητή.
-- ------------------------------------------------------------
create function public.add_group_member(p_group uuid, p_athlete uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid;
begin
  if not exists (select 1 from public.groups where id = p_group and coach_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;
  select a.owner into member from public.athletes a
    where a.id = p_athlete and a.coach_id = auth.uid() and a.owner <> a.coach_id;
  if member is null then raise exception 'not_linked'; end if;
  insert into public.group_members (group_id, user_id) values (p_group, member) on conflict do nothing;
end;
$$;
revoke execute on function public.add_group_member(uuid, uuid) from public, anon;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;

-- Τα ονόματα των ανθρώπων της ομάδας (τα προφίλ αλλιώς δεν φαίνονται σε άλλους).
create function public.group_people(p_group uuid)
returns table (user_id uuid, name text, is_coach boolean, athlete_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select g.coach_id, p.name, true, null::uuid
    from public.groups g join public.profiles p on p.id = g.coach_id
    where g.id = p_group and public.in_group(p_group)
  union all
  select m.user_id, p.name, false,
         (select a.id from public.athletes a where a.owner = m.user_id and a.self limit 1)
    from public.group_members m join public.profiles p on p.id = m.user_id
    where m.group_id = p_group and public.in_group(p_group);
$$;
revoke execute on function public.group_people(uuid) from public, anon;
grant execute on function public.group_people(uuid) to authenticated;

-- Οι ομάδες μου με αδιάβαστα και το τελευταίο μήνυμα (για λίστες και αριθμούς).
create function public.my_groups()
returns table (id uuid, name text, coach_id uuid, coach_only boolean, members int, unread int, last_body text, last_photo boolean, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select g.*, coalesce(
      (select m.last_read_at from public.group_members m where m.group_id = g.id and m.user_id = (select auth.uid())),
      (select r.last_read_at from public.group_reads r where r.group_id = g.id and r.user_id = (select auth.uid())),
      g.created_at
    ) as read_at
    from public.groups g
    where public.in_group(g.id)
  )
  select mine.id, mine.name, mine.coach_id, mine.coach_only,
    (select count(*)::int from public.group_members m where m.group_id = mine.id),
    (select count(*)::int from public.group_messages x
      where x.group_id = mine.id and x.created_at > mine.read_at and x.sender is distinct from (select auth.uid())),
    last.body, last.photo is not null, last.created_at
  from mine
  left join lateral (
    select x.body, x.photo, x.created_at from public.group_messages x
    where x.group_id = mine.id order by x.created_at desc limit 1
  ) last on true
  order by coalesce(last.created_at, mine.created_at) desc;
$$;
revoke execute on function public.my_groups() from public, anon;
grant execute on function public.my_groups() to authenticated;

-- «Διάβασα την ομάδα»: για μέλος ενημερώνει το group_members, για τον προπονητή το group_reads.
create function public.mark_group_read(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.in_group(p_group) then raise exception 'not_allowed'; end if;
  update public.group_members set last_read_at = now() where group_id = p_group and user_id = auth.uid();
  if not found then
    insert into public.group_reads (group_id, user_id) values (p_group, auth.uid())
      on conflict (group_id, user_id) do update set last_read_at = now();
  end if;
end;
$$;
revoke execute on function public.mark_group_read(uuid) from public, anon;
grant execute on function public.mark_group_read(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Διακοπή συνεργασίας → ο αθλούμενος βγαίνει από τις ομάδες εκείνου του προπονητή.
-- ------------------------------------------------------------
create function public.leave_groups_on_disconnect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.coach_id is not null and new.coach_id is distinct from old.coach_id then
    delete from public.group_members m
      using public.groups g
      where g.id = m.group_id and g.coach_id = old.coach_id and m.user_id = old.owner;
  end if;
  return new;
end;
$$;
revoke execute on function public.leave_groups_on_disconnect() from public, anon, authenticated;
create trigger athletes_leave_groups after update of coach_id on public.athletes
  for each row execute function public.leave_groups_on_disconnect();

-- ------------------------------------------------------------
-- 5. Φωτογραφίες ομάδας: φάκελος <group id>/ στο Storage, μόνο για προπονητή και μέλη.
--    (Ξεχωριστοί κανόνες: βλέπουν/ανεβάζουν· σβήσιμο όχι από τα μέλη.)
-- ------------------------------------------------------------
create function public.in_group_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.groups g where g.id::text = folder and public.in_group(g.id));
$$;
revoke execute on function public.in_group_folder(text) from public, anon;
grant execute on function public.in_group_folder(text) to authenticated;

create policy "photos: ομάδα βλέπει" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.in_group_folder((storage.foldername(name))[1]));
create policy "photos: ομάδα ανεβάζει" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.in_group_folder((storage.foldername(name))[1]));

-- Σβήνει μόνο ο προπονητής της ομάδας (π.χ. όταν διαγράφει την ομάδα).
create policy "photos: ο προπονητής σβήνει της ομάδας" on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.groups g where g.id::text = (storage.foldername(name))[1] and g.coach_id = (select auth.uid()))
  );

-- Ζωντανά μηνύματα ομάδας.
alter publication supabase_realtime add table public.group_messages;
