# Implementation Plan

Status legend:
- `[x]` Implemented and verified for the current scope
- `[~]` Partial implementation or frontend demo only
- `[ ]` Not started

- [x] Task 0 — Repository Audit
- [~] Task 1 — Database Foundation (migration added; Supabase apply pending)
- [~] Task 2 — Authentication + RLS (client session/OAuth foundation; provider setup and backend validation pending)
- [~] Task 3 — Kaishi Import (catalogue client and media rendering implemented; live import/policy validation pending)
- [x] Task 4 — Vocabulary Search (text search plus local activity/state filters: `studied:today`, `studied:week`, `introduced:week`, difficulty, state, and confusing-word queries)
- [x] Task 5 — Vocabulary Detail (reads imported catalogue, examples, relationships, audio, and pictures; My Words sync now uses database UUIDs)
- [~] Task 6 — My Words + Notes (localStorage; Supabase/RLS pending)
- [~] Task 7 — FSRS (`ts-fsrs` with local learning/relearning steps; account persistence and parameter optimization pending)
- [~] Task 8 — Review Engine (browser-local Anki-style due-time queue, contrast rating, and local leech suspension; account persistence and advanced queue policies pending)
- [~] Task 9 — Contrast System (curated local relations; backend/AI relations pending)
- [ ] Task 10 — AI Enrichment
- [~] Task 11 — Settings (daily limits and review session size persist to `user_settings` for authenticated users; remaining preference groups pending)
- [~] Task 12 — Today (actual browser-local review state; authenticated persistence pending)
- [~] Task 13 — Progress (actual browser-local review state; authenticated persistence pending)
- [~] Task 14 — Navigation/Auth (navigation exists; authentication pending)
- [ ] Task 15 — Export
- [ ] Task 16 — E2E
- [ ] Task 17 — Production Audit

## Next Execution Order

1. Link Supabase and apply/validate Task 1 migration
2. Task 3 — Supabase upload and idempotent import validation
3. Task 2 — Authentication + RLS client integration
4. Migrate Tasks 6–9 and 12–13 from local browser state to authenticated backend state
