import assert from "node:assert/strict";
import test from "node:test";
import { mustWarnAboutPersistence } from "./schema-banner.ts";
import type { SchemaState } from "./db.ts";

/** Every member of the union, listed so adding one to db.ts without adding it
 *  here is a type error rather than a silent gap. */
const ALL: Record<SchemaState, true> = {
  ready: true,
  missing: true,
  unreachable: true,
  unconfigured: true,
  unknown: true,
};

test("only `ready` stays quiet", () => {
  assert.equal(mustWarnAboutPersistence("ready"), false);
});

test("every other state warns — silence is never the default", () => {
  for (const state of Object.keys(ALL) as SchemaState[]) {
    if (state === "ready") continue;
    assert.equal(mustWarnAboutPersistence(state), true, `${state} must warn`);
  }
});

test("the state this deployment is actually in warns", () => {
  // Measured, not assumed. NEXT_PUBLIC_SUPABASE_URL is set on this project, so
  // a client IS created and the probe runs; the host
  // (shftwalxcykqonzbzmpe.supabase.co) no longer resolves, the fetch throws,
  // and schemaState() reports `unreachable`.
  //
  // I first recorded this as `unconfigured` after reading the code and assuming
  // no credentials were set — I had checked the env of the wrong project. The
  // banner's own wording on the live site ("could not be reached at all") is
  // what corrected it.
  assert.equal(mustWarnAboutPersistence("unreachable"), true);
  // Kept alongside, because a project with no credentials must warn too.
  assert.equal(mustWarnAboutPersistence("unconfigured"), true);
});
