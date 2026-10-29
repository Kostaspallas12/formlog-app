-- FormLog – 007: ο αθλούμενος βλέπει κάθε φωτογραφία των δικών του καταγραφών
-- Τρέξε το ΜΙΑ φορά, μετά το 006: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Οι φωτογραφίες που ανέβασε ένας προπονητής ΠΡΙΝ τη Φάση 1 βρίσκονται στον δικό του παλιό
-- φάκελο (<id προπονητή>/…). Ο αθλούμενος δεν είχε πρόσβαση σε αυτόν τον φάκελο, οπότε δεν
-- τις έβλεπε. Εδώ επιτρέπουμε να διαβάσει κάποιος μια φωτογραφία όταν αυτή ανήκει σε καταγραφή
-- φακέλου στον οποίο έχει πρόσβαση – μόνο αυτή, όχι τις υπόλοιπες του φακέλου του προπονητή.

create function public.can_read_photo(obj_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.checkins c
    join public.athletes a on a.id = c.athlete_id
    where (select auth.uid()) in (a.owner, a.coach_id)
      -- η μικρή έκδοση (…thumb.jpg) ανήκει στην ίδια φωτογραφία με την κανονική (….jpg)
      and c.photos::text like '%"' || replace(obj_name, '.thumb.jpg', '.jpg') || '"%'
  );
$$;

revoke execute on function public.can_read_photo(text) from public, anon;
grant execute on function public.can_read_photo(text) to authenticated;

drop policy "photos: βλέπουν όσοι έχουν πρόσβαση" on storage.objects;

create policy "photos: βλέπουν όσοι έχουν πρόσβαση"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (public.can_read_photo_folder((storage.foldername(name))[1]) or public.can_read_photo(name))
  );
