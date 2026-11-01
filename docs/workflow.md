# Development Workflow

## Required Loop

```text
Inspect repository and specification
        ↓
Update project status documentation
        ↓
Implement the smallest scoped change
        ↓
Run relevant tests/typecheck/build
        ↓
Fix local errors and rerun validation
        ↓
Inspect the actual diff
        ↓
Update docs/progress.md
        ↓
Update docs/implementation-plan.md
        ↓
Record decisions and known issues
        ↓
Commit only when explicitly requested
        ↓
Stop for human review
```

## Current Status

The frontend demo is functional for browsing vocabulary, detail pages, local review, local contrast checks, Today, Progress, My Words, and personal notes. Supabase Auth is connected when browser configuration is present, and authenticated daily limits persist through `user_settings`. All remaining learning state and My Words/notes must still be described as browser-local rather than authenticated user data.

## Current Next Task

Validate the Task 1 database foundation against the live Supabase project, then continue the APKG import and the remaining authenticated state migration.

The schema foundation and owner constraints are present in the migration. Do not migrate additional frontend stores until the live schema and RLS policies have been validated.

## Important Constraints

- Keep shared vocabulary separate from user-owned records.
- Use `auth.users.id` as the user identity once authentication exists.
- Protect private tables with `auth.uid() = user_id` RLS policies.
- Keep source content, AI enrichment, and user content separate.
- Do not use the `.apkg` as the runtime database.
- Use a maintained FSRS implementation; do not replace it with a new hand-rolled production scheduler.
- Do not claim tests passed unless they were actually run.
