# Frontend Spec

Stack เดิม: TanStack Start + Router + React + Tailwind + shadcn/ui, เพิ่ม TanStack Query (มีใน deps แล้ว) เป็นตัวจัดการข้อมูลฝั่ง server
หลักการ: ไม่มี store ที่เก็บข้อมูลผู้ใช้เองใน localStorage; ข้อมูลผู้ใช้ = server state ผ่าน Query; มีแค่ cache snapshot เนื้อหา

## 1. Routes
| Path | หน้า | login |
|---|---|---|
| `/` | Today: นับ New/Learning/Review/Contrast, ปุ่ม Study, streak | ต้อง (guest เห็น landing + ปุ่ม Sign in) |
| `/study` | หน้าเรียน (Anki-style) | ต้อง |
| `/words` | Browse/ค้นหา เด็คทั้งหมด + ตัวกรอง | ไม่ต้อง |
| `/words/$id` | รายละเอียดคำ + ส่วน Confusables | ไม่ต้อง (ปุ่ม save ต้อง login) |
| `/confusables` | รายการกลุ่มพ้องเสียง/พ้องรูป ทั้งเด็ค | ไม่ต้อง |
| `/my-words` | คำที่บันทึก + โน้ต | ต้อง |
| `/stats` | สถิติ + confusion stats | ต้อง |
| `/settings` | ตั้งค่า | ต้อง |
Route ที่ต้อง login ใช้ `beforeLoad` redirect + ข้อความ "Sign in to save your progress" (ตรง spec เดิม §4.4)

## 2. ข้อมูล & state
- `useDeck()` : โหลด `/api/deck/.../version` → ถ้าต่างจาก IndexedDB/localStorage cache ให้ดึง snapshot ใหม่; สร้าง index ใน memory: `byId`, `byReadingKey`, `byWord`, `neighbors(id)` จาก `pairs`
- ค้นหา: บน snapshot ฝั่ง client — รองรับ kanji / kana (hira↔kata เท่ากัน) / romaji / ความหมาย; debounce 150ms; แสดงทีละหน้า (virtual list หรือโหลดเพิ่ม) ไม่ตัดที่ 120 เงียบๆ
- Query keys: `['queue']`, `['counts']`, `['stats',range]`, `['settings']`, `['userWords']`; invalidate หลัง `submitReview`/undo
- SSR: หน้าเนื้อหา SSR ได้; หน้าผู้ใช้ render skeleton จน session พร้อม — ห้ามใช้ `Date.now()`/`Math.random()` ใน render (คำนวณใน effect/loader)
- Auth state เดียวทั้งแอป (context); `onAuthStateChange` → invalidate queries ทั้งหมด; sign out → `queryClient.clear()`

## 3. หน้า Study (หัวใจ)
### State machine (ต่อการ์ด)
```text
loading → front → (reveal) → back → (rate) → submitting → next/front | done
                                   ↘ undo ↗
```
- หน้า front ของ **Recall card**: แสดง `word` + (ถ้าตั้งค่าไว้) ประโยค**ไม่มี furigana**; **ไม่มีปุ่มเสียง, ไม่มี reading** (I7)
  ปุ่ม `Show answer` (Space/Enter)
- หลัง reveal: reading, meaning, ภาพ, furigana ของประโยค, pitch, โน้ต, เสียง (autoplay ตาม settings, ปุ่ม Listen เสมอ)
  4 ปุ่ม Again/Hard/Good/Easy พร้อมช่วงเวลา (`previewIntervals`, prefetch ตอนแสดง front)
  **แถบ Confusion** (ถ้าคำมีคู่): "⚠ พ้องเสียงกับ 髪 · 紙" / "⚠ เขียนเหมือน 人 (じん)" + ลิงก์ย่อ พร้อม hint ถ้ามี; ปุ่ม `I mix these up` (→ `flagConfusion`)
- **Contrast card**: ตาม backend §5 — โจทย์ + 2–3 ตัวเลือก (ปุ่มใหญ่, เลือกด้วย 1/2/3 ได้)
  ตอบแล้วล็อกตัวเลือก ไฮไลต์ถูก/ผิด แล้วแสดง **ตารางเทียบ** (word · reading · pitch · meaning · sentence · hint) → ปุ่ม Continue (ไม่มี 4 ปุ่ม — rating มาจากคำตอบ)
  ป้าย "Contrast · พ้องเสียง/พ้องรูป" ชัดเจน; เสียงเล่นหลังตอบเท่านั้น
- Shortcut: `Space` reveal/Good, `1–4` rating, `Z` undo, `S` suspend, `B` bury, `R` replay audio, `Esc` ออก (ยืนยัน)
- Header: ความคืบหน้า + ตัวนับ N/L/R แบบ Anki (สีแยก; ใบปัจจุบันขีดเส้นใต้)
- Undo: ปุ่ม + Z ย้อนการ์ดล่าสุดแล้วแสดงการ์ดนั้นอีกครั้ง
- ออฟไลน์/ล้มเหลว: แสดง toast + ปุ่ม retry, ไม่ข้ามการ์ดจนกว่าบันทึกสำเร็จ (ส่ง `clientReviewId` เดิม)
- เสร็จคิว: สรุป (จำนวน, Again, contrast ถูก/ผิด, คู่ที่พลาด) + ปุ่มไปหน้า Stats / เรียนเพิ่ม (extra new ได้ 10 ใบ)

## 4. Confusion UI นอกหน้า Study
- `/words/$id`: ส่วน **Confusables** แยก 3 บล็อก: พ้องเสียง / พ้องรูป (อ่านต่าง) / พ้องรูป (ความหมายต่าง) เฉพาะที่มีข้อมูล; แต่ละรายการเป็น mini-card
  (word, reading, pitch, meaning, 1 ประโยค) + hint; ถ้าไม่มี ไม่แสดงบล็อกว่าง
- `/confusables`: กรองตาม kind, ค้นหา, เรียงตามจำนวนสมาชิก/ตามที่ผู้ใช้พลาดบ่อย; แต่ละกลุ่มเปิดดูตารางเทียบได้; ปุ่ม "Practice this group" (สร้าง contrast session เฉพาะกลุ่ม ไม่กระทบตารางเวลา FSRS ยกเว้นกดบันทึก — ถ้ายากเกินให้ตัดออกจาก MVP)
- `/words` filter: `Homophone`, `Homograph`, `Studied`, `New`, `Saved`; badge เล็กในรายการ
- **ห้ามใช้ shared-kanji / similar-meaning** เป็น badge "confusable" (ADR-012)

## 5. หน้าอื่น
- **Today**: การ์ดตัวเลข 4 ช่อง (New/Learning/Review/Contrast) จาก `counts`; ผู้ใช้ใหม่เห็น 0 และข้อความ "Start your first 20 words"; ไม่มีเวลาคาดคะเนแบบ hard-code (ใช้ค่าเฉลี่ย `duration_ms` จริง ถ้ามีข้อมูล ≥ 20 ใบ)
- **My Words**: ค้นหา, แก้โน้ตแบบ autosave (debounce + แสดงสถานะ Saved/Saving/Error), ลบมีการยืนยัน
- **Stats**: reviews/day (stack recall/contrast), forecast, retention จริง vs เป้าหมาย, card counts ตาม state, streak heatmap, **Confusion**: top 10 คู่ที่พลาด, accuracy ตาม kind, ปุ่ม "Practice these"
  ทุกตัวเลขต้องมี tooltip นิยาม; ไม่มีข้อมูล → empty state ไม่ใช่เลข 0 ที่ดูเหมือนข้อมูล
- **Settings**: new/day, max reviews, desired retention (มีคำเตือนช่วง), learning steps, day start hour + timezone, audio autoplay, ซ่อน/แสดง reading ด้านหน้า (default ซ่อน), contrast on/off + ต่อวัน; ปุ่ม Reset progress (ยืนยันพิมพ์คำ) ลบเฉพาะ `user_cards/review_logs/user_confusions` ของผู้ใช้
- ไม่มีปุ่ม "Reset demo data"

## 6. Components หลัก
`StudyCard`, `RecallFront`, `RecallBack`, `ContrastQuestion`, `ContrastReveal` (ตารางเทียบ), `RatingBar`, `CountsBar`, `ConfusionBanner`, `ConfusableGroup`,
`WordRow`, `AudioButton` (ห้าม autoplay เว้น prop `allowAutoplay` ที่ส่งมาเฉพาะหลัง reveal), `Furigana`, `PitchDiagram` (จาก `pitch_accent`), `SearchBox`
ใช้ `src/components/ui/*` เดิม; ธีม/ui-kit เดิมใช้ต่อได้

## 7. Accessibility & UX
- ทุกปุ่มมี label; reading/furigana ใช้ `<ruby>`; `lang="ja"` กับข้อความญี่ปุ่น
- ใช้งานด้วยคีย์บอร์ดครบ; focus ย้ายไปปุ่ม rating หลัง reveal; `prefers-reduced-motion` ปิดแอนิเมชัน
- สี (ถูก/ผิด) ต้องมีไอคอน/ข้อความกำกับ ไม่พึ่งสีอย่างเดียว
- มือถือเป็นหลัก: ปุ่ม rating อยู่ติดล่าง (thumb zone), ขนาด ≥ 44px

## 8. สิ่งที่ต้องลบ/แทนที่
`src/lib/srs.ts`, `src/lib/library.ts`, `src/data/kaishi.json`, `extras` ใน `src/lib/vocab.ts`, routes `review/progress` เดิม (ย้ายเป็น `study/stats`)
`src/lib/vocab.ts` เหลือเฉพาะ helper (parseFurigana, speak fallback) + ฟังก์ชันสร้าง index จาก snapshot

## 9. Acceptance
- FE-1 ผู้ใช้ใหม่: Today = New 20 / อื่น 0, Stats ว่างพร้อม empty state, ไม่มีข้อมูลปลอม
- FE-2 เปิด `/study` ตรงๆ หรือรีเฟรช → คิวตรงกับ DB เสมอ ไม่มี hydration warning
- FE-3 Recall front: ไม่มีปุ่มเสียงและไม่มี reading ใน DOM จนกว่าจะ reveal (test ด้วย Playwright)
- FE-4 กลุ่ม かみ (髪/神/紙): หน้า detail ของแต่ละคำแสดงอีกสองคำใน "พ้องเสียง"; 人 แสดงรายการ じん ใน "พ้องรูป"
- FE-5 Contrast: ตอบผิด → เห็นตารางเทียบ, ตัวเลขใน Stats ของคู่นั้นเพิ่ม, การ์ด recall ของคำนั้นไม่เปลี่ยน
- FE-6 Undo (Z) คืนการ์ดและตัวนับ; ตอบซ้ำจาก retry ไม่สร้างรีวิวซ้ำ
- FE-7 ค้นหา `kami`, `かみ`, `カミ`, `髪`, `hair` เจอคำที่ถูกต้อง
- FE-8 ใช้งานได้ครบด้วยคีย์บอร์ด; Lighthouse a11y ≥ 95 หน้า study
