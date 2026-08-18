-- Ripar multi-tenant schema
-- Tenancy model: every row of tenant data hangs off an org; access is decided
-- by org_members. RLS is enabled on every table (public schema is exposed via
-- the Data API). Policies follow Supabase guidance:
--   * TO authenticated + ownership/membership predicate (never role-only)
--   * UPDATE policies carry both USING and WITH CHECK
--   * membership checks go through SECURITY DEFINER helpers to avoid
--     recursive RLS on org_members
--   * (select auth.uid()) form so the planner evaluates it once

create extension if not exists pgcrypto;

/* ------------------------------- helpers ---------------------------------- */

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/* ------------------------------- profiles --------------------------------- */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'No Name',
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

/* --------------------------------- orgs ----------------------------------- */

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  plan text not null default 'free' check (plan in ('free', 'pro', 'team', 'enterprise')),
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;

-- Members of a shared org can read each other's profiles (for the roster).
-- SECURITY DEFINER so the check doesn't recurse through org_members RLS.
--
-- This has to sit AFTER org_members exists. `language sql` bodies are parsed
-- and their dependencies resolved when the function is created, unlike plpgsql
-- which defers to call time — so declaring it up with the profiles policies
-- failed on a fresh database with `relation "public.org_members" does not
-- exist`. The original project was built statement by statement against a live
-- database, where the table already existed, so the file could never actually
-- rebuild the schema it claims to define.
create or replace function public.shares_org_with(other uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.org_members mine
    join public.org_members theirs on mine.org_id = theirs.org_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

create policy "profiles: co-members read"
  on public.profiles for select
  to authenticated
  using (public.shares_org_with(id));

-- Membership helpers. SECURITY DEFINER so policies on org_members don't
-- recurse into themselves; search_path pinned per Supabase guidance.
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.org_role(org uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select m.role from public.org_members m
  where m.org_id = org and m.user_id = (select auth.uid());
$$;

create policy "orgs: members read"
  on public.orgs for select
  to authenticated
  using (public.is_org_member(id));

create policy "orgs: owner updates"
  on public.orgs for update
  to authenticated
  using (public.org_role(id) = 'owner')
  with check (public.org_role(id) = 'owner');

create policy "org_members: members read roster"
  on public.org_members for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "org_members: admins manage"
  on public.org_members for insert
  to authenticated
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy "org_members: admins update roles"
  on public.org_members for update
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'))
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy "org_members: admins remove (not the owner)"
  on public.org_members for delete
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin') and role <> 'owner');

/* ------------------------------- invites ---------------------------------- */

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

alter table public.org_invites enable row level security;

create policy "org_invites: members read"
  on public.org_invites for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "org_invites: admins create"
  on public.org_invites for insert
  to authenticated
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy "org_invites: admins update"
  on public.org_invites for update
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'))
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy "org_invites: admins revoke"
  on public.org_invites for delete
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'));

/* ------------------------------- projects --------------------------------- */

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('live', 'draft', 'building')),
  modes text[] not null default '{agents}',
  gradient text not null default 'from-sky-400 to-blue-600',
  initials text not null default 'PR',
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_org_idx on public.projects (org_id);

alter table public.projects enable row level security;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create policy "projects: members read"
  on public.projects for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "projects: members create"
  on public.projects for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "projects: members update"
  on public.projects for update
  to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy "projects: admins delete"
  on public.projects for delete
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'));

/* ------------------------------ onboarding -------------------------------- */
-- Getting-started checklist + earned bonus credits. Per user.

create table public.onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  earned integer not null default 0 check (earned >= 0),
  done text[] not null default '{}',
  dismissed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.onboarding enable row level security;

create trigger onboarding_updated_at
  before update on public.onboarding
  for each row execute function public.set_updated_at();

create policy "onboarding: read own"
  on public.onboarding for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "onboarding: upsert own"
  on public.onboarding for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "onboarding: update own"
  on public.onboarding for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* -------------------------------- api keys -------------------------------- */
-- Only a hash is stored; the plaintext exists client-side once, at creation.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  last4 text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_org_idx on public.api_keys (org_id);

alter table public.api_keys enable row level security;

create policy "api_keys: members read"
  on public.api_keys for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "api_keys: admins create"
  on public.api_keys for insert
  to authenticated
  with check (public.org_role(org_id) in ('owner', 'admin'));

create policy "api_keys: admins revoke"
  on public.api_keys for update
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'))
  with check (public.org_role(org_id) in ('owner', 'admin'));

/* ----------------------------- custom domains ----------------------------- */

create table public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  domain text not null unique check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  status text not null default 'pending_dns' check (status in ('pending_dns', 'active', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.custom_domains enable row level security;

create policy "custom_domains: members read"
  on public.custom_domains for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "custom_domains: members manage"
  on public.custom_domains for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "custom_domains: members delete"
  on public.custom_domains for delete
  to authenticated
  using (public.is_org_member(org_id));

/* ---------------------------------- runs ---------------------------------- */
-- Agent/workflow executions, written by the runtime (service role), read by
-- org members. No insert policy for authenticated: the data plane writes with
-- the service key, which bypasses RLS by design.

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index runs_org_created_idx on public.runs (org_id, created_at desc);

alter table public.runs enable row level security;

create policy "runs: members read"
  on public.runs for select
  to authenticated
  using (public.is_org_member(org_id));

/* ------------------------------ notifications ----------------------------- */

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'info' check (kind in ('info', 'deploy', 'error', 'comment', 'digest')),
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "notifications: mark own read"
  on public.notifications for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* --------------------------- provisioning triggers ------------------------ */

-- Seed a fresh org with the demo projects the UI ships with.
create or replace function public.handle_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.projects (org_id, name, description, status, modes, gradient, initials, created_by)
  values
    (new.id, 'Financial Reconciliation', 'Matches uploaded bank statements against the ledger and flags anomalies for review.', 'live', '{agents,workflows,knowledge,interfaces}', 'from-sky-400 to-blue-600', 'FR', new.owner_id),
    (new.id, 'Support Triage', 'Routes inbound tickets by intent and urgency, drafts replies for agent approval.', 'live', '{agents,workflows,interfaces}', 'from-violet-400 to-purple-600', 'ST', new.owner_id),
    (new.id, 'Invoice Parser', 'Extracts line items from PDF invoices into structured rows, ready to post.', 'draft', '{agents,knowledge}', 'from-emerald-400 to-teal-600', 'IP', new.owner_id);
  return new;
end;
$$;

create trigger on_org_created
  after insert on public.orgs
  for each row execute function public.handle_new_org();

-- Every new auth user gets: a profile, a personal org (owner), onboarding row,
-- and a welcome notification.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
  base_slug text;
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'No Name'),
    coalesce(new.email, '')
  );

  base_slug := left(regexp_replace(split_part(coalesce(new.email, 'workspace'), '@', 1), '[^a-z0-9]+', '-', 'gi'), 24);
  base_slug := lower(trim(both '-' from base_slug));
  if length(base_slug) < 3 then
    base_slug := 'workspace';
  end if;

  insert into public.orgs (name, slug, owner_id)
  values (
    initcap(replace(base_slug, '-', ' ')),
    base_slug || '-' || substr(replace(new.id::text, '-', ''), 1, 6),
    new.id
  )
  returning id into org_id;

  insert into public.org_members (org_id, user_id, role) values (org_id, new.id, 'owner');
  insert into public.onboarding (user_id) values (new.id);
  insert into public.notifications (user_id, kind, title, body)
  values (new.id, 'info', 'Welcome to Ripar', 'Your workspace is ready. Finish the getting-started checklist to earn 15k bonus credits.');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ------------------------------- grants ----------------------------------- */

-- Row Level Security decides WHICH rows a caller sees. It does not grant the
-- privilege to touch the table at all, and those are separate mechanisms: with
-- RLS enabled and no GRANT, PostgREST answers every request with "permission
-- denied for table profiles" no matter how permissive the policies are.
--
-- Hosted Supabase projects get these grants ambiently, from default privileges
-- configured on the project long before any migration runs. This file never
-- declared them, so it could not rebuild its own schema anywhere else — the API
-- came up with no read or write access to a single table. Declaring them here
-- makes the migration self-contained, which is the only way it can be trusted
-- as the definition of the schema.
--
-- Granting broadly is deliberate and is not a loosening: every table below has
-- RLS enabled, so the policies above remain the gate. anon is granted the same
-- surface because an unauthenticated caller is still filtered by policies that
-- are all `to authenticated` — as the RLS check in the verification proves, it
-- reads zero rows.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Anything added later inherits the same treatment, so a new table cannot
-- silently ship unreachable.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
