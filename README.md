# ripar-app

The Ripar product: a multi-tenant AI-agents workspace — dashboard, agent
playground with streaming tool-calls, workflow canvas (draggable nodes, run
console), knowledge bases (schema/data/files), interface builder, settings
(profile/members/API keys/billing), gamified onboarding, ⌘K everywhere.

Next.js 16 (App Router) · React 19 · Tailwind v4 · motion · Supabase.

## Run it

```bash
npm install
npm run dev        # http://localhost:3002
```

Works out of the box in **demo mode** (no env needed): all data is local,
every surface is interactive.

## Turn on persistence

1. Create a Supabase project, put the URL + publishable key in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   ```
2. Apply [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   (SQL editor or `supabase db push`) — see [supabase/README.md](supabase/README.md).
3. Sign up in the app. A trigger provisions your profile, personal org, demo
   projects, onboarding checklist, and a welcome notification. Profile,
   checklist credits, projects, members, invites, API keys, and notifications
   now persist; every store degrades gracefully when signed out.

Optional hard auth gating: set `RIPAR_REQUIRE_AUTH=true` and the middleware
redirects signed-out visitors on app routes to `/login`.

## The rest of the platform

| Repo | What |
|---|---|
| `../ripar-infra` | Kubernetes data plane — namespace-per-org agent runtimes, control-plane API + provisioner, k3s dev cluster script |
| `../ripar-landing-v2` | Marketing site (light/warm, GSAP) |
| `../ripar-landing` | Original red-noir landing |

Architecture: [`../ripar-infra/ARCHITECTURE.md`](../ripar-infra/ARCHITECTURE.md).
