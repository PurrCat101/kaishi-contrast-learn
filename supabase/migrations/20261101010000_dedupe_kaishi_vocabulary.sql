-- Remove the duplicate Kaishi vocabulary rows created by scripts/migrate-kaishi-to-supabase.js.
--
-- The APKG import (id_number 1-1500, source_note_id = Anki note id) already holds
-- every word with audio, images and examples, but has no vocabulary_relations.
-- The script inserted a second copy (id_number 1501-3000, source_note_id =
-- 'kaishi_<n>') and attached all relations to that copy only.
--
-- This migration keeps the APKG rows and, in one transaction:
--   1. maps each duplicate to its original (same word, id_number - 1500),
--   2. copies the relations onto the originals,
--   3. moves any learner data from duplicates to originals (newer row wins on conflict),
--   4. deletes the duplicates.
-- It aborts without changes if the mapping is not exact.

begin;

create temporary table kaishi_dup_map on commit drop as
select dup.id as dup_id, keep.id as keep_id
from public.vocabulary dup
join public.vocabulary keep
  on keep.id_number = dup.id_number - 1500
 and keep.word = dup.word
 and keep.source = 'kaishi'
 and keep.source_note_id !~ '^kaishi_'
where dup.source = 'kaishi'
  and dup.source_note_id ~ '^kaishi_';

do $$
declare
  duplicates integer;
  mapped integer;
begin
  select count(*) into duplicates from public.vocabulary where source = 'kaishi' and source_note_id ~ '^kaishi_';
  select count(*) into mapped from kaishi_dup_map;
  if mapped <> duplicates then
    raise exception 'Aborting: % duplicate rows but only % map to an original', duplicates, mapped;
  end if;
  if (select count(distinct keep_id) from kaishi_dup_map) <> mapped then
    raise exception 'Aborting: several duplicates map to the same original';
  end if;
end;
$$;

-- 2. Relations: re-point both ends at the originals.
insert into public.vocabulary_relations (vocabulary_id, related_vocabulary_id, relation_type, is_directional, confidence, source, source_version)
select a.keep_id, b.keep_id, r.relation_type, r.is_directional, r.confidence, r.source, r.source_version
from public.vocabulary_relations r
join kaishi_dup_map a on a.dup_id = r.vocabulary_id
join kaishi_dup_map b on b.dup_id = r.related_vocabulary_id
where a.keep_id <> b.keep_id
on conflict (vocabulary_id, related_vocabulary_id, relation_type, source) do nothing;

-- 3. Learner data. Where a learner has a row for both copies, keep the more recently updated one.
delete from public.user_vocabulary k using public.user_vocabulary d, kaishi_dup_map m
where m.dup_id = d.vocabulary_id and k.vocabulary_id = m.keep_id and k.user_id = d.user_id and d.updated_at > k.updated_at;
update public.user_vocabulary d set vocabulary_id = m.keep_id from kaishi_dup_map m
where d.vocabulary_id = m.dup_id
  and not exists (select 1 from public.user_vocabulary k where k.user_id = d.user_id and k.vocabulary_id = m.keep_id);

delete from public.user_notes k using public.user_notes d, kaishi_dup_map m
where m.dup_id = d.vocabulary_id and k.vocabulary_id = m.keep_id and k.user_id = d.user_id and d.updated_at > k.updated_at;
update public.user_notes d set vocabulary_id = m.keep_id from kaishi_dup_map m
where d.vocabulary_id = m.dup_id
  and not exists (select 1 from public.user_notes k where k.user_id = d.user_id and k.vocabulary_id = m.keep_id);

delete from public.user_vocabulary_state k using public.user_vocabulary_state d, kaishi_dup_map m
where m.dup_id = d.vocabulary_id and k.vocabulary_id = m.keep_id and k.user_id = d.user_id and d.updated_at > k.updated_at;
update public.user_vocabulary_state d set vocabulary_id = m.keep_id from kaishi_dup_map m
where d.vocabulary_id = m.dup_id
  and not exists (select 1 from public.user_vocabulary_state k where k.user_id = d.user_id and k.vocabulary_id = m.keep_id);

delete from public.user_fsrs_state k using public.user_fsrs_state d, kaishi_dup_map m
where m.dup_id = d.vocabulary_id and k.vocabulary_id = m.keep_id and k.user_id = d.user_id and k.dimension = d.dimension and d.updated_at > k.updated_at;
update public.user_fsrs_state d set vocabulary_id = m.keep_id from kaishi_dup_map m
where d.vocabulary_id = m.dup_id
  and not exists (select 1 from public.user_fsrs_state k where k.user_id = d.user_id and k.vocabulary_id = m.keep_id and k.dimension = d.dimension);

-- No uniqueness on these, so every row moves.
update public.review_history set vocabulary_id = m.keep_id from kaishi_dup_map m where review_history.vocabulary_id = m.dup_id;
update public.review_history set related_vocabulary_id = m.keep_id from kaishi_dup_map m where review_history.related_vocabulary_id = m.dup_id;
update public.vocabulary_enrichment set vocabulary_id = m.keep_id from kaishi_dup_map m where vocabulary_enrichment.vocabulary_id = m.dup_id;

-- 4. Delete the duplicates. Their readings, examples and leftover (older, conflicting) learner rows cascade.
delete from public.vocabulary where id in (select dup_id from kaishi_dup_map);

-- Post-checks: nothing duplicated remains and the originals now carry the relations.
do $$
begin
  if exists (select 1 from public.vocabulary where source = 'kaishi' and source_note_id ~ '^kaishi_') then
    raise exception 'Duplicates remain after cleanup';
  end if;
  if (select count(*) from public.vocabulary_relations) = 0 then
    raise exception 'No relations survived the migration';
  end if;
  if exists (select 1 from public.vocabulary_relations r join public.vocabulary v on v.id = r.vocabulary_id where v.source_note_id ~ '^kaishi_') then
    raise exception 'Relations still point at duplicate rows';
  end if;
end;
$$;

commit;
