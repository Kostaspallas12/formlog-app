-- FormLog – 014: διόρθωση δημιουργίας ομάδας
-- Τρέξε το ΜΙΑ φορά, μετά το 013: Supabase → SQL Editor → New query → επικόλληση → Run.
--
-- Ο προπονητής βλέπει την ομάδα του ελέγχοντας απευθείας τη στήλη coach_id. Αλλιώς, τη στιγμή
-- της δημιουργίας η νέα ομάδα δεν «φαίνεται» ακόμα και η βάση απέρριπτε τη δημιουργία.
drop policy "groups: βλέπουν προπονητής και μέλη" on public.groups;
create policy "groups: βλέπουν προπονητής και μέλη" on public.groups
  for select to authenticated using (coach_id = (select auth.uid()) or public.in_group(id));
