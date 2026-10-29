-- FormLog – 018: φωνητικά μηνύματα στη συνομιλία
-- Τρέξε το ΜΙΑ φορά, μετά το 017: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Προστίθεται η διαδρομή του ήχου (audio) και η διάρκεια (audio_secs) στα μηνύματα.
-- Ο ήχος αποθηκεύεται σε ιδιωτικό χώρο "voice", στον φάκελο της ίδιας συνομιλίας
-- (athlete_id ή group_id), με τους ίδιους κανόνες πρόσβασης με τις φωτογραφίες.

alter table public.messages add column audio text, add column audio_secs smallint;
alter table public.group_messages add column audio text, add column audio_secs smallint;

-- Μήνυμα = κείμενο ή φωτογραφία ή φωνητικό.
alter table public.messages drop constraint messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 4000 and (char_length(btrim(body)) > 0 or photo is not null or audio is not null)
);
alter table public.group_messages drop constraint group_messages_content_check;
alter table public.group_messages add constraint group_messages_content_check check (
  char_length(body) <= 4000 and (char_length(btrim(body)) > 0 or photo is not null or audio is not null)
);

-- Ο ήχος πρέπει να είναι στον φάκελο της ίδιας συνομιλίας (όχι ξένη διαδρομή), και λογική διάρκεια.
alter table public.messages add constraint messages_audio_path_check check (
  audio is null or audio ~ ('^' || athlete_id::text || '/[0-9a-f-]{36}\.(webm|mp4|ogg|m4a)$')
);
alter table public.group_messages add constraint group_messages_audio_path_check check (
  audio is null or audio ~ ('^' || group_id::text || '/[0-9a-f-]{36}\.(webm|mp4|ogg|m4a)$')
);
alter table public.messages add constraint messages_audio_secs_check check (audio_secs is null or audio_secs between 0 and 600);
alter table public.group_messages add constraint group_messages_audio_secs_check check (audio_secs is null or audio_secs between 0 and 600);

-- Από το site μπαίνουν και οι νέες στήλες.
revoke insert on public.messages from authenticated;
grant insert (athlete_id, body, photo, audio, audio_secs) on public.messages to authenticated;
revoke insert on public.group_messages from authenticated;
grant insert (group_id, body, photo, audio, audio_secs) on public.group_messages to authenticated;

-- Χώρος αποθήκευσης "voice": ιδιωτικός, ήχος έως 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice', 'voice', false, 10485760, array[
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/mp4a-latm'
])
on conflict (id) do nothing;

-- Πρόσβαση: 1-1 ο κάτοχος/προπονητής του φακέλου · ομάδα τα μέλη της.
create policy "voice: βλέπουν όσοι έχουν πρόσβαση" on storage.objects for select to authenticated
  using (bucket_id = 'voice' and (public.can_read_photo_folder((storage.foldername(name))[1]) or public.in_group_folder((storage.foldername(name))[1])));
create policy "voice: ανεβάζουν όσοι έχουν πρόσβαση" on storage.objects for insert to authenticated
  with check (bucket_id = 'voice' and (public.can_access_photo_folder((storage.foldername(name))[1]) or public.in_group_folder((storage.foldername(name))[1])));
create policy "voice: σβήνουν όσοι έχουν πρόσβαση" on storage.objects for delete to authenticated
  using (bucket_id = 'voice' and (public.can_access_photo_folder((storage.foldername(name))[1]) or public.in_group_folder((storage.foldername(name))[1])));
