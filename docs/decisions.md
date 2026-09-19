# Architecture Decisions

## ADR-001 — APKG is an import source

APKG is imported into the application database and is not used as the runtime database.

## ADR-002 — Shared vocabulary vs user vocabulary

Global vocabulary is stored once. Users reference it through user-specific records; vocabulary is never duplicated per user.

## ADR-003 — FSRS

Use an existing FSRS implementation instead of implementing the scheduling algorithm from scratch.

## ADR-004 — Audio autoplay

Reading-test cards must not autoplay audio before answer reveal. Audio may autoplay after reveal so the reading is not disclosed early.

## ADR-005 — My Words storage boundary

Task 6 keeps saved words and personal notes in an isolated browser-persistent store until Supabase Auth, database tables, and RLS are implemented. The store references global vocabulary IDs and does not copy vocabulary records.

## ADR-006 — Backend before state migration

The current UI may continue to use local demo state while the database foundation is built, but it must be documented as local-only. Supabase schema, ownership constraints, Auth, and RLS are prerequisites for treating My Words, notes, SRS state, and review history as real user data.

## ADR-007 — APKG source identity and raw preservation

The APKG is an import source, not runtime storage. Import identity is based on source/package/note metadata rather than word text because the Kaishi export contains duplicate written words and readings. Raw Anki fields and import provenance must be preserved separately from normalized runtime vocabulary so imports are reproducible and can be reprocessed without losing source fidelity.

## ADR-008 — Database foundation before frontend migration

The database foundation is introduced as a Supabase migration before replacing localStorage in the frontend. Source/import audit records, shared vocabulary, media references, AI enrichment, and private user learning state remain separate ownership boundaries. The migration must be applied and validated against PostgreSQL before Task 3 imports the APKG.

## ADR-009 — Browser auth uses publishable credentials

The browser uses only the Supabase project URL and anonymous/publishable key. The service-role key is reserved for server-side import and privileged operations and must never be exposed through `VITE_*` variables or client code. Guest browsing remains available when the public client configuration is absent.

## ADR-010 — Use PKCE for browser OAuth

Supabase browser OAuth uses PKCE instead of the implicit flow. The callback should carry a short-lived authorization code, which the client exchanges for a session, rather than placing access and refresh tokens directly in the URL fragment. Any previously exposed session must be invalidated by signing out before a fresh login.