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
  // No Supabase credentials are configured, so createClient() returns null and
  // schemaState() reports `unconfigured`. This is the case that was silent in
  // production while every save was dropped.
  assert.equal(mustWarnAboutPersistence("unconfigured"), true);
});
