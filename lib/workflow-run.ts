"use client";

/**
 * Running a workflow, for real.
 *
 * This replaced a setInterval that walked the chain a step at a time and then
 * recorded `outcome: "ok"` with a cost summed from the static `price` fields on
 * the steps. Nothing was ever requested. The copy around it was careful —
 * "walked", "quotes" rather than "cost" — but a timer that reports success for
 * work it never attempted is a simulation of a run, and the one thing a run has
 * to be is real.
 *
 * What happens now: a `call` step issues an actual HTTP request to an actual
 * endpoint from the deployed agent's published manifest, with no payment header
 * attached. The endpoint is x402-gated, so the correct answer is 402 carrying a
 * base64 `PAYMENT-REQUIRED` challenge, and the price this run reports is decoded
 * from that challenge — the server's number, at the moment it was asked, not the
 * number sitting in the template.
 *
 * The other step kinds do not execute, and are reported as not executed rather
 * than animated. A trigger has no backend to fire, a condition has nothing to
 * evaluate against, and an onchain action needs a signer this workspace does not
 * have yet. Marking them "ok" because time passed is the failure mode this file
 * exists to avoid.
 */

import type { Step, StepKind, Workflow } from "@/lib/app-data";
import type { RealEndpoint } from "@/lib/real-data";

export type StepResult = {
  name: string;
  kind: StepKind;
  /** True only when a request actually went out and came back. */
  executed: boolean;
  status?: number;
  /** USDC the SERVER quoted, decoded from its challenge. Null if it named none. */
  quotedUsdc?: number | null;
  ms?: number;
  ok: boolean;
  detail: string;
};

export type RunResult = {
  results: StepResult[];
  executed: number;
  /** Summed from what the servers quoted, so it is empty when nothing ran. */
  quotedUsdc: number;
  ms: number;
  ok: boolean;
};

/** Why a step kind cannot be executed from here, in the caller's words. */
const NOT_EXECUTABLE: Record<Exclude<StepKind, "call">, string> = {
  trigger: "a trigger fires from outside; there is nothing to request",
  condition: "evaluated against a previous step's output, and none ran",
  action: "an onchain action needs a signer — no wallet is connected",
  mcp: "runs against a connected MCP server; none is connected",
};

/**
 * Pull the quoted amount out of an x402 challenge.
 *
 * The header is base64 JSON with an `accepts` array. `maxAmountRequired` is in
 * base units, so it is divided by the asset's decimals rather than shown raw —
 * printing 10000 next to a USDC sign would overstate the price by a factor of a
 * million. Returns null rather than 0 when the shape is not what we expect: a
 * zero would read as "free".
 */
export function quoteFromChallenge(header: string | null): number | null {
  if (!header) return null;
  try {
    const decoded = JSON.parse(atob(header)) as {
      accepts?: Array<{ maxAmountRequired?: string | number; amount?: string | number; extra?: { decimals?: number } }>;
    };
    const a = decoded.accepts?.[0];
    if (!a) return null;
    const raw = a.maxAmountRequired ?? a.amount;
    if (raw === undefined || raw === null) return null;
    const decimals = a.extra?.decimals ?? 6;
    const n = Number(raw);
    return Number.isFinite(n) ? n / 10 ** decimals : null;
  } catch {
    return null;
  }
}

/** Match a step to a real endpoint by name, else fall back to the first live one. */
function endpointFor(step: Step, endpoints: RealEndpoint[]): RealEndpoint | null {
  const live = endpoints.filter((e) => e.live && e.url);
  if (live.length === 0) return null;
  const needle = step.name.toLowerCase();
  return live.find((e) => needle.includes(e.name.toLowerCase())) ?? live[0];
}

async function runCall(step: Step, endpoints: RealEndpoint[], signal: AbortSignal): Promise<StepResult> {
  const base = { name: step.name, kind: step.kind };
  const ep = endpointFor(step, endpoints);
  if (!ep) {
    return { ...base, executed: false, ok: false, detail: "no live endpoint in the manifest to call" };
  }

  const started = performance.now();
  try {
    const res = await fetch(ep.url, {
      method: ep.method || "POST",
      headers: { "content-type": "application/json" },
      // A real payload, so a 402 is the paywall answering rather than the
      // validator rejecting an empty body.
      body: JSON.stringify({ text: `Workflow step "${step.name}" calling ${ep.name}.` }),
      signal,
    });
    const ms = Math.round(performance.now() - started);
    const quotedUsdc = quoteFromChallenge(res.headers.get("payment-required"));

    // 402 IS the success case here: the endpoint is paid, nothing was paid, and
    // it answered with a priced challenge. A 200 would mean the paywall is off.
    if (res.status === 402) {
      return {
        ...base, executed: true, status: 402, quotedUsdc, ms, ok: true,
        detail: quotedUsdc === null
          ? `${ep.name} returned 402 but named no price in its challenge`
          : `${ep.name} quoted ${quotedUsdc} USDC · 402 in ${ms}ms`,
      };
    }
    return {
      ...base, executed: true, status: res.status, quotedUsdc, ms,
      ok: false,
      detail: `${ep.name} answered ${res.status}, expected 402 from a paid endpoint`,
    };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    return {
      ...base, executed: true, ms, ok: false,
      detail: `${ep.name} could not be reached — ${(err as Error).message}`,
    };
  }
}

/**
 * Walk the chain, executing what can be executed.
 *
 * Steps run in order and in series, because a workflow is a sequence: firing
 * them together would report a chain that this code never actually walked.
 */
export async function runWorkflow(
  w: Workflow,
  endpoints: RealEndpoint[],
  opts: { signal?: AbortSignal; onStep?: (index: number) => void } = {},
): Promise<RunResult> {
  const signal = opts.signal ?? new AbortController().signal;
  const results: StepResult[] = [];
  const started = performance.now();

  for (let i = 0; i < w.steps.length; i++) {
    opts.onStep?.(i);
    const step = w.steps[i];
    if (step.kind === "call") {
      results.push(await runCall(step, endpoints, signal));
    } else {
      results.push({
        name: step.name, kind: step.kind, executed: false, ok: true,
        detail: NOT_EXECUTABLE[step.kind],
      });
    }
  }

  const executed = results.filter((r) => r.executed).length;
  return {
    results,
    executed,
    quotedUsdc: results.reduce((sum, r) => sum + (r.quotedUsdc ?? 0), 0),
    ms: Math.round(performance.now() - started),
    // A run with nothing executable in it is not a success; there is no evidence
    // either way, and reporting "ok" would be the old behaviour with new words.
    ok: executed > 0 && results.every((r) => r.ok),
  };
}
