# Hashi System Specification

Last updated: 2026-09-30

This is the operational reference for the current application. It separates working behavior from the database-backed target so a local feature is never mistaken for a completed account feature.

## Product and system map

Hashi is a Japanese vocabulary trainer built from Kaishi 1.5k. It combines normal recall with contrast practice for words that share readings, kanji, or meanings.

```text
Supabase vocabulary catalogue ─────┐
Bundled Kaishi JSON (offline fallback) ├── Vocabulary search / detail
Supabase media (signed URLs) ──────┘          │
                                                │
Review screen ── rating ──> ts-fsrs scheduler ─┼──> browser SRS state
                                                │          │
Settings ── review limits ─────────────────────┘          ├── Today
                                                           ├── Progress
                                                           └── activity search filters

Supabase Auth ──> session ──> user_settings (implemented settings only)

Planned: SRS state + review history + My Words + notes per user
```

## Current persistence boundaries

| Data | Current storage | Account-scoped? | Notes |
|---|---|---:|---|
| Vocabulary, examples, relations | Supabase catalogue; bundled JSON fallback | No | Browser fetches vocabulary/readings/examples/relations after load. |
| Vocabulary audio and images | Supabase Storage via 1-hour signed URLs | No | Media is linked by role: word audio, sentence audio, or picture. |
| Auth session | Supabase Auth | Yes | Google OAuth with PKCE when configured. |
| Review settings | Browser; `user_settings` when signed in | Yes, for implemented values | New/review limits and session size. |
| SRS cards and review log | `user_fsrs_state`, `user_vocabulary_state`, `review_history` when signed in; browser `localStorage` for guests | Yes, when signed in | Guest key: `kaishi-contrast-srs-v1`. Guest data is never copied into an account. |
| My Words and notes | Browser `localStorage`; `user_vocabulary` / `user_notes` when signed in | Partly | Current catalogue UUIDs sync; offline legacy cards remain local. |
| Progress | Derived from the loaded SRS state | Yes, when signed in | Never seeded with demo activity. |

Signed-in reviews write `user_fsrs_state` (RECALL row), `user_vocabulary_state`, and one `review_history` row per rating, in order. `20260930010000_srs_account_state_and_vocab_numbers.sql` must be applied first (adds `learning_steps`, `confusions`, `vocabulary.id_number`). If loading account state fails, review is blocked so a blank state can never overwrite saved progress.

## Review and scheduling

### Scheduler

The browser uses `ts-fsrs`, an implementation of the Free Spaced Repetition Scheduler. It stores card state, due time, stability, difficulty, repetitions, lapses, learning-step position, and last review.

| Option | Current value |
|---|---|
| Desired retention | 90% |
| Learning steps | 1 minute, then 10 minutes |
| Relearning steps | 10 minutes |
| Maximum interval | 36,500 days |
| Interval fuzzing | Enabled |
| Leech threshold | 8 review lapses; card is suspended locally |

### Card lifecycle

```text
New → Learning (1m → 10m) → Review
  │             │
  └─ Again ────┘

Review ─ Again → Relearning (10m) → Review
```

`Hard`, `Good`, and `Easy` use `ts-fsrs` to select the appropriate next step or review interval. `Again` respects its due time: a failed card is not inserted immediately back into the current queue.

### Queue construction

`planSession` in `src/lib/srs.ts` builds the queue; Today and Review both use it, so the numbers on Today are the cards Review shows.

1. learning/relearning cards due now (not limited by session size);
2. new cards up to `daily_new_limit` minus words introduced today (since 04:00);
3. due review cards up to `daily_review_limit` minus reviews already answered today.

New + review cards are capped by `session_size`. The queue is fixed when the session starts.

### In-session relearning

A card rated `Again` (or still in learning) waits for its FSRS step (1m / 10m) and is shown again in the same session once due. When nothing else is left, a learning card due within 20 minutes is shown early, like Anki's learn-ahead limit. Each answer is saved as it happens.

### Contrast cards

Words in the review state that have confusable partners are shown as contrast checks; new and learning words are shown as recall cards. A contrast answer records a confusion event and an FSRS result: `Good` for correct or `Again` for incorrect.

## Settings

| Setting | Effect |
|---|---|
| New words per day | Maximum previously unseen words introduced after the local 04:00 day boundary. |
| Reviews per day | Maximum due *review* cards answered per day. Learning/relearning cards are time-critical and not capped. |
| Cards per review session | Maximum initial cards in one review session. |

For authenticated users the three values load at sign-in with the SRS state and upsert to `public.user_settings`; guests use local browser storage.

## Search

Plain search matches word, reading, or meaning. The Words page also supports AND-combined activity filters:

```text
studied:today        reviewed today
studied:week         reviewed in the last seven days
introduced:week      first reviewed in the last seven days
difficulty:hard      difficult, lapsed, or repeatedly confused
difficulty:>=7       numeric difficulty comparison
difficulty:easy      low difficulty with no lapse/mix-up
state:new            state:learning | state:review | state:relearning
is:confusing         has a curated contrast relation
```

Example: `studied:week difficulty:hard`.

## Progress

Progress is derived from browser SRS activity and shows learned/learning counts, streak, 14-day review history, seven-day due forecast, retention, retrievability, and difficult words. It is accurate for the recorded activity in this browser, not cross-device account history.

## Supabase target

```text
Authenticated browser
  ├── user_settings              implemented for review settings
  ├── user_vocabulary / notes    schema + RLS only
  ├── user_fsrs_state            implemented (RECALL dimension)
  └── review_history             implemented
```

Private rows use `auth.users.id` and owner RLS. Browser code uses only the Supabase URL plus anon/publishable key; service-role credentials are server-only.

## Remaining work

1. Persist the DISCRIMINATION dimension separately from RECALL.
2. Retry failed review writes while offline.
3. Add selectable new/review ordering and the “new cards ignore review limit” policy.
4. Surface suspended leeches and add manual suspend/unsuspend controls.
5. Add sibling burying after introducing a stable note/card sibling model.
6. Finish account migration for SRS/history, then implement account data export.
7. Validate the live import/media policies and add automated tests.

## Primary files

| Concern | Files |
|---|---|
| Scheduling and local persistence | `src/lib/srs.ts` |
| Review UI and queue | `src/routes/review.tsx` |
| Settings persistence | `src/routes/settings.tsx`, `src/lib/user-settings.ts` |
| Search syntax | `src/lib/vocab-search.ts`, `src/routes/vocab.index.tsx` |
| Progress | `src/routes/progress.tsx` |
| Schema and RLS | `supabase/migrations/20260919000000_foundation.sql` |
