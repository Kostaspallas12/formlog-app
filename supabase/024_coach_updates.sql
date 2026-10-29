-- FormLog – 024: ειδοποιήσεις στον αθλούμενο όταν ο προπονητής αλλάζει κάτι στον φάκελό του
-- Τρέξε το ΜΙΑ φορά, μετά το 023: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Όπως τα αδιάβαστα μηνύματα: αριθμός πάνω στην ενότητα (Αρχείο, Βάρος, Καθημερινά, Πρόγραμμα)
-- που φεύγει μόλις ο αθλούμενος την ανοίξει. Μένει και αν δεν ήταν συνδεδεμένος εκείνη την ώρα.

create table public.coach_updates (
  user_id     uuid not null references auth.users (id) on delete cascade,   -- ο αθλούμενος
  section     text not null check (section in ('archive', 'weight', 'daily', 'plan')),
  count       integer not null default 1,                                   -- πόσες αλλαγές δεν έχει δει
  updated_at  timestamptz not null default now(),
  primary key (user_id, section)
);

alter table public.coach_updates enable row level security;
create policy "coach_updates: ο αθλούμενος τις βλέπει" on public.coach_updates
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "coach_updates: ο αθλούμενος τις σβήνει (διαβάστηκαν)" on public.coach_updates
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Από το site: μόνο ανάγνωση και «διαβάστηκε». Τις γράφει μόνο η βάση.
revoke all on public.coach_updates from anon, authenticated;
grant select, delete on public.coach_updates to authenticated;

-- Αλλαγή από τον προπονητή (όχι από τον ίδιο τον αθλούμενο) → +1 στην ενότητα.
-- Μία ενέργεια με πολλές γραμμές μετράει μία φορά.
create function public.note_coach_update()
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
  if athlete_owner is not null then
    insert into public.coach_updates as c (user_id, section) values (athlete_owner, tg_argv[0])
    on conflict (user_id, section) do update
      set count = case when c.updated_at = now() then c.count else c.count + 1 end,
          updated_at = now();
  end if;
  return null;
end;
$$;
revoke execute on function public.note_coach_update() from public, anon, authenticated;

create trigger checkins_coach_update after insert or update or delete on public.checkins
  for each row execute function public.note_coach_update('archive');
create trigger weigh_ins_coach_update after insert or update or delete on public.weigh_ins
  for each row execute function public.note_coach_update('weight');
create trigger daily_logs_coach_update after insert or update or delete on public.daily_logs
  for each row execute function public.note_coach_update('daily');
create trigger athlete_plans_coach_update after insert or update or delete on public.athlete_plans
  for each row execute function public.note_coach_update('plan');

alter publication supabase_realtime add table public.coach_updates;
