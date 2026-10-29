-- FormLog – 012: φωτογραφίες στη συνομιλία
-- Τρέξε το ΜΙΑ φορά, μετά το 011: Supabase → SQL Editor → New query → επικόλληση → Run.

-- Η φωτογραφία ενός μηνύματος (διαδρομή στο Storage). Μπαίνει στον φάκελο του αθλούμενου,
-- οπότε τη βλέπουν μόνο ο αθλούμενος και ο προπονητής του (οι ίδιοι κανόνες με τις καταγραφές).
alter table public.messages add column photo text;

-- Μήνυμα = κείμενο ή φωτογραφία (ή και τα δύο: φωτογραφία με λεζάντα).
alter table public.messages drop constraint messages_body_check;
alter table public.messages alter column body set default '';
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 4000 and (char_length(btrim(body)) > 0 or photo is not null)
);
-- Η φωτογραφία πρέπει να είναι στον φάκελο της ίδιας συνομιλίας (όχι ξένη διαδρομή).
alter table public.messages add constraint messages_photo_path_check check (
  photo is null or photo ~ ('^' || athlete_id::text || '/[0-9a-f-]{36}\.jpg$')
);

revoke insert on public.messages from authenticated;
grant insert (athlete_id, body, photo) on public.messages to authenticated;
