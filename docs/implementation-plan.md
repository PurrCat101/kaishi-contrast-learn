# Implementation Plan

Status legend:
- `[x]` Implemented and verified for the current scope
- `[~]` Partial implementation or frontend demo only
- `[ ]` Not started

- [x] Task 0 — Repository Audit
- [~] Task 1 — Database Foundation (migration added; Supabase apply pending)
- [~] Task 2 — Authentication + RLS (client session/OAuth foundation; provider setup and backend validation pending)
- [~] Task 3 — Kaishi Import (offline normalization implemented; Supabase upload pending)
- [x] Task 4 — Vocabulary Search (current frontend scope)
- [x] Task 5 — Vocabulary Detail (current frontend scope)
- [~] Task 6 — My Words + Notes (localStorage; Supabase/RLS pending)
- [~] Task 7 — FSRS (local simplified scheduler; `ts-fsrs` pending)
- [~] Task 8 — Review Engine (local browser demo; persistence/auth pending)
- [~] Task 9 — Contrast System (curated local relations; backend/AI relations pending)
- [ ] Task 10 — AI Enrichment
- [ ] Task 11 — Settings
- [~] Task 12 — Today (local demo data)
- [~] Task 13 — Progress (local demo data)
- [~] Task 14 — Navigation/Auth (navigation exists; authentication pending)
- [ ] Task 15 — Export
- [ ] Task 16 — E2E
- [ ] Task 17 — Production Audit

## Next Execution Order

1. Apply and validate Task 1 migration against Supabase
2. Task 3 — Task 3 Supabase upload and idempotent import validation
3. Task 2 — Authentication + RLS client integration
4. Migrate Tasks 6–9 and 12–13 from local browser state to authenticated backend state
