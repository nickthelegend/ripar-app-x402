import type { SchemaState } from "./db";

/**
 * Whether the Settings page must warn that edits are not being persisted.
 *
 * Extracted from the JSX because the condition has been wrong twice in the same
 * direction. It listed the states that should warn — first only `missing`, then
 * `missing` and `unreachable` — and each time a state outside the list appeared,
 * the page fell silent and dropped saves without a word. The second time, the
 * silent state was the one this deployment actually runs in.
 *
 * Inverting it fixes the class rather than the instance: `ready` is the only
 * state in which there is evidence a save persists, so every other state warns,
 * including one added tomorrow by someone who never reads this file.
 */
export function mustWarnAboutPersistence(state: SchemaState): boolean {
  return state !== "ready";
}
