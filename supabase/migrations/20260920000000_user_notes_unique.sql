create unique index if not exists user_notes_user_vocabulary_idx
  on public.user_notes (user_id, vocabulary_id);
