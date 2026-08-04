# ripar-app-x402

The Ripar workspace — **[app.ripar.io](https://app.ripar.io)**.

Five surfaces behind one shell: **Overview**, **Chat**, **Endpoints** (paid
HTTP endpoints, their price and their traffic), **Workflows** (a draggable
canvas with a run console) and **Agents**. Plus sign-in, an auth callback and
a marketing-facing landing route.

Next.js 16 (App Router) · React 19 · Tailwind v4 · motion · `@xyflow/react` ·
Supabase.

> The directory is `ripar-app-x402`, the GitHub remote is
> `nickthelegend/ripar-app-x402`, and it deploys to the Vercel project named
> `ripar-app`. The older, pre-pivot `ripar-app/` directory beside this one is
> not what ships.

## Run it

```bash
npm install
npm run dev -- -p 3002        # http://localhost:3002
```

Port 3002 is a convention rather than a default: `ripar-landing-v2` links to
`http://localhost:3002` when `NEXT_PUBLIC_APP_URL` is unset, so the two repos
line up locally if you use it.

It runs out of the box in **demo mode** with no environment at all. Every
Supabase entry point is null-safe — no env, no session, no schema, or any
error returns `null` and the local fallbacks keep working — so the whole UI is
interactive signed-out.

## Turn on persistence

1. Create a Supabase project and put the URL and publishable key in
   `.env.local` (see [`.env.example`](.env.example)):

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

2. Apply [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   — SQL editor or `supabase db push`. See [`supabase/README.md`](supabase/README.md).

3. Sign up in the app. A trigger provisions the profile, personal org, demo
   projects, onboarding row and a welcome notification.

Only the **email** provider is enabled on the Supabase project today. The
Google and GitHub buttons will not redirect until someone enables those
providers in the dashboard and adds `http://localhost:3002/auth/callback` plus
the production URL under Authentication → URL Configuration.

Two optional flags:

- `RIPAR_REQUIRE_AUTH=true` — the Next 16 proxy (`proxy.ts`) redirects
  signed-out visitors on app routes to `/login`. Defaults off so demos work.
- `NEXT_PUBLIC_RIPAR_API_URL` — points the workflow **Run** at `ripar-infra`'s
  control-plane API instead of the local simulation. Unset, runs stay local.

## Real versus sample

Be precise about this one, because the app looks the most finished and is the
most sample-backed.

| Thing | Status |
|---|---|
| Auth, session, profile, orgs, projects, members, invites, API keys, notifications | **Real** — Supabase, RLS on everything, once you apply the migration |
| Endpoint list, prices, call counts, earnings, latency, success rates | **Sample** — `lib/app-data.ts`, shaped exactly like the API response |
| Workflow definitions and run output | **Sample** — the canvas is real, the runs are simulated unless `NEXT_PUBLIC_RIPAR_API_URL` is set |
| Agent roster and activity | **Sample** |
| Chat responses | **Sample** |

**No paid call has ever been served in production.** Every USDC figure, call
count and earnings total in this app is illustrative. `lib/app-data.ts` is
mock data deliberately shaped like the real API envelope, so swapping in a
fetch later is a change of source and not of components — but until that
swap happens, nothing here is a measurement.

If you put one of these numbers on a slide, a landing page or a demo
narration, label it. See [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## Deploy

Vercel, on push to `main`. Production is `app.ripar.io`, Vercel project
`ripar-app`.

```bash
npx vercel --prod        # from this directory, when you need to force one
```

Read [`../CONTRIBUTING.md`](../CONTRIBUTING.md) first — commits must be
authored as the Vercel account email or the deployment sits at `BLOCKED` with
no build logs at all.

CI (`.github/workflows/ci.yml`) runs `tsc --noEmit` and `next build` with **no
Supabase env on purpose**: demo mode is a supported way to run this app, so a
green build proves it still survives `createClient()` returning `null`.
