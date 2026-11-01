# Database Spec (PostgreSQL / Supabase)

migration ใหม่: `supabase/migrations/2026XXXX_v2_core.sql` (ยังไม่ apply ที่ไหนเลย จึง **แทนที่** foundation เดิมได้ ถ้ายังไม่มีข้อมูลจริง;
ถ้า apply ไปแล้ว ให้เขียนเป็น migration ต่อท้ายที่ drop/สร้างใหม่) ทุกตารางเปิด RLS ตั้งแต่สร้าง

## 1. ชั้นของข้อมูล

```text
source_*  (service only)  →  content (public read)  →  user_* (owner only)
raw Anki dump                 vocabulary, media,         cards, logs, settings,
                              confusion_pairs            notes, confusions
```

## 2. Source (service role เท่านั้น — RLS เปิด ไม่มี policy)

- `import_batches(id, source, source_version, package_sha256, status, started_at, finished_at, counts jsonb)` unique `(source, source_version, package_sha256)`
- `source_notes_raw(id, import_batch_id, source_note_id bigint, fields jsonb, tags text[])` unique `(import_batch_id, source_note_id)`
- ไม่เก็บ revlog/cards ของ Anki ใน DB นี้ (เก็บใน audit file ของ importer พอ) — ลดตารางที่ไม่ใช้

## 3. Content (select ได้ทุกคน, เขียนได้เฉพาะ service role)

### `decks`
`id uuid pk`, `slug text unique` (`kaishi-1500`), `name`, `version int` (เพิ่มทุกครั้งที่เนื้อหาเปลี่ยน → ใช้เป็น cache key ของ snapshot), `created_at`

### `vocabulary`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid pk | |
| deck_id | uuid fk | |
| source_note_id | bigint | unique `(deck_id, source_note_id)` |
| position | int | ลำดับของเด็ค (ใช้เลือกคำใหม่ตามลำดับ) unique ใน deck |
| word | text not null | |
| reading | text not null | ตามต้นฉบับ |
| reading_key | text not null | **normalized**: NFKC, katakana→hiragana (generated หรือตั้งตอน import) |
| meaning | text not null | |
| word_furigana | text | |
| sentence, sentence_furigana, sentence_meaning | text | |
| pitch_accent | text | ค่า/HTML ที่ sanitize แล้ว |
| pitch_notes, notes | text | nullable |
| frequency | int | nullable |
| raw_fields | jsonb | ฟิลด์ดิบจาก Anki |
Index: `(deck_id, position)`, `(reading_key)`, `(word)`, GIN trigram/tsvector บน `word, reading, meaning` (ใช้ `immutable` function ตามที่แก้ไว้แล้ว)

### `media_assets` + `vocabulary_media`
`media_assets(id, checksum_sha256 unique, mime, bytes, storage_bucket, storage_path)`
`vocabulary_media(vocabulary_id, asset_id, role check in ('word_audio','sentence_audio','picture'), primary key (vocabulary_id, role))`
Bucket `media` = public read, เขียนโดย service role เท่านั้น

### `confusion_pairs`  ← ฟีเจอร์หลัก
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid pk | |
| a_id, b_id | uuid fk vocabulary | **check (a_id < b_id)** เก็บทิศทางเดียว |
| kind | text check in ('homophone','homograph_reading','homograph_sense') | |
| source | text check in ('auto','curated') default 'auto' | |
| hint | text | คำอธิบายความต่าง (pitch ฯลฯ) nullable |
| hint_status | text check in ('none','draft','approved') default 'none' | แสดงเฉพาะ `approved` |
unique `(a_id, b_id, kind)`; index บน `a_id` และ `b_id`

สร้างด้วยฟังก์ชัน `refresh_confusion_pairs(deck_id)` (security definer, เรียกโดย importer):
```sql
-- homophone
insert ... select least(a.id,b.id), greatest(a.id,b.id), 'homophone'
from vocabulary a join vocabulary b on a.deck_id=b.deck_id and a.reading_key=b.reading_key and a.word<>b.word and a.id<b.id;
-- homograph_reading: a.word=b.word and a.reading_key<>b.reading_key
-- homograph_sense:   a.word=b.word and a.reading_key=b.reading_key (a.id<b.id)
on conflict do nothing;  -- ห้ามเขียนทับ hint/curated
```
เพราะ `homophone` กับ `homograph_*` ไม่ทับกัน (word ต่างกับเท่ากัน) จึงไม่มีคู่ซ้ำข้าม kind

View `confusion_neighbors(vocabulary_id, other_id, pair_id, kind, hint)` = union ทั้งสองทิศ เพื่อให้ query ง่าย

## 4. User data (RLS: `using (auth.uid()=user_id) with check (auth.uid()=user_id)` ทุกตาราง)

### `user_settings` (1 แถวต่อ user, สร้างตอน signup ด้วย trigger)
`user_id pk`, `timezone text default 'Asia/Bangkok'`, `day_start_hour int default 4`, `new_per_day int default 20`, `max_reviews_per_day int default 200`,
`desired_retention numeric default 0.90 check (0.7..0.99)`, `learning_steps text[] default '{1m,10m}'`, `audio_autoplay bool default true`,
`show_reading_front bool default false`, `contrast_enabled bool default true`, `contrast_per_day int default 10`

### `user_cards`  (1 แถวต่อ user × vocab × card_type, สร้างตอนเริ่มเรียนคำนั้น)
| คอลัมน์ | ชนิด |
|---|---|
| id uuid pk, user_id, vocabulary_id | |
| card_type | text check in ('recall','contrast') |
| state | smallint (0 New,1 Learning,2 Review,3 Relearning — ตาม ts-fsrs) |
| due timestamptz, stability real, difficulty real | |
| scheduled_days int, learning_steps int, reps int, lapses int, last_review timestamptz | |
| suspended bool default false, buried_until timestamptz | |
| introduced_at timestamptz | |
unique `(user_id, vocabulary_id, card_type)`; index `(user_id, state, due)` where not suspended
*การ์ดไม่ถูกสร้างล่วงหน้าทั้งเด็ค* — new card คือ vocab ที่ยังไม่มี `recall` card ของ user

### `review_logs`  (append-only; ไม่มี update/delete policy สำหรับ client — insert ผ่าน RPC)
`id uuid pk`, `user_id`, `card_id`, `vocabulary_id`, `card_type`, `client_review_id uuid` (unique `(user_id, client_review_id)` = idempotency),
`rating smallint (1..4)`, `state_before smallint`, `due_before`, `stability_before`, `difficulty_before` + `*_after` (เพื่อ undo/optimizer),
`reviewed_at`, `duration_ms int`, `prev_card jsonb` (snapshot การ์ดก่อนตอบ เพื่อ undo),
เฉพาะ contrast: `pair_ids uuid[]` (ตัวเลือกที่แสดง), `chosen_vocabulary_id`, `correct bool`
Index `(user_id, reviewed_at desc)`, `(user_id, card_id, reviewed_at desc)`

### `user_confusions`  (ความสับสนที่สังเกตได้ — ขับเคลื่อน contrast)
`user_id`, `vocabulary_id` (คำที่ถูกถาม), `confused_with_id` (คำที่เลือกผิด/ที่ผู้ใช้ flag), `miss_count int`, `last_at`, `source ('contrast_miss','manual')`
pk `(user_id, vocabulary_id, confused_with_id)`; `confused_with_id` ต้องมีใน `confusion_pairs` กับ `vocabulary_id` **หรือ** เป็น manual (ไม่บังคับ)

### `user_words`  (My Words)
`user_id`, `vocabulary_id`, `saved bool default true`, `note text`, `updated_at`; pk `(user_id, vocabulary_id)`
ลบ = `delete` จริง (ไม่ใช้ soft delete; ประวัติรีวิวไม่เกี่ยว)

## 5. Functions (security invoker เว้นแต่ระบุ)

- `apply_review(p_card jsonb, p_log jsonb, p_confusion jsonb default null)` — ใน transaction เดียว: upsert `user_cards`, insert `review_logs`
  (ON CONFLICT `(user_id,client_review_id)` DO NOTHING → คืนค่าเดิม), upsert `user_confusions` เมื่อ miss; ตรวจ `user_id = auth.uid()`
- `undo_last_review()` — โหลด log ล่าสุดของ user, restore `prev_card`, ลบ log + ลดผลข้างเคียง `user_confusions`; จำกัดย้อนได้ 1 ขั้น/ภายใน 10 นาที
- `study_counts(p_day_start timestamptz)` — new/learning/review เหลือวันนี้ (หัก log ของวันนี้)
- `handle_new_user()` trigger บน `auth.users` → สร้าง `user_settings`

## 6. RLS summary
| ตาราง | anon | authenticated | service |
|---|---|---|---|
| decks, vocabulary, media_*, confusion_pairs | select | select | all |
| source_*, import_batches | ✗ | ✗ | all |
| user_settings, user_words, user_confusions | ✗ | own: all | all |
| user_cards | ✗ | own: select (เขียนผ่าน RPC) | all |
| review_logs | ✗ | own: select (insert ผ่าน RPC) | all |

## 7. Acceptance (ทดสอบได้)
- DB-1 ทุกตารางใน `public` มี `relrowsecurity = true` (query ตรวจใน CI)
- DB-2 import APKG ซ้ำ 2 ครั้ง → `vocabulary` ยัง 1,500 แถว, `confusion_pairs` เท่าเดิม, hint ที่แก้มือไม่หาย
- DB-3 `confusion_pairs` ของ Kaishi: homophone กลุ่ม 55 (ทุกคู่ภายในกลุ่ม), homograph 24 คำ (สอดคล้องรายงานใน README)
- DB-4 anon เขียน `vocabulary` ไม่ได้; user A อ่าน/เขียน `user_cards` ของ user B ไม่ได้ (pgTAP หรือ script ด้วย 2 JWT)
- DB-5 `apply_review` ซ้ำด้วย `client_review_id` เดิม → ไม่เกิด log ซ้ำ
- DB-6 `undo_last_review` คืน `user_cards` เป็นค่าเดิมทุกฟิลด์
