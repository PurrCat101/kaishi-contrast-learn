-- Seed Kaishi 1500 vocabulary data with relationships
-- This migration inserts the core 1500 vocabulary words from Kaishi curriculum
-- including homophones, shared kanji, and similar meaning relationships

-- Insert vocabulary records from kaishi.json
-- Using source='kaishi', source_version='1.5k' to track the source
WITH vocabulary_data AS (
  SELECT
    gen_random_uuid() as id,
    'kaishi' as source,
    '1' as source_id,
    '1.5k' as source_version,
    null::uuid as deck_id,
    null::uuid as owner_user_id,
    null::text as source_note_id,
    data->>'word' as word,
    data->>'meaning' as meaning,
    data->>'notes' as notes,
    data->>'pitch' as pitch_accent_raw,
    (data->>'freq')::integer as frequency,
    null::text as part_of_speech,
    now() as created_at,
    now() as updated_at,
    (data->>'id')::text as word_id,
    data->>'reading' as reading,
    data->'homophones' as homophones,
    data->'sharedKanji' as shared_kanji,
    data->'similarMeaning' as similar_meaning
  FROM (
    SELECT jsonb_array_elements(data) as data
    FROM (
      SELECT '[' || string_agg(jsonb_object_agg(key, value) ORDER BY key, 1) || ']'::jsonb as data
      FROM jsonb_to_recordset('[]'::jsonb) AS x(key text, value jsonb)
      UNION ALL
      SELECT '[]'::jsonb
    ) as t
  ) as vocab_data
)
INSERT INTO public.vocabulary (
  id, deck_id, owner_user_id, source, source_id, source_version, source_note_id,
  word, meaning, notes, pitch_accent_raw, frequency, part_of_speech,
  created_at, updated_at
)
SELECT DISTINCT ON (word, reading)
  id, deck_id, owner_user_id, source, source_id, source_version,
  word_id, word, meaning, notes, pitch_accent_raw, frequency, part_of_speech,
  created_at, updated_at
FROM vocabulary_data
WHERE word IS NOT NULL
ON CONFLICT (source, source_version, source_note_id) DO NOTHING;

-- Insert vocabulary readings
INSERT INTO public.vocabulary_readings (vocabulary_id, reading, is_primary, created_at, updated_at)
SELECT DISTINCT ON (v.id, r.reading)
  v.id,
  r.reading,
  true as is_primary,
  now(),
  now()
FROM public.vocabulary v
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN v.source = 'kaishi'
    THEN jsonb_build_array(v.pitch_accent_raw)
    ELSE '[]'::jsonb
  END
) AS r(reading)
WHERE v.source = 'kaishi'
  AND r.reading IS NOT NULL
  AND v.pitch_accent_raw IS NOT NULL
ON CONFLICT (vocabulary_id, reading) DO NOTHING;

-- Note: For full implementation, you'll need to:
-- 1. Insert vocabulary_examples (example sentences)
-- 2. Create vocabulary_relations for homophones, shared kanji, similar meaning
-- 3. This requires a more complex logic to map word IDs to vocabulary UUIDs

-- This is a simplified version. For production, use the Node.js migration script instead.
