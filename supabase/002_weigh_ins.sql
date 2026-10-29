-- FormLog – 002: πίνακας βάρους (weigh_ins)
-- Τρέξε το ΜΙΑ φορά, μετά το schema.sql: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Ένα βάρος ανά αθλούμενο ανά ημέρα. Είναι η μία πηγή για το βάρος: ο πίνακας βάρους,
-- το γράφημα και οι καταγραφές με φωτογραφίες διαβάζουν και γράφουν όλα εδώ.

create table public.weigh_ins (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  weight      numeric(5, 1) not null check (weight > 20 and weight < 400),
  note        text not null default '' check (char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  unique (athlete_id, date)
);

create index weigh_ins_owner_idx on public.weigh_ins (owner);

alter table public.weigh_ins enable row level security;

-- Μόνο ο κάτοχος, και μόνο σε δικό του αθλούμενο.
create policy "weigh_ins: μόνο του κατόχου"
  on public.weigh_ins for all to authenticated
  using ((select auth.uid()) = owner)
  with check (
    (select auth.uid()) = owner
    and exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.owner = (select auth.uid())
    )
  );

revoke all on public.weigh_ins from anon;

-- Μεταφορά του βάρους που υπάρχει ήδη στις καταγραφές με φωτογραφίες.
-- (Αν μια μέρα έχει δύο καταγραφές, κρατάμε την πιο πρόσφατη.)
insert into public.weigh_ins (athlete_id, owner, date, weight)
select distinct on (athlete_id, date) athlete_id, owner, date, weight
from public.checkins
where weight is not null
order by athlete_id, date, created_at desc
on conflict (athlete_id, date) do nothing;

-- Από εδώ και πέρα το βάρος ζει μόνο στο weigh_ins.
update public.checkins set weight = null where weight is not null;
