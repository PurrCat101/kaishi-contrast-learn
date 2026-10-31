# Backend Spec

Stack: Supabase (Postgres + Auth + Storage) + TanStack Start server functions (`createServerFn`) บน Cloudflare/Node ตาม build ปัจจุบัน
หลักการ: **อ่านเนื้อหา = snapshot**, **CRUD ธรรมดา = Supabase client + RLS**, **อะไรที่ต้องคำนวณ FSRS/หลายตาราง = server function + RPC**

## 1. Auth
- Google OAuth, PKCE (ADR-010); server function ทุกตัวที่แตะข้อมูลผู้ใช้อ่าน JWT จาก cookie (`@supabase/ssr`) แล้วสร้าง Supabase client ด้วย token ผู้ใช้ (RLS ทำงาน) — **ห้าม** ใช้ service-role ในเส้นทางที่ผู้ใช้เรียก
- service-role ใช้เฉพาะ `scripts/` (importer) และ job ภายใน; ไม่อยู่ใน `VITE_*`
- ไม่ login: เข้าได้เฉพาะ `GET /api/deck/*` (เนื้อหา); server function ผู้ใช้คืน 401

## 2. Importer (`scripts/`)
1. `import_apkg.py` parse → ตรวจ media manifest (ทำแล้ว) → สร้าง `import_batches` + `source_notes_raw`
2. upsert `vocabulary` ด้วย `(deck_id, source_note_id)`; คำนวณ `reading_key`; `position` = ลำดับ note ในเด็ค (ตรวจว่าตรงกับลำดับ Kaishi เดิม)
3. อัปโหลด media → Storage ด้วย checksum เป็นชื่อไฟล์ (idempotent), เติม `media_assets/vocabulary_media`
4. `select refresh_confusion_pairs(deck_id)`; เพิ่ม `decks.version`
5. รายงานท้ายงาน: จำนวนแถว, จำนวนคู่ตาม kind, media ที่ขาด — fail ถ้ามี media ที่อ้างอิงแต่ไม่พบ
6. sanitize HTML ของ pitch/picture ตอน import (allow-list tag) ห้ามเก็บ `<script>`/event handler

## 3. Content API (public, cacheable)
| Endpoint | หน้าที่ |
|---|---|
| `GET /api/deck/kaishi-1500/snapshot?v={version}` | JSON ทั้งเด็ค (~1,500 รายการ) + `confusions` (คู่ทั้งหมดที่ approved/auto) + media URL; `Cache-Control: public, max-age=31536000, immutable` เพราะ version อยู่ใน URL |
| `GET /api/deck/kaishi-1500/version` | `{version}` (no-cache, ETag) |
Snapshot generate จาก DB ตอน request (cache ระดับ edge/memory ตาม version) — **ไม่มีไฟล์ JSON ใน repo**
รูปร่าง:
```ts
type Snapshot = { version: number; words: Word[]; pairs: { id; a; b; kind; hint? }[] };
type Word = { id; position; word; reading; readingKey; meaning; furigana; sentence; sentenceFurigana; sentenceMeaning;
              pitch; pitchNotes; notes; frequency; audio: {word?; sentence?}; picture? };
```
ค้นหา/กรอง/browse ทำฝั่ง client บน snapshot (1,500 แถว)

## 4. Study API (server functions, ต้อง login)
### 4.1 `getStudyQueue({ limit })`
คืนการ์ดที่ถึงเวลาตามลำดับแบบ Anki:
1. learning/relearning ที่ `due <= now` (เรียงตาม due)
2. review ที่ `due <= end_of_today(user.tz, day_start_hour)` จำกัด `max_reviews_per_day − ทำไปแล้ว`
3. new (recall) ตาม `position` จำกัด `new_per_day − introduced วันนี้` (นับจาก `review_logs.state_before = 0`)
4. contrast ที่ถึงเวลา จำกัด `contrast_per_day` และเฉพาะ `contrast_enabled`
ผสม new ระหว่าง review (ทุก ~N ใบ) ไม่ใช่ต่อท้าย; ข้ามการ์ด `suspended`/`buried_until > now`
**Burying**: ถ้า recall ของคำ X ถูกเลือกวันนี้ ห้ามมี contrast ของ X วันเดียวกัน และห้ามเอาสมาชิกกลุ่มเดียวกันมาติดกัน (spacing ≥ 3 ใบ ถ้าเป็นไปได้)
ตอบกลับ: `{ cards: QueueCard[], counts: { new, learning, review, contrast } }` โดย `QueueCard` มี `cardId, vocabularyId, cardType` และ **ตัวเลือก/ตัวหลอก** สำหรับ contrast (ดู 5)
คิวสร้างจากข้อมูล DB ล่าสุดเสมอ ไม่มี randomness ที่ไม่ผูก seed (seed = `userId + dayKey`) → ผลซ้ำได้เมื่อรีเฟรช

### 4.2 `submitReview({ clientReviewId, cardId, rating, durationMs, contrast? })`
1. โหลด card (RLS) + settings; map เป็น `ts-fsrs` `Card`; `fsrs({ request_retention, enable_short_term: true, learning_steps })`
2. `scheduler.next(card, now, rating)` → card ใหม่ + log
3. contrast: `rating` ถูกกำหนดฝั่ง server จากคำตอบ — ถูก = Good (หรือ Easy ถ้าตอบเร็ว/ตั้งค่า), ผิด = Again; client ส่งแค่ `chosenVocabularyId` (ห้ามเชื่อ `correct` จาก client)
4. เรียก `apply_review` ใน transaction เดียว
5. ถ้าผิด: upsert `user_confusions`; ถ้าผิดตัวเลือกที่ไม่มีใน `confusion_pairs` ก็บันทึกได้ (เป็น `observed` ใหม่)
6. คืน card ใหม่ + `nextIntervals` ของการ์ดถัดไปไม่ต้อง (client ขอเองด้วย 4.3)
Idempotent ด้วย `clientReviewId`

### 4.3 `previewIntervals({ cardId })` → `{ again, hard, good, easy }` เป็นสตริง (`<1m`, `10m`, `3d`, `1.2mo`) คำนวณด้วย scheduler เดียวกับ 4.2 (ไม่เขียน DB)
### 4.4 `undoLastReview()` → เรียก `undo_last_review()`; คืนการ์ดที่ถูกย้อนเพื่อให้ FE แสดงซ้ำ
### 4.5 `cardAction({ cardId, action: 'suspend'|'unsuspend'|'bury'|'forget' })`
### 4.6 `flagConfusion({ vocabularyId, withId })` → upsert `user_confusions(source='manual')` และสร้าง contrast card ถ้ายังไม่มี

## 5. การเลือก/เริ่ม Contrast card
**สร้าง (introduce)** การ์ด `contrast` ให้คำ X เมื่อ X มีเพื่อนบ้านใน `confusion_neighbors` และอย่างใดอย่างหนึ่ง:
- (ก) recall ของ X ถึง state Review และ `stability ≥ 3 วัน` **และ** อย่างน้อย 1 ใบในกลุ่มเคยถูกแนะนำแล้ว (ต้องรู้จักทั้งสองฝั่งก่อน ถึงจะสับสนได้)
- (ข) มี `user_confusions` ของ X หรือผู้ใช้ `flagConfusion`
- (ค) recall ของ X เคย lapse (Again ในสถานะ Review) ≥ 1 ครั้ง และมีเพื่อนบ้านที่เรียนแล้ว
ตัวหลอก (distractors): เพื่อนบ้านของ X ที่ผู้ใช้ **เรียนแล้ว** ก่อน, เรียงตามที่เคยเลือกผิด (`miss_count`) แล้วตามกลุ่ม; ใช้ 2–3 ตัว; ถ้ามีไม่พอ ใช้ 1 ตัว (2 ตัวเลือก) — ต้องมี ≥ 2 ตัวเลือกเสมอ
ตำแหน่งคำตอบสุ่มด้วย seed ต่อการแสดง (ไม่ผูก id)

**รูปแบบคำถาม** (เลือกตาม kind ของคู่ที่เด่นสุด):
| kind | โจทย์ | ตัวเลือก | หมายเหตุ |
|---|---|---|---|
| `homophone` | ความหมาย (EN) หรือประโยคที่เว้นคำ (cloze) | คำเขียนของกลุ่ม | **ห้ามใช้เสียงเป็นโจทย์** (เสียงเหมือนกัน) |
| `homograph_reading` | ประโยคตัวอย่างที่ไฮไลต์คำ | เลือก reading ที่ถูก | แสดง reading หลังตอบ |
| `homograph_sense` | ประโยคตัวอย่าง | เลือกความหมายที่ถูก | |
ทุกรูปแบบเฉลยแล้วต้องแสดงตารางเทียบทุกคำในกลุ่ม (reading, pitch, meaning, sentence, `hint` ถ้า approved)

## 6. My Words / Notes / Settings (CRUD ผ่าน Supabase client + RLS ไม่ต้องมี server function)
- `user_words` upsert/delete ด้วย `(user_id, vocabulary_id)` — ใช้ id ตรงๆ ไม่มี lookup ด้วย word
- `user_settings` update; validate ฝั่ง DB (check constraint) และ UI
- sign out: client ล้าง cache ทั้งหมดของ user

## 7. Stats API — `getStats({ range })`
จาก `review_logs`/`user_cards`: จำนวนรีวิวต่อวัน (แยก recall/contrast), retention จริง (ถูก/ทั้งหมดเฉพาะการ์ด Review), forecast 30 วัน, จำนวนการ์ดตาม state, streak,
และ **confusion stats**: คู่ที่พลาดบ่อยสุด 10 อันดับ, อัตราถูก contrast แยกตาม kind
"Learned" = state Review และ stability ≥ 21 วัน (นิยามเดียวกับ Anki "mature") — แสดงนิยามใน UI

## 8. ข้อผิดพลาด & ความเสถียร
- ทุก server function validate input ด้วย zod; error format `{code, message}`; ห้ามกลืนเงียบ
- `submitReview` ล้มเหลวเพราะเน็ต → FE retry ด้วย `clientReviewId` เดิม
- rate limit ต่อ user (เช่น 10 req/s) บน study endpoints

## 9. Acceptance
- BE-1 `submitReview` ให้ผลเหมือน `ts-fsrs` ตรงๆ ในชุดทดสอบ (golden cases ทุก rating × ทุก state)
- BE-2 queue: ผู้ใช้ใหม่ได้ new = `new_per_day` ใบแรกตาม position; หลัง login ครั้งแรก counts = {20,0,0,0}
- BE-3 วันใหม่เปลี่ยนที่ `day_start_hour` ตาม timezone ผู้ใช้ (ทดสอบข้ามเที่ยงคืน/ DST-free tz)
- BE-4 contrast ผิด → `user_confusions.miss_count` +1, การ์ด contrast เป็น Again, **การ์ด recall ไม่เปลี่ยน**
- BE-5 ยิง `submitReview` ซ้ำ id เดิม → ผลเดิม ไม่มี log ซ้ำ
- BE-6 ไม่มีโค้ดผู้ใช้เรียกที่ใช้ service-role (ตรวจด้วย grep ใน CI)
- BE-7 distractor ไม่เคยเป็นคำที่ผู้ใช้ยังไม่เคยเรียน (ยกเว้น fallback ที่ระบุ) และไม่ซ้ำคำตอบ
