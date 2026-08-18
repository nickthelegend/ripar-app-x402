/**
 * C3 + H3 against a real database.
 *
 * Real Postgres, real GoTrue, the project's own migration applied to a fresh
 * volume. No mock client, no in-memory shim: if any assertion below holds, it
 * holds because Postgres enforced it.
 */
import { createClient } from "@supabase/supabase-js";

const URL = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const stamp = process.argv[2];
const email = `agent-${stamp}@ripar.test`;
const password = `pw-${stamp}-Aa1!`;
let failures = 0;
const ok = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };

const anon = createClient(URL, ANON);

// --- sign up ------------------------------------------------------------
const { data: signUp, error: signUpErr } = await anon.auth.signUp({ email, password });
ok(!signUpErr && !!signUp.user, `sign-up created a user${signUpErr ? ` — ${signUpErr.message}` : ` (${signUp?.user?.id?.slice(0, 8)}…)`}`);
const uid = signUp?.user?.id;

// --- sign in ------------------------------------------------------------
const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
ok(!signInErr && !!signIn.session, `sign-in returned a session${signInErr ? ` — ${signInErr.message}` : ""}`);

// --- wrong password must be refused -------------------------------------
const { error: badErr } = await anon.auth.signInWithPassword({ email, password: "wrong-password" });
ok(!!badErr, `a wrong password is refused${badErr ? ` — "${badErr.message}"` : " — IT WAS ACCEPTED"}`);

// --- the row is really in Postgres --------------------------------------
const authed = createClient(URL, ANON, {
  global: { headers: { Authorization: `Bearer ${signIn?.session?.access_token}` } },
});
const { data: prof, error: profErr } = await authed.from("profiles").select("id,email,name").eq("id", uid).single();
ok(!profErr && prof?.id === uid, `the profile row exists and is readable by its owner${profErr ? ` — ${profErr.message}` : ` (${prof?.email})`}`);

// --- persistence: write, then read back through a NEW client ------------
const { error: upErr } = await authed.from("profiles").update({ name: "Verified Agent" }).eq("id", uid);
ok(!upErr, `owner can update their own profile${upErr ? ` — ${upErr.message}` : ""}`);
const fresh = createClient(URL, ANON, {
  global: { headers: { Authorization: `Bearer ${signIn?.session?.access_token}` } },
});
const { data: reread } = await fresh.from("profiles").select("name").eq("id", uid).single();
ok(reread?.name === "Verified Agent", `the write persisted — a new client reads back "${reread?.name}"`);

// --- RLS actually enforces ----------------------------------------------
// This must be a client that has never authenticated. `anon` performed the
// sign-up, so supabase-js cached that session and attaches its JWT to every
// request — using it here proved only that a signed-in user can read their own
// row, which is the opposite of the question.
const stranger = createClient(URL, ANON);
const { data: leaked } = await stranger.from("profiles").select("id").eq("id", uid);
ok((leaked ?? []).length === 0, `RLS blocks a caller who never signed in (${(leaked ?? []).length} rows leaked)`);

// --- the org the signup trigger created ---------------------------------
// Orgs are not inserted by the client and there is deliberately no INSERT
// policy on the table: handle_new_user is SECURITY DEFINER and creates the org
// and the membership row alongside the profile. Asserting a client-side insert
// tested a path the product does not have.
const { data: orgs, error: orgErr } = await authed.from("orgs").select("id,slug,owner_id");
ok(!orgErr && (orgs ?? []).length === 1 && orgs[0].owner_id === uid,
  `signup created exactly one org owned by this user${orgErr ? ` — ${orgErr.message}` : ` (${orgs?.[0]?.slug})`}`);

const { data: mem } = await authed.from("org_members").select("org_id,user_id,role");
ok((mem ?? []).length === 1 && mem[0].role === "owner",
  `and made them its owner in org_members (${(mem ?? []).length} row, role ${mem?.[0]?.role})`);

// --- a second user must not see the first user's org --------------------
const other = createClient(URL, ANON);
const otherEmail = `other-${stamp}@ripar.test`;
await other.auth.signUp({ email: otherEmail, password });
const { data: otherSignIn } = await other.auth.signInWithPassword({ email: otherEmail, password });
const otherAuthed = createClient(URL, ANON, {
  global: { headers: { Authorization: `Bearer ${otherSignIn?.session?.access_token}` } },
});
const { data: otherOrgs } = await otherAuthed.from("orgs").select("id,slug");
const sawMine = (otherOrgs ?? []).some((o) => o.id === orgs?.[0]?.id);
ok(!sawMine && (otherOrgs ?? []).length === 1,
  `a second user sees only their own org, not the first user's (${(otherOrgs ?? []).length} row, leaked=${sawMine})`);

console.log(`\n  ${failures === 0 ? "ALL PASS" : failures + " FAILED"} — real Postgres, real auth, real RLS\n`);
process.exit(failures === 0 ? 0 : 1);
