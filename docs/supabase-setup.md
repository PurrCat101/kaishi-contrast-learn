# Supabase Setup

The repository contains the foundation migration at:

```text
supabase/migrations/20260919000000_foundation.sql
```

The local machine currently has the Supabase CLI available through `npx`, but it is not linked to a project and Docker is unavailable for local Postgres validation.

## Option A: Supabase CLI

Run these commands from the repository root:

```powershell
npx supabase login
npx supabase link --project-ref oviaelruznhpgwbmidfa
npx supabase db push
```

The CLI may ask for the database password. Enter it directly into the terminal; do not put it in `.env`, source files, or Git.

After applying the migration:

```powershell
npx supabase db lint --linked
npx supabase migration list
```

## Option B: SQL Editor

1. Open Supabase Dashboard for project `oviaelruznhpgwbmidfa`.
2. Open **SQL Editor** and create a new query.
3. Paste the contents of `supabase/migrations/20260919000000_foundation.sql`.
4. Run the query and confirm there are no errors.
5. Check **Table Editor** for the expected tables and **Authentication > Policies** for private-table policies.

## Required Checks

- `user_id` columns reference `auth.users(id)`.
- Private user tables have owner policies using `auth.uid() = user_id`.
- Re-running the import will use the package hash/source identity and must not duplicate source notes.
- The service-role key is used only by server-side import operations and is never placed in a `VITE_*` variable.