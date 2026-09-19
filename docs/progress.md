# Project Progress

## Repository Audit — 2026-09-19

### Confirmed implemented

- TanStack Start + React + TypeScript frontend builds successfully.
- Vocabulary data is currently bundled from `src/data/kaishi.json` plus curated confusable examples.
- Vocabulary search supports word, reading, meaning, and a confusable-only filter.
- Vocabulary detail supports reading, meaning, example, image, speech playback, pitch, relationships, and learning display.
- Review, contrast checks, Today, and Progress views exist as local browser functionality.
- My Words and personal notes exist in an isolated localStorage store and reference shared vocabulary IDs rather than copying records.
- Route navigation includes Today, Review, Words, My Words, and Progress.

### Not implemented yet

- Supabase project deployment and migration execution.
- Supabase Auth provider configuration and live Google OAuth verification.
- Row Level Security for private user data.
- APKG parsing/import and Supabase Storage media migration.
- `ts-fsrs` integration and server-persisted recall/discrimination state.
- AI enrichment jobs, validation, provenance, and confidence metadata.
- Settings, export, E2E tests, and production audit.

### Verification

- `npm run build`: PASS on 2026-09-19.
- No test files or test script were found in the repository.
- `npm run lint`: BLOCKED by existing workspace-wide Prettier/CRLF findings (6,361 findings in the previous run); no repository-wide auto-fix was applied.

### Current limitations

- User-specific data is browser-local, not account-scoped, and is not protected by RLS yet.
- SRS uses a simplified local scheduler and deterministic demo seed; it is not production FSRS.
- Relationships are local curated data and are not stored in a vocabulary relationship table.
- Media is currently bundled frontend assets or speech synthesis rather than Supabase Storage references.

## APKG Inspection — 2026-09-19

Source file: `kashi-deck.apkg`

### Confirmed package profile

- The usable data is in `collection.anki21`; `collection.anki2` is a compatibility placeholder with one instructional note.
- 1,500 notes and 1,500 cards in the `Kaishi 1.5k` deck.
- One note model with 14 fields: Word, Word Reading, Word Meaning, Word Furigana, Word Audio, Sentence, Sentence Meaning, Sentence Furigana, Sentence Audio, Notes, Pitch Accent, Pitch Accent Notes, Frequency, Picture.
- 7,711 Anki revlog rows are present. These are source-package scheduling history and must not become the application's user review history.
- 4,354 media files: 2,972 audio and 1,382 image files. All 4,354 referenced files resolve to the package media manifest.
- The package contains HTML markup in sentence, furigana, pitch, and picture fields, plus `[sound:...]` references.

### Schema requirements added from inspection

- Use a stable source identity such as `(source, source_version, source_note_id)`; do not use `word` as a unique key because 24 word values are duplicated.
- Add import batches, package hash, raw note snapshot, Anki note/model/deck identifiers, and field mapping version for idempotent re-imports and reproducibility.
- Model media as a separate asset and reference table with role, original filename, checksum, MIME type, and Supabase Storage path; do not assume one image/audio path per vocabulary row.
- Preserve raw HTML/source fields while also storing normalized text for search and UI rendering.
- Keep Anki cards and revlog as import audit data, separate from runtime cards and user review history.
- Treat optional fields such as notes and pitch notes as nullable; do not reject records because those fields are empty.

Detailed findings and proposed import boundaries are in `docs/apkg-analysis.md`.

## Task 1 — Database Foundation

Added `supabase/migrations/20260919000000_foundation.sql` with shared vocabulary, readings, examples, relations, media assets, import batches, raw source metadata, user vocabulary, notes, settings, FSRS dimensions, review history, AI enrichment, indexes, timestamps, and owner RLS policies.

Verification so far: 20 tables, 6 owner policies, and clean `git diff --check`. Full verification is currently blocked because no Supabase project credentials, Supabase CLI, or `psql` executable is available in the workspace. The migration has not been applied to a live database yet.

The next action is to apply this migration to a disposable Supabase development database, resolve any PostgreSQL-specific issues, then proceed to the APKG importer.

Setup instructions are in `docs/supabase-setup.md`. `npx supabase db push --dry-run` currently stops before validation because the CLI is not linked to project `oviaelruznhpgwbmidfa`; local Postgres validation is also unavailable because Docker is not installed.

## Task 3 — APKG Importer

Implemented `scripts/import_apkg.py` and the `npm run import:apkg` command.

The importer currently:

- Reads `collection.anki21` first and falls back to `collection.anki2`.
- Computes a package SHA-256 for idempotency metadata.
- Normalizes the Kaishi note fields while preserving raw fields.
- Extracts source note/model/deck identity, media references, and Anki counts.
- Validates every media reference against the APKG manifest.
- Can optionally extract media, but defaults to dry-run and does not contact Supabase.
- Keeps source revlog count as audit information rather than application review history.

Verification:

- `npm run import:apkg -- kashi-deck.apkg`: PASS
- Result: 1,500 notes, 1,500 cards, 7,711 revlog rows, 4,354 media files.
- Package SHA-256: `0f9fffd94dcd30767e0eeef56a7d169258fd1ed38b1dc816385066ed72b134e5`

Remaining: upload normalized rows/media server-side through Supabase service-role operations and verify re-import behavior against the live schema.

### Live Supabase Connectivity Check — 2026-09-19

- Supabase REST responded successfully for `vocabulary`, `user_vocabulary`, and `user_notes`.
- The configured project host and JWT project reference match.
- Guest reads returned HTTP 200 with empty results; this confirms the API/schema path but is not by itself a complete cross-user RLS test because the tables are currently empty.
- The next implementation is the explicit server-side APKG upload command using the service-role key only at runtime.

## Task 2 — Authentication Foundation

Implemented:

- Added a browser-safe Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Added persistent session loading and auth-state subscription.
- Added Google OAuth sign-in and sign-out controls in the global header.
- Preserved guest browsing when Supabase is not configured.

Verification:

- `npm run build`: PASS on 2026-09-19.

Remaining:

- Configure Google provider and allowed redirect URLs in Supabase Dashboard.
- Apply and validate the database migration and RLS policies against a live project.
- Add authenticated backend reads/writes and migrate localStorage data.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; it must never be used in a `VITE_*` variable or browser module.

### OAuth Test — 2026-09-19

- Local app loaded at `http://127.0.0.1:8081/` because port 8080 was occupied.
- Supabase configuration was detected and the Sign in with Google button appeared.
- Clicking the button reached Google successfully.
- The first attempt returned `Error 400: redirect_uri_mismatch`.
- After adding the callback URI, a retry on `http://127.0.0.1:8080/` reached the Google account sign-in page with the Supabase callback URI accepted.
- The local app URL must also be listed in Supabase Authentication > URL Configuration, for example `http://127.0.0.1:8081/` and `http://localhost:8081/` if both are used.
- After the user completed Google sign-in, the callback returned to `http://127.0.0.1:8080/` with a Supabase session.
- Restarting the dev server and opening the clean URL restored the session; the header displayed `Sign out`.
- The original callback URL contained session tokens and must not be shared or reused. Sign out and sign in again to invalidate the exposed session before continuing.

### OAuth Security Follow-up — 2026-09-19

- Changed the Supabase browser client to `flowType: "pkce"` so future OAuth callbacks use a short-lived code instead of access/refresh tokens in the URL.
- `npm run build`: PASS after the PKCE change.

## Next Task

Task 1 validation, followed by Task 3 — Kaishi Import.
