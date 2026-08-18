// Shared types and presentation helpers for the workspace.
//
// This was the workspace's mock data layer. Every table that shows a number now
// reads lib/real-data — the deployed agent's own manifest, and the chain — so
// the sample ENDPOINTS, AGENTS, RUNS, SAMPLE_CALLERS and month totals had been
// orphaned for a while: nothing outside this file imported them.
//
// Dead sample data is not harmless, which is why it is deleted rather than left
// tidy. It carried USDC_ASSET_ID = "31566704" and X402_NETWORK =
// "algorand-mainnet" — MAINNET values, sitting in an app that settles on TestNet
// with asset 10458941. Unreferenced today, and precisely the constant someone
// reaches for when wiring up the next view, at which point the workspace would
// quote an asset it cannot settle in.
//
// What remains is what is actually used: the shared TYPES (Endpoint, Agent, Run
// and friends are the shape lib/real-data returns), STEP_KIND_IDS, STATUS_TONE,
// the `usd`/`compact`/`costOfSteps` helpers, and WORKFLOWS — starter templates
// the builder offers, which state plainly that they have never run.

export type Status = "live" | "paused" | "draft" | "error";
export type AgentStatus = "idle" | "working" | "bidding" | "offline";

export type Endpoint = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  status: Status;
  price: number; // USDC per request
  calls24h: number;
  callsTotal: number;
  earned: number; // USDC, lifetime
  p50: number; // ms
  successRate: number; // 0–1
  listed: boolean; // published to the x402 Bazaar
  tags: string[];
  updated: string;
};

export type StepKind = "trigger" | "call" | "condition" | "action" | "mcp";

/** Every kind that may appear in a stored graph. The builder's "Add step"
 *  toolbar offers a subset — an MCP step is added from the tool palette. */
export const STEP_KIND_IDS: StepKind[] = ["trigger", "call", "condition", "action", "mcp"];

export type Step = {
  name: string;
  kind: StepKind;
  // Only a paid call carries a price. Triggers and conditions cost nothing, and
  // an onchain action pays network fees rather than x402. An MCP step carries
  // one when the tool behind it is metered.
  price?: number; // USDC
  // Set only on an MCP step: the catalogue tool it runs, e.g. "slack.post_message".
  tool?: string;
};

/**
 * A workflow the builder can open. Deliberately carries no telemetry — no run
 * count, no success rate, no "last run". These four are templates that have
 * never executed anywhere, and nothing in this app schedules a workflow, so any
 * such figure would be invented. What a run costs is not stored either: it is
 * the sum of the chain's step prices, which cannot drift from the chain.
 */
export type Workflow = {
  id: string;
  name: string;
  summary: string;
  trigger: string;
  steps: Step[];
};

/** What one pass down the chain quotes, in USDC. */
export const costOfSteps = (steps: Step[]) => steps.reduce((sum, s) => sum + (s.price ?? 0), 0);

export type Agent = {
  id: string;
  handle: string;
  name: string;
  summary: string;
  status: AgentStatus;
  skills: string[];
  jobsWon: number;
  jobsBid: number;
  successRate: number;
  earned: number; // USDC
  avgBid: number;
  responseMs: number;
  joined: string;
  mine: boolean;
};

export type Run = {
  id: string;
  target: string;
  kind: "endpoint" | "workflow" | "job";
  outcome: "ok" | "failed" | "retried";
  cost: number;
  ms: number;
  when: string;
  tx: string | null;
};

/** Starter chains for the builder. Each describes a shape worth building; none
 *  of them has ever run, here or anywhere else. */
export const WORKFLOWS: Workflow[] = [
  { id: "wf_8c21", name: "Liquidation Guard", summary: "Watches a Folks Finance position and tops up collateral before it breaches.", trigger: "cron · every 5m",
    steps: [{ name: "cron 5m", kind: "trigger" }, { name: "read health", kind: "call", price: 0.02 }, { name: "health < 1.4", kind: "condition" }, { name: "supply collateral", kind: "action" }] },
  { id: "wf_3f70", name: "Treasury Sweep", summary: "Moves idle USDC into the yield vault once a floor is cleared.", trigger: "cron · hourly",
    steps: [{ name: "cron 1h", kind: "trigger" }, { name: "read balance", kind: "call", price: 0.03 }, { name: "balance > 500", kind: "condition" }, { name: "deposit", kind: "action" }] },
  { id: "wf_5a12", name: "Feed Watchdog", summary: "Re-publishes the price feed if a quote goes stale.", trigger: "onchain · Swap",
    steps: [{ name: "on Swap", kind: "trigger" }, { name: "read quote age", kind: "call", price: 0.01 }, { name: "age > 60s", kind: "condition" }, { name: "republish", kind: "action" }] },
  { id: "wf_9b44", name: "Invoice Reconciler", summary: "Matches incoming USDC against open invoices each morning.", trigger: "cron · daily 09:00",
    steps: [{ name: "cron daily", kind: "trigger" }, { name: "fetch receipts", kind: "call", price: 0.08 }, { name: "unmatched > 0", kind: "condition" }, { name: "Post message", kind: "mcp", tool: "slack.post_message" }] },
];

/* ── x402 facts ──────────────────────────────────────────────────────────
   Nothing reads these any more: the test console, the Logs view and the
   generated receipts that quoted them have all been removed, and what the
   surfaces now show comes from the agent's manifest and the chain. Left in
   place with the rest of the mock module rather than half-emptied — see the
   note at the top of the file. */

// The sample request/response bodies that used to live here fed the endpoint
// test console. That console was removed: it invented a response for whatever
// endpoint it was pointed at, and the Endpoints view already carries a curl
// snippet that gets a real 402 out of the live agent.

/* ── derived summaries ─────────────────────────────────────────────────── */

export const usd = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

export const STATUS_TONE: Record<Status | AgentStatus, { dot: string; text: string; label: string }> = {
  live:    { dot: "bg-emerald-500", text: "text-emerald-700", label: "Live" },
  working: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Working" },
  bidding: { dot: "bg-amber-500",   text: "text-amber-700",   label: "Bidding" },
  paused:  { dot: "bg-neutral-400", text: "text-neutral-500", label: "Paused" },
  idle:    { dot: "bg-sky-500",     text: "text-sky-700",     label: "Idle" },
  draft:   { dot: "bg-neutral-300", text: "text-neutral-400", label: "Draft" },
  offline: { dot: "bg-neutral-300", text: "text-neutral-400", label: "Offline" },
  error:   { dot: "bg-rose-500",    text: "text-rose-700",    label: "Error" },
};
