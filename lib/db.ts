"use client";

import { createClient } from "@/lib/supabase/client";

// Thin data layer over Supabase. Every function is null-safe: no env, no
// session, no schema, or any error → null / no-op, and the UI's local
// fallbacks keep working. Applying supabase/migrations makes it durable.

async function session() {
  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return null;
    return { supabase, userId };
  } catch {
    return null;
  }
}

/* ------------------------------ schema probe ------------------------------ */

/**
 * Whether the migration has actually been applied to the project this app
 * points at.
 *
 * Every read below returns null and every write is a no-op when the tables are
 * absent, which is the right fallback — but it is indistinguishable from
 * "signed in, nothing saved yet". The deployed app has been running against a
 * project with no schema, so profile edits looked saved and went nowhere: the
 * UI kept its local copy and the write failed silently into `.catch(() => {})`.
 *
 * PostgREST answers a missing table with PGRST205 specifically, which is what
 * makes this checkable rather than a guess. Returns:
 *   "ready"    — tables exist, writes durable
 *   "missing"  — reachable, but the migration has not been applied
 *   "unknown"  — no client, no session, or the host did not answer
 */
export type SchemaState = "ready" | "missing" | "unknown";

export async function schemaState(): Promise<SchemaState> {
  const supabase = createClient();
  if (!supabase) return "unknown";
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (!error) return "ready";
    // PGRST205 is "could not find the table". Anything else — RLS, auth, a
    // transport failure — is not evidence the schema is absent.
    return error.code === "PGRST205" ? "missing" : "unknown";
  } catch {
    return "unknown";
  }
}

/* -------------------------------- profile --------------------------------- */

export async function fetchProfileRow(): Promise<{ name: string; email: string } | null> {
  const s = await session();
  if (!s) return null;
  const { data, error } = await s.supabase.from("profiles").select("name,email").eq("id", s.userId).maybeSingle();
  if (error || !data) return null;
  return data;
}

export function saveProfileRow(p: { name: string; email: string }) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("profiles").update(p).eq("id", s.userId);
  })().catch(() => {});
}

/* ------------------------------- onboarding ------------------------------- */

export type OnboardingRow = { earned: number; done: string[]; dismissed: boolean };

export async function fetchOnboardingRow(): Promise<OnboardingRow | null> {
  const s = await session();
  if (!s) return null;
  const { data, error } = await s.supabase
    .from("onboarding")
    .select("earned,done,dismissed")
    .eq("user_id", s.userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export function saveOnboardingRow(o: OnboardingRow) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("onboarding").upsert({ user_id: s.userId, ...o });
  })().catch(() => {});
}

/* -------------------------------- projects -------------------------------- */

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}

async function firstOrgId(s: NonNullable<Awaited<ReturnType<typeof session>>>): Promise<string | null> {
  const { data, error } = await s.supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", s.userId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.org_id;
}

/* ------------------------------ members roster ---------------------------- */

export type MemberRowDb = {
  userId: string;
  name: string;
  email: string;
  role: string;
  isSelf: boolean;
};
export type InviteRowDb = { id: string; email: string; role: string };

export async function fetchRoster(): Promise<{ orgId: string; members: MemberRowDb[]; invites: InviteRowDb[] } | null> {
  const s = await session();
  if (!s) return null;
  const orgId = await firstOrgId(s);
  if (!orgId) return null;

  const [membersRes, invitesRes] = await Promise.all([
    s.supabase.from("org_members").select("user_id,role").eq("org_id", orgId),
    s.supabase.from("org_invites").select("id,email,role").eq("org_id", orgId),
  ]);
  if (membersRes.error || !membersRes.data) return null;

  const ids = membersRes.data.map((m) => m.user_id);
  const { data: profiles } = await s.supabase.from("profiles").select("id,name,email").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return {
    orgId,
    members: membersRes.data.map((m) => ({
      userId: m.user_id,
      name: byId.get(m.user_id)?.name ?? "Member",
      email: byId.get(m.user_id)?.email ?? "",
      role: m.role.charAt(0).toUpperCase() + m.role.slice(1),
      isSelf: m.user_id === s.userId,
    })),
    invites: (invitesRes.data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role.charAt(0).toUpperCase() + i.role.slice(1) })),
  };
}

export function createInvite(orgId: string, email: string, role: string) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("org_invites").insert({ org_id: orgId, email, role: role.toLowerCase(), invited_by: s.userId });
  })().catch(() => {});
}

export function deleteInvite(id: string) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("org_invites").delete().eq("id", id);
  })().catch(() => {});
}

export function updateInviteRole(id: string, role: string) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("org_invites").update({ role: role.toLowerCase() }).eq("id", id);
  })().catch(() => {});
}

export function updateMemberRole(orgId: string, userId: string, role: string) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("org_members").update({ role: role.toLowerCase() }).eq("org_id", orgId).eq("user_id", userId);
  })().catch(() => {});
}

export function removeMember(orgId: string, userId: string) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
  })().catch(() => {});
}

/* -------------------------------- api keys -------------------------------- */

export type ApiKeyRowDb = { id: string; name: string; last4: string; created: string; lastUsed: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function fetchApiKeys(): Promise<{ orgId: string; keys: ApiKeyRowDb[] } | null> {
  const s = await session();
  if (!s) return null;
  const orgId = await firstOrgId(s);
  if (!orgId) return null;
  const { data, error } = await s.supabase
    .from("api_keys")
    .select("id,name,last4,created_at,last_used_at,revoked_at")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  if (error || !data) return null;
  return {
    orgId,
    keys: data.map((k) => ({
      id: k.id,
      name: k.name,
      last4: k.last4,
      created: fmtDate(k.created_at),
      lastUsed: k.last_used_at ? timeAgo(k.last_used_at) : "never",
    })),
  };
}

// The plaintext key exists only client-side, once; the DB stores its hash.
// Returns the new row id so the UI can target later revokes.
export async function insertApiKey(orgId: string, name: string, plaintext: string): Promise<string | null> {
  try {
    const s = await session();
    if (!s) return null;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext));
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data, error } = await s.supabase
      .from("api_keys")
      .insert({ org_id: orgId, name, key_hash: hash, last4: plaintext.slice(-4), created_by: s.userId })
      .select("id")
      .single();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

export function revokeApiKey(id: string) {
  void (async () => {
    const s = await session();
    if (!s) return;
    await s.supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  })().catch(() => {});
}

/* ---------------------------------- runs ----------------------------------- */

export type RunRowDb = { id: string; status: string; dur: string; time: string };

// Recent agent runs for the editor's Run-history drawer. Written only by the
// data plane (service role); read here through RLS membership.
export async function fetchRuns(): Promise<RunRowDb[] | null> {
  const s = await session();
  if (!s) return null;
  const orgId = await firstOrgId(s);
  if (!orgId) return null;
  const { data, error } = await s.supabase
    .from("runs")
    .select("id,status,duration_ms,created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error || !data || data.length === 0) return null;
  return data.map((r) => ({
    id: `run_${r.id.replace(/-/g, "").slice(0, 6)}`,
    status: r.status,
    dur: r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—",
    time: timeAgo(r.created_at),
  }));
}

export type RunStats = { total: number; successRate: number; avgMs: number };

// Aggregate over the org's recent runs for the Billing usage strip.
export async function fetchRunStats(): Promise<RunStats | null> {
  const s = await session();
  if (!s) return null;
  const orgId = await firstOrgId(s);
  if (!orgId) return null;
  const { data, error } = await s.supabase
    .from("runs")
    .select("status,duration_ms")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data || data.length === 0) return null;
  const finished = data.filter((r) => r.status === "completed" || r.status === "failed");
  const completed = finished.filter((r) => r.status === "completed").length;
  const durations = data.filter((r) => r.duration_ms != null).map((r) => r.duration_ms as number);
  return {
    total: data.length,
    successRate: finished.length ? Math.round((completed / finished.length) * 100) : 100,
    avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
  };
}

/* ------------------------------ notifications ----------------------------- */

export type NotificationRowDb = { id: string; kind: string; title: string; body: string; time: string; unread: boolean };

export async function fetchNotifications(): Promise<NotificationRowDb[] | null> {
  const s = await session();
  if (!s) return null;
  const { data, error } = await s.supabase
    .from("notifications")
    .select("id,kind,title,body,read,created_at")
    .eq("user_id", s.userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data || data.length === 0) return null;
  return data.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    time: timeAgo(n.created_at),
    unread: !n.read,
  }));
}

export function markNotificationsRead(ids: string[] | "all") {
  void (async () => {
    const s = await session();
    if (!s) return;
    let q = s.supabase.from("notifications").update({ read: true }).eq("user_id", s.userId);
    if (ids !== "all") q = q.in("id", ids);
    await q;
  })().catch(() => {});
}
