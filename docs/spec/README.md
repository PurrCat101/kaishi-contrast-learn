# Spec v2 — Kaishi SRS + Homophone/Homograph Contrast

สถานะ: DRAFT พร้อม implement
ไฟล์: [`database.md`](database.md) · [`backend.md`](backend.md) · [`frontend.md`](frontend.md)

## 1. แนวคิด

1. **ฐานคือคลอนของ Anki**: เด็ค Kaishi 1.5k อยู่ใน DB พร้อมใช้ตั้งแต่ผู้ใช้เปิดแอป ผู้ใช้เรียนแบบ Anki
   (new / learning / review, ปุ่ม Again–Hard–Good–Easy พร้อมแสดงช่วงเวลา, วันละกี่ใบ, undo, suspend, browse, stats) ใช้ FSRS (`ts-fsrs`)
2. **สิ่งที่เพิ่มจาก Anki (จุดขาย)** แก้ pain point 2 อย่าง:
   - **พ้องเสียง (homophone)** — เขียนต่างกัน อ่านเหมือนกัน เช่น かみ = 髪 / 神 / 紙
   - **พ้องรูป (homograph)** — เขียนเหมือนกัน แต่อ่านหรือความหมายต่างกัน เช่น 人 = ひと / じん, 聞く = hear / ask
   ระบบ **ตรวจจับคู่เหล่านี้จากข้อมูลเด็คอัตโนมัติ**, เตือนตอนเรียน, และมี **Contrast card** แยก state จากการ์ดปกติ
3. เนื้อหาทั้งหมดมาจาก DB (APKG เป็นแค่ import source — ADR-001/007) ไม่มี JSON ที่ bundle แยก ไม่มีข้อมูลปลอม

## 2. ข้อมูลจริงของเด็ค (จาก `src/data/kaishi.json`, ต้อง regenerate จาก DB ตอน implement)

| รายการ | จำนวน |
|---|---|
| โน้ตทั้งหมด | 1,500 |
| กลุ่มพ้องเสียง (reading เดียวกัน, ≥2 คำเขียนต่างกัน) | 55 กลุ่ม / 116 คำ |
| เขียนซ้ำกัน (พ้องรูป) | 24 คำ — 12 คำอ่านต่างกัน (เช่น 人), 12 คำอ่านเหมือนกันแต่ความหมายต่าง (เช่น 聞く) |

→ จำนวนน้อยพอที่ **คัดกรองด้วยมือเพิ่มได้** (curated hints) และไม่ต้องใช้ AI ใน MVP
(หมายเหตุ: ข้อมูล `sharedKanji` / `similarMeaning` เดิมไม่ใช้สร้าง contrast — ดูหัวข้อ 5)

## 3. Invariants

- I1 เนื้อหาอ่านจาก DB เท่านั้น; client ได้ผ่าน snapshot ที่ generate จาก DB (ดู backend §3)
- I2 identity ของคำ = `vocabulary.id` (uuid) ไม่ใช่ตัวอักษรคำ
- I3 ผู้ใช้ใหม่เห็นทุกตัวเลข = 0; ไม่มี demo seed ใน production
- I4 ตารางเนื้อหา read-only สำหรับ client; ตารางผู้ใช้ RLS `auth.uid() = user_id`; ตาราง `source_*` ไม่เปิด client
- I5 FSRS ใช้ `ts-fsrs` เท่านั้น
- I6 Contrast card ไม่แก้ state ของ Recall card (และกลับกัน)
- I7 Recall card ห้ามมีเสียง/reading ก่อนเฉลย (ADR-004)

## 4. ขอบเขต

| MVP | ภายหลัง |
|---|---|
| Google login, ผู้ใช้ต้อง login เพื่อเรียน (ดูคำได้ไม่ต้อง login) | Offline / PWA |
| Recall card แบบ Anki + undo/suspend/bury | Reading/Context card |
| ตรวจจับพ้องเสียง/พ้องรูป + hint บนการ์ด + Contrast card | AI สร้างคำอธิบายความต่าง |
| Browse + search + My Words/โน้ต | คำศัพท์ที่ผู้ใช้เพิ่มเอง, import deck อื่น |
| Stats พื้นฐาน + confusion stats | Export, FSRS optimizer |
| Settings ขั้นต่ำ | ภาษา UI อื่น |

## 5. นิยามการ "สับสน" (ใช้ทั้ง 3 ชั้น)

| kind | นิยาม | ตัวตัดสิน |
|---|---|---|
| `homophone` | `reading_key` เท่ากัน, `word` ต่างกัน | อัตโนมัติ |
| `homograph_reading` | `word` เท่ากัน, `reading_key` ต่างกัน | อัตโนมัติ |
| `homograph_sense` | `word` และ `reading_key` เท่ากัน, ความหมายต่างกัน | อัตโนมัติ |
| `observed` | ผู้ใช้เลือกผิดสลับคู่ใน Contrast card หรือกด "I mix these up" | เฉพาะผู้ใช้คนนั้น |

`curated` hint (ข้อความอธิบายความต่าง, เช่น pitch accent) แนบกับคู่ใดก็ได้ แต่ไม่ใช่ kind
**ไม่ใช้** shared-kanji หรือ similar-meaning สร้าง contrast อัตโนมัติ (กว้างเกินไป: 78% ของเด็ค)

## 6. ลำดับ implement

1. DB: migration v2 + RLS + tests (database.md) → import APKG + media → generate `confusion_pairs`
2. BE: snapshot endpoint, queue, `submitReview`, undo, settings (backend.md)
3. FE: เสียบ snapshot, หน้า Review แบบ Anki, ค่อยเพิ่มชั้น confusion (frontend.md)
4. ลบ `src/lib/srs.ts` (ของเดิม), `library.ts`, `src/data/kaishi.json` เมื่อ FE ใหม่ใช้ DB ครบ

## 7. ADR ที่เพิ่ม

- ADR-011 DB คือ source of truth เดียว; client ใช้ snapshot ที่มี version
- ADR-012 Contrast ตรวจจับจาก reading_key/word ของเด็ค ไม่ใช้ shared-kanji
- ADR-013 State ของ FSRS แยกตาม `card_type` (`recall`, `contrast`)
- ADR-014 การคำนวณ FSRS ทำฝั่ง server (TypeScript) แล้วเขียนผ่าน RPC แบบ transaction

## 8. คำถามที่ยังเปิด (มีค่า default แล้ว เปลี่ยนได้)

- ผู้ใช้ต้อง login ก่อนเรียน (default) — ถ้าอยากให้ guest เรียนได้ต้องเพิ่ม merge logic
- คำเพิ่มมือ 橋/箸/端 เดิม: **ไม่อยู่ในเด็ค** (ไม่ใช่ Kaishi) ใส่เป็น curated hint เฉพาะถ้าคำนั้นมีอยู่ในเด็คจริง
