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

The frontend demo is functional for browsing vocabulary, detail pages, local review, local contrast checks, Today, Progress, My Words, and personal notes. The application is not yet connected to Supabase and must not describe localStorage data as authenticated user data.

## Current Next Task

Task 1 — Database Foundation.

Implement the schema foundation from `Backend_Specification_Updated.md` for shared content and user-owned data. Do not migrate frontend stores until ownership keys and constraints are defined.

## Important Constraints

- Keep shared vocabulary separate from user-owned records.
- Use `auth.users.id` as the user identity once authentication exists.
- Protect private tables with `auth.uid() = user_id` RLS policies.
- Keep source content, AI enrichment, and user content separate.
- Do not use the `.apkg` as the runtime database.
- Use a maintained FSRS implementation; do not replace it with a new hand-rolled production scheduler.
- Do not claim tests passed unless they were actually run.
