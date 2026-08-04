"use client";

import { useMemo, useSyncExternalStore } from "react";

// What a workflow has actually done on this device: the runs the builder walked
// and the edits that produced the graph. Same one-cache-one-event shape as
// lib/mcp-servers.ts, so the toolbar and the inspector's tabs read one source
// without a state library.
//
// Nothing here is seeded. A workflow nobody has run has no runs, and the Runs
// tab says exactly that rather than inventing a history for it.

export type RunOutcome = "ok" | "failed";

export type WorkflowRun = {
  id: string;
  at: number;
  outcome: RunOutcome;
  /** Steps the run walked, so a chain edited since is not read as a failure. */
  steps: number;
  /** USDC those steps quote — the Runs tab carries the note about what that is. */
  cost: number;
  ms: number;
};

export type WorkflowEdit = {
  id: string;
  at: number;
  text: string;
  /** Set when repeated edits of one field should collapse into a single line. */
  key?: string;
};

export type Activity = { runs: WorkflowRun[]; edits: WorkflowEdit[] };

// Trimmed on write: a long builder session produces hundreds of edits, and the
// draft graphs have to share one origin's storage with everything else.
const MAX_RUNS = 40;
const MAX_EDITS = 60;
/** Repeated edits of one field inside this window replace the previous line.
 *  Exported because the caller has to build the line the same way it collapses:
 *  a rename inside the window still has to name where the burst started. */
export const COALESCE_MS = 8000;

const KEY = "ripar-wf-activity";
const EVENT = "ripar:wf-activity";
const VERSION = 1;

type Root = Record<string, Activity>;

// Frozen so a caller cannot mutate the value every empty workflow shares.
export const NO_ACTIVITY: Activity = Object.freeze({ runs: [], edits: [] }) as Activity;
const EMPTY_ROOT: Root = Object.freeze({}) as Root;

let cache: Root | null = null;

function isRun(v: unknown): v is WorkflowRun {
  const r = v as WorkflowRun | null;
  return (
    !!r &&
    typeof r.id === "string" &&
    Number.isFinite(r.at) &&
    (r.outcome === "ok" || r.outcome === "failed") &&
    Number.isFinite(r.steps) &&
    Number.isFinite(r.cost) &&
    Number.isFinite(r.ms)
  );
}

function isEdit(v: unknown): v is WorkflowEdit {
  const e = v as WorkflowEdit | null;
  return !!e && typeof e.id === "string" && typeof e.text === "string" && Number.isFinite(e.at);
}

/** Anything unrecognised is dropped rather than half-restored — a broken entry
 *  must never take the builder down on mount. */
function read(): Root {
  if (typeof window === "undefined") return EMPTY_ROOT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_ROOT;
    const parsed = JSON.parse(raw) as { version?: number; workflows?: unknown };
    if (parsed.version !== VERSION || !parsed.workflows || typeof parsed.workflows !== "object") return EMPTY_ROOT;

    const out: Root = {};
    for (const [id, value] of Object.entries(parsed.workflows as Record<string, unknown>)) {
      const v = value as Partial<Activity> | null;
      if (!v) continue;
      const runs = Array.isArray(v.runs) ? v.runs.filter(isRun) : [];
      const edits = Array.isArray(v.edits) ? v.edits.filter(isEdit) : [];
      if (runs.length || edits.length) out[id] = { runs, edits };
    }
    return out;
  } catch {
    return EMPTY_ROOT;
  }
}

function snapshot(): Root {
  if (cache === null) cache = read();
  return cache;
}

function write(next: Root) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, workflows: next }));
  } catch {
    /* private mode or quota — the session still holds the new value */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  // A storage event means another tab wrote, so our snapshot is stale.
  const onStorage = () => {
    cache = null;
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function put(workflowId: string, next: Activity) {
  write({ ...snapshot(), [workflowId]: next });
}

export function recordRun(workflowId: string, run: Omit<WorkflowRun, "id" | "at">) {
  const current = snapshot()[workflowId] ?? NO_ACTIVITY;
  const entry: WorkflowRun = { id: uid("run"), at: Date.now(), ...run };
  put(workflowId, { ...current, runs: [entry, ...current.runs].slice(0, MAX_RUNS) });
}

/**
 * Appends an edit. Passing `key` collapses a burst of edits to the same field —
 * typing a name is one change the user made, not eleven.
 */
export function recordEdit(workflowId: string, text: string, key?: string) {
  const current = snapshot()[workflowId] ?? NO_ACTIVITY;
  const [newest] = current.edits;
  const merge = !!key && newest?.key === key && Date.now() - newest.at < COALESCE_MS;
  const entry: WorkflowEdit = { id: uid("ed"), at: Date.now(), text, key };
  const rest = merge ? current.edits.slice(1) : current.edits;
  put(workflowId, { ...current, edits: [entry, ...rest].slice(0, MAX_EDITS) });
}

/** Used when a workflow is deleted — its history should not outlive it. */
export function clearActivity(workflowId: string) {
  const root = snapshot();
  if (!(workflowId in root)) return;
  const next = { ...root };
  delete next[workflowId];
  write(next);
}

export function useActivity(workflowId: string): Activity {
  const root = useSyncExternalStore(subscribe, snapshot, () => EMPTY_ROOT);
  return useMemo(() => root[workflowId] ?? NO_ACTIVITY, [root, workflowId]);
}
