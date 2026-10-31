# Product Spec v2 (DRAFT — รอการยืนยัน)

สถานะ: ร่างหลัง audit วันที่ 2026-10-31 (`docs/audit-2026-10-31.md`)
เป้าหมายของเอกสารนี้คือ **สั้นพอที่จะตรวจสอบได้** — `Backend_Specification_Updated.md` ยังเป็นเอกสารอ้างอิงรายละเอียด
แต่ถ้าขัดกับไฟล์นี้ ให้ยึดไฟล์นี้หลังจากที่ยืนยันแล้ว
ทุกข้อใช้ MUST / SHOULD และมี acceptance check ที่ทดสอบได้

## 1. ผลิตภัณฑ์ในหนึ่งย่อหน้า

แอปเรียนคำศัพท์ภาษาญี่ปุ่นจากเด็ค Kaishi 1.5k ด้วย spaced repetition ที่ **แยกการวัด 2 อย่าง**:
(1) Recall — จำคำนี้ได้ไหม, (2) Discrimination — แยกคำนี้ออกจากคำที่หน้าตา/เสียง/ความหมายคล้ายกันได้ไหม
จุดขายคือ contrast card ที่ขับเคลื่อนด้วยความสับสนจริงของผู้ใช้ ไม่ใช่รายการคำคล้ายแบบสุ่ม

## 2. หลักการ (invariants)

- **I1 Source of truth เดียว**: เนื้อหาคำศัพท์อ่านจากฐานข้อมูลเท่านั้น (หรือ snapshot ที่ build จากฐานข้อมูลนั้น
  โดยมี ID ตัวเดียวกัน) ห้ามมีชุดข้อมูลที่ bundle แยกกับ DB ซึ่งต้อง map ด้วยตัวอักษรคำ
- **I2 Identity ของคำ = id คงที่** (ไม่ใช่ `word`) เพราะมี 24 คำที่เขียนซ้ำกัน (ADR-007)
- **I3 ไม่มีข้อมูลปลอมใน production**: demo seed ต้องอยู่หลัง flag เฉพาะ dev และต้องไม่ถูกบันทึกเป็นข้อมูลผู้ใช้
- **I4 ข้อมูลผู้ใช้ผูกบัญชี** และป้องกันด้วย RLS; ตาราง shared เป็น read-only สำหรับ client
- **I5 ใช้ FSRS ที่มีคนดูแล** (`ts-fsrs`) ห้ามสูตรเขียนเอง (ADR-003)
- **I6 ความสับสนเกิดจากหลักฐาน**: คู่ที่ถือว่า "confusable" ต้องมี source ระบุชัด (homophone จากเด็ค, curated, หรือ
  สังเกตจากความผิดพลาดของผู้ใช้) ไม่ใช่แค่ใช้ kanji ร่วมกัน

## 3. ขอบเขต MVP

| อยู่ใน MVP | ไม่อยู่ใน MVP |
|---|---|
| ดู/ค้นหาคำ (ไม่ต้อง login) | AI enrichment (Task 10) |
| Login ด้วย Google | คำศัพท์ที่ผู้ใช้สร้างเอง (spec §12) |
| My Words + โน้ต, sync ข้ามอุปกรณ์ | Export (Task 15) |
| Review: Recall card + Contrast card | Reading/Context card, ปรับ per-card |
| Today, Progress (ข้อมูลจริงเท่านั้น) | Personalization (spec §31) |
| Settings ขั้นต่ำ: new/day, audio autoplay, ซ่อน/แสดง reading | |

## 4. ข้อกำหนดเชิงฟังก์ชัน

### 4.1 เนื้อหา & ข้อมูล
- F1 Import APKG → DB แบบ idempotent ด้วย `(source, source_version, source_note_id)`; รัน 2 ครั้งต้องได้จำนวนแถวเท่าเดิม
- F2 RLS: ตาราง shared เปิด RLS + `select` สาธารณะเฉพาะตารางเนื้อหา; `source_*`, `import_*` ไม่เปิดให้ client; เขียนได้เฉพาะ service role
- F3 ความสัมพันธ์ (`vocabulary_relations`) มีฟิลด์ `source` (`deck|curated|user_observed`) และ `kind` (`homophone|similar_meaning|look_alike|antonym`)
  `shared_kanji` **ไม่ใช่** relation ที่ใช้สร้าง contrast card โดยอัตโนมัติ
- F4 คำที่เพิ่มด้วยมือ (เช่น 橋/箸/端) ต้องเข้า DB ผ่าน seed script ที่มี provenance ไม่ใช่ hard-code ใน frontend

### 4.2 บัญชี & การเก็บข้อมูล
- F5 Guest ดู/ค้นหาคำได้; กด Start Review แล้วขอ login (spec §4.4) — *หรือ* ตัดสินใจให้ guest ใช้ local ได้ (ดู D3)
- F6 เมื่อ login ครั้งแรก: ข้อมูล local ที่มีอยู่ **ต้อง merge ขึ้นบัญชี** ไม่ใช่ถูกเขียนทับ; sign out ต้องล้าง cache ของผู้ใช้
- F7 ความล้มเหลวของการ sync ต้องแสดงให้ผู้ใช้เห็น และ retry ได้ (ห้ามกลืนเงียบ)

### 4.3 Scheduling
- F8 ใช้ `ts-fsrs`; `desired_retention` มาจาก `user_settings`
- F9 state แยก 2 มิติต่อคำ: `recall` และ `discrimination` (`user_fsrs_state.dimension`)
- F10 ทุกการตอบสร้างแถว `review_history` (append-only) พร้อม `dimension`, rating, เวลา, และ `related_vocabulary_id` เมื่อเป็น contrast
- F11 วันเริ่มต้นที่ 04:00 ตาม timezone ผู้ใช้ (เก็บใน settings); new/day ตามที่ตั้งค่า นับจาก `review_history` ไม่ใช่จาก `reps`

### 4.4 Review
- F12 คิวสร้างจาก state ที่ **โหลดเสร็จแล้ว** เท่านั้น; สร้างครั้งเดียวต่อ session; ไม่ใช้ `Math.random` ตอน render
- F13 Recall card: ก่อนเฉลย **ห้ามมีเสียงหรือ reading** (ADR-004); หลังเฉลย autoplay ตาม setting
- F14 Contrast card สร้างเมื่อคำนั้นมี relation ที่ถูกต้อง **และ** (เคยตอบผิดสลับกับคำนั้น หรือ discrimination state ถึงกำหนด)
  ตอบแล้วอัปเดต `discrimination` ของคำที่ถูกถาม และ (ถ้าผิด) บันทึกคู่ที่เลือกผิด; ไม่แก้ `recall` state
- F15 ลำดับตัวเลือกสุ่มจริงต่อการแสดงผล (ไม่ deterministic ตาม id)
- F16 ห้ามแสดงคำที่เกี่ยวข้องกันติดๆ กันโดยไม่จำเป็น (spec §23)

### 4.5 Today / Progress
- F17 ตัวเลขทุกตัวคำนวณจาก `review_history` + FSRS state จริง; ผู้ใช้ใหม่เห็น 0
- F18 "Learned" นิยามชัด (เช่น state=review และ stability ≥ N วัน) และเขียนไว้ใน UI
- F19 ปุ่ม reset ต้องลบข้อมูลของผู้ใช้จริง พร้อมยืนยัน ไม่ใช่ re-seed

## 5. Non-functional

- N1 `tsc --noEmit`, `eslint`, `vitest` ผ่านใน CI ทุก PR; line ending ถูกบังคับด้วย `.gitattributes`
- N2 SSR/CSR render ตรงกัน (ไม่มี hydration warning ในหน้า Today/Review/Progress)
- N3 หน้าคำศัพท์ 1,500 คำค้นหาได้ลื่น (< 100 ms ต่อการพิมพ์) และมี pagination/virtual list
- N4 ห้าม service-role key อยู่ใน bundle (ตรวจด้วย grep ใน CI)

## 6. Open decisions (ต้องการคำตอบจากคุณ)

| # | คำถาม | ตัวเลือก | คำแนะนำ |
|---|---|---|---|
| D1 | เนื้อหาคำศัพท์อ่านจากไหน | (a) Supabase ตอน runtime (b) snapshot JSON ที่ generate จาก DB, user data อยู่ DB | (b) — เร็ว ทำงาน offline/SSR ง่าย; แต่ต้องใช้ UUID/ID ที่ stable เดียวกับ DB |
| D2 | ID ที่ frontend ใช้ | `vocabulary.id` (uuid) หรือเพิ่มคอลัมน์ `legacy_id int` | ใช้ uuid ใน snapshot, ทำ migration map จาก id 1..1500 ครั้งเดียว |
| D3 | Guest ใช้ review ได้ไหม | login ก่อน (ตรง spec) หรือ local ได้แล้ว merge ภายหลัง | login ก่อน — ลดความซับซ้อน merge และตรง spec §4.4 |
| D4 | ความสับสนที่ใช้ทำ contrast | homophone + curated + observed เท่านั้น หรือรวม similar_meaning | เริ่มที่ homophone + curated + observed แล้วค่อยเพิ่ม |
| D5 | 橋/箸/端 ฯลฯ (extras) | อยู่ใน deck หลัก หรือแยกเป็น "Contrast pack" | แยกเป็น pack + provenance เพื่อไม่ปนกับ "Kaishi 1.5k" |
| D6 | สื่อ (เสียง/รูป) | ใช้ไฟล์จาก APKG ผ่าน Supabase Storage หรือใช้ TTS | ใช้ไฟล์ APKG (เสียงเจ้าของภาษา) + TTS เป็น fallback |

## 7. แผนงานที่เสนอ (ตามลำดับ ไม่รอ spec ทั้งหมด)

0. **Hotfix**: migration เปิด RLS ตาราง shared/source (F2) — ไม่มีข้อโต้แย้ง ทำได้ทันที
1. ยืนยัน D1–D6 → ปรับไฟล์นี้เป็น v2 final และ archive ส่วนที่ล้าสมัยของ Backend spec
2. Foundation: `tsc` เขียวขึ้น, `.gitattributes` + prettier ทั้ง repo, ตั้ง vitest, CI
3. ข้อมูล: apply migration, รัน upload, generate snapshot (D1/D2), ย้าย `library.ts` ไป ID ใหม่ + merge policy (F6)
4. Engine: `ts-fsrs` + สอง dimension + `review_history` + test ครอบ queue/scheduler (F8–F12)
5. UI: Review/Contrast ตาม F13–F16, Today/Progress ข้อมูลจริง, ลบ demo seed (I3)
6. Settings, E2E, production audit
