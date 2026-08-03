# Ripar × Supabase

Persistence layer for ripar-app. One migration, RLS on everything, and
triggers that provision each new user with a profile, a personal org, demo
projects, an onboarding row, and a welcome notification.

## Apply the schema

Pick one:

**A — SQL editor (fastest)**
1. Open the project's [SQL editor](https://supabase.com/dashboard/project/_/sql/new).
2. Paste `migrations/0001_init.sql` and run it.

**B — CLI (repeatable)**
```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/*
```

## What the app uses today

| Table | Wired in the UI | Notes |
|---|---|---|
| `profiles` | ✅ read + write-through | Settings → Profile; sidebar identity |
| `onboarding` | ✅ read + write-through | Getting-started checklist + bonus credits |
| `orgs`, `org_members` | ✅ read | first org powers the projects fetch |
| `projects` | ✅ read | dashboard grids fall back to demo data when empty/signed-out |
| `org_invites`, `api_keys`, `custom_domains`, `runs`, `notifications` | schema-ready | UI currently uses local state; swap points live in `lib/db.ts` |

The app works fully **without** this schema applied (or signed out): every
fetch degrades to the local demo data, and writes keep landing in
localStorage. Applying the schema simply makes the same state durable.

## Tenancy model

- Every tenant row hangs off `orgs.id`; access = membership in `org_members`.
- `is_org_member()` / `org_role()` are `SECURITY DEFINER` helpers so policies
  never recurse.
- The agent data plane (Kubernetes runtimes, see `infra/`) writes `runs` with
  the service-role key — no client insert policy on purpose.
- API keys store a hash + last4 only.
