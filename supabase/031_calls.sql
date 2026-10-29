-- FormLog – 031: κλήσεις και βιντεοκλήσεις προπονητή ↔ αθλούμενου (σαν εφαρμογή μηνυμάτων)
-- Τρέξε το ΜΙΑ φορά, μετά το 030: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Η εικόνα και ο ήχος πηγαίνουν απευθείας από συσκευή σε συσκευή (WebRTC) — δεν περνούν από τη βάση.
-- Εδώ κρατιέται μόνο ποιος καλεί ποιον και τι έγινε (κουδουνίζει / απάντησε / αναπάντητη / τέλος),
-- και στο τέλος γράφεται μια γραμμή στη συνομιλία («Βιντεοκλήση · 12:34», «Αναπάντητη κλήση»).

create table public.calls (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes (id) on delete cascade,  -- η συνομιλία
  caller       uuid not null references auth.users (id) on delete cascade,
  callee       uuid not null references auth.users (id) on delete cascade,
  video        boolean not null default false,
  status       text not null default 'ringing'
               check (status in ('ringing', 'accepted', 'declined', 'busy', 'cancelled', 'missed', 'ended')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz,
  ended_at     timestamptz
);
create index calls_callee_idx on public.calls (callee, created_at desc);
create index calls_caller_idx on public.calls (caller, created_at desc);

alter table public.calls enable row level security;

-- Τις βλέπουν μόνο οι δύο που μιλάνε. Αλλαγές μόνο μέσα από τις συναρτήσεις παρακάτω.
create policy "calls: βλέπουν οι δύο"
  on public.calls for select to authenticated
  using ((select auth.uid()) in (caller, callee));
revoke all on public.calls from anon, authenticated;
grant select on public.calls to authenticated;

-- Η γραμμή της κλήσης μέσα στη συνομιλία: { video, status, secs }.
alter table public.messages add column call jsonb;
alter table public.messages drop constraint messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 4000
  and (char_length(btrim(body)) > 0 or photo is not null or audio is not null or call is not null)
);

-- Νέα κλήση: μόνο προς τον άλλον της συνομιλίας (αθλούμενος ↔ ο προπονητής του).
create or replace function public.start_call(p_athlete uuid, p_video boolean)
returns public.calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a public.athletes;
  row public.calls;
begin
  select * into a from public.athletes
    where id = p_athlete and coach_id is not null and coach_id <> owner and me in (owner, coach_id);
  if a.id is null then raise exception 'not_allowed'; end if;

  -- Όριο: όχι πάνω από 20 κλήσεις τα 10 λεπτά από τον ίδιο (προστασία από spam).
  if (select count(*) from public.calls where caller = me and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'too_many';
  end if;

  -- Ό,τι έμεινε να «κουδουνίζει» από τον ίδιο (π.χ. έκλεισε την καρτέλα) ακυρώνεται.
  update public.calls set status = 'cancelled', ended_at = now()
    where caller = me and status = 'ringing';

  insert into public.calls (athlete_id, caller, callee, video)
    values (a.id, me, case when me = a.owner then a.coach_id else a.owner end, coalesce(p_video, false))
    returning * into row;
  return row;
end;
$$;
revoke execute on function public.start_call(uuid, boolean) from public, anon;
grant execute on function public.start_call(uuid, boolean) to authenticated;

-- Αλλαγή κατάστασης, μόνο με τις επιτρεπτές κινήσεις:
--   ο καλούμενος: κουδουνίζει → απάντησε / απέρριψε / κατειλημμένος
--   ο καλών:      κουδουνίζει → ακύρωσε / αναπάντητη
--   οποιοσδήποτε: σε εξέλιξη → τέλος
-- Στο τέλος γράφεται η γραμμή της κλήσης στη συνομιλία.
create or replace function public.set_call_status(p_call uuid, p_status text)
returns public.calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.calls;
begin
  select * into c from public.calls where id = p_call and me in (caller, callee) for update;
  if c.id is null then raise exception 'not_allowed'; end if;

  if not (
    (c.status = 'ringing' and me = c.callee and p_status in ('accepted', 'declined', 'busy'))
    or (c.status = 'ringing' and me = c.caller and p_status in ('cancelled', 'missed'))
    or (c.status = 'accepted' and p_status = 'ended')
  ) then
    return c; -- ήδη άλλαξε (π.χ. έκλεισαν και οι δύο μαζί): τίποτα
  end if;

  update public.calls set
    status = p_status,
    answered_at = case when p_status = 'accepted' then now() else answered_at end,
    ended_at = case when p_status <> 'accepted' then now() else ended_at end
  where id = c.id
  returning * into c;

  if p_status <> 'accepted' then
    -- Κλήση που έγινε κανονικά: ήδη «διαβασμένη» (δεν μετράει ως νέο μήνυμα). Αναπάντητη: μετράει.
    insert into public.messages (athlete_id, sender, body, call, read_at)
    values (c.athlete_id, c.caller, '', jsonb_build_object(
      'video', c.video,
      'status', case when p_status = 'ended' then 'ended' when p_status in ('declined', 'busy') then 'declined' else 'missed' end,
      'secs', case when c.answered_at is not null then greatest(0, extract(epoch from (c.ended_at - c.answered_at))::int) else 0 end
    ), case when p_status = 'ended' then now() end);
  end if;
  return c;
end;
$$;
revoke execute on function public.set_call_status(uuid, text) from public, anon;
grant execute on function public.set_call_status(uuid, text) to authenticated;

-- Ζωντανά: ο καλούμενος βλέπει αμέσως την κλήση, και οι δύο κάθε αλλαγή κατάστασης.
alter publication supabase_realtime add table public.calls;
