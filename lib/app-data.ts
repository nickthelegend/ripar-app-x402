// Mock data for the workspace. Shaped exactly like what the API will return,
// so swapping in a real fetch later is a change of source, not of components.

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

export type Workflow = {
  id: string;
  name: string;
  summary: string;
  status: Status;
  trigger: string;
  runs24h: number;
  lastRun: string;
  costPerRun: number;
  successRate: number;
  steps: { name: string; kind: "trigger" | "call" | "condition" | "action" }[];
};

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

export const ENDPOINTS: Endpoint[] = [
  { id: "ep_8f21", name: "Price Feed", slug: "algo-usd/spot", summary: "Signed ALGO/USD quote, refreshed each block.", status: "live", price: 0.001, calls24h: 12480, callsTotal: 384210, earned: 384.21, p50: 180, successRate: 0.998, listed: true, tags: ["oracle", "algorand"], updated: "2 min ago" },
  { id: "ep_4b19", name: "Wallet Risk Score", slug: "wallet-risk/score", summary: "Risk band for an address from its onchain history.", status: "live", price: 0.01, calls24h: 4120, callsTotal: 91455, earned: 914.55, p50: 340, successRate: 0.991, listed: true, tags: ["risk", "compliance"], updated: "9 min ago" },
  { id: "ep_2c07", name: "PDF → Rows", slug: "extract/pdf-table", summary: "Pulls line items out of a PDF into structured rows.", status: "live", price: 0.05, calls24h: 618, callsTotal: 14203, earned: 710.15, p50: 2900, successRate: 0.967, listed: true, tags: ["extraction"], updated: "1 h ago" },
  { id: "ep_9d33", name: "NFT Trait Rarity", slug: "nft/rarity", summary: "Rarity ranking for a collection asset id.", status: "paused", price: 0.004, calls24h: 0, callsTotal: 22890, earned: 91.56, p50: 210, successRate: 0.994, listed: true, tags: ["nft"], updated: "3 d ago" },
  { id: "ep_1a55", name: "Summarise", slug: "text/summarize", summary: "280-character summary of any text payload.", status: "draft", price: 0.01, calls24h: 0, callsTotal: 0, earned: 0, p50: 0, successRate: 0, listed: false, tags: ["llm"], updated: "just now" },
  { id: "ep_7e02", name: "Sanctions Check", slug: "compliance/sanctions", summary: "Screens an address against published lists.", status: "error", price: 0.02, calls24h: 44, callsTotal: 8120, earned: 162.4, p50: 5400, successRate: 0.72, listed: false, tags: ["compliance"], updated: "12 min ago" },
];

export const WORKFLOWS: Workflow[] = [
  { id: "wf_8c21", name: "Liquidation Guard", summary: "Watches a Folks Finance position and tops up collateral before it breaches.", status: "live", trigger: "cron · every 5m", runs24h: 288, lastRun: "3 min ago", costPerRun: 0.02, successRate: 0.997,
    steps: [{ name: "cron 5m", kind: "trigger" }, { name: "read health", kind: "call" }, { name: "health < 1.4", kind: "condition" }, { name: "supply collateral", kind: "action" }] },
  { id: "wf_3f70", name: "Treasury Sweep", summary: "Moves idle USDC into the yield vault once a floor is cleared.", status: "live", trigger: "cron · hourly", runs24h: 24, lastRun: "41 min ago", costPerRun: 0.03, successRate: 1,
    steps: [{ name: "cron 1h", kind: "trigger" }, { name: "read balance", kind: "call" }, { name: "balance > 500", kind: "condition" }, { name: "deposit", kind: "action" }] },
  { id: "wf_5a12", name: "Feed Watchdog", summary: "Re-publishes the price feed if a quote goes stale.", status: "paused", trigger: "onchain · Swap", runs24h: 0, lastRun: "2 d ago", costPerRun: 0.01, successRate: 0.981,
    steps: [{ name: "on Swap", kind: "trigger" }, { name: "read quote age", kind: "call" }, { name: "age > 60s", kind: "condition" }, { name: "republish", kind: "action" }] },
  { id: "wf_9b44", name: "Invoice Reconciler", summary: "Matches incoming USDC against open invoices each morning.", status: "draft", trigger: "cron · daily 09:00", runs24h: 0, lastRun: "never", costPerRun: 0.08, successRate: 0,
    steps: [{ name: "cron daily", kind: "trigger" }, { name: "fetch receipts", kind: "call" }, { name: "unmatched > 0", kind: "condition" }, { name: "notify", kind: "action" }] },
];

export const AGENTS: Agent[] = [
  { id: "ag_9c11", handle: "wallet-enricher", name: "Wallet Enricher", summary: "Labels addresses from onchain history and clustering heuristics.", status: "working", skills: ["enrichment", "algorand", "labelling"], jobsWon: 412, jobsBid: 604, successRate: 0.985, earned: 1284.6, avgBid: 1.85, responseMs: 340, joined: "Mar 2026", mine: true },
  { id: "ag_be07", handle: "doc-parser", name: "Doc Parser", summary: "Turns scanned invoices and statements into structured rows.", status: "idle", skills: ["extraction", "ocr"], jobsWon: 1204, jobsBid: 1388, successRate: 0.991, earned: 4820.15, avgBid: 2.1, responseMs: 890, joined: "Jan 2026", mine: true },
  { id: "ag_04f2", handle: "market-scout", name: "Market Scout", summary: "Monitors DEX pairs and reports arbitrage windows as they open.", status: "bidding", skills: ["defi", "monitoring"], jobsWon: 88, jobsBid: 240, successRate: 0.943, earned: 211.2, avgBid: 2.4, responseMs: 120, joined: "Jun 2026", mine: false },
  { id: "ag_7d18", handle: "sanction-screen", name: "Sanction Screen", summary: "Screens counterparties against published sanctions lists.", status: "idle", skills: ["compliance", "risk"], jobsWon: 640, jobsBid: 702, successRate: 0.996, earned: 1920.0, avgBid: 3.0, responseMs: 460, joined: "Feb 2026", mine: false },
  { id: "ag_2e90", handle: "chain-summarizer", name: "Chain Summariser", summary: "Writes plain-language digests of a wallet's recent activity.", status: "working", skills: ["llm", "reporting"], jobsWon: 315, jobsBid: 400, successRate: 0.974, earned: 630.5, avgBid: 2.0, responseMs: 1400, joined: "Apr 2026", mine: false },
  { id: "ag_5c63", handle: "nft-appraiser", name: "NFT Appraiser", summary: "Prices collection assets from trait rarity and recent sales.", status: "offline", skills: ["nft", "pricing"], jobsWon: 96, jobsBid: 180, successRate: 0.912, earned: 172.8, avgBid: 1.8, responseMs: 720, joined: "May 2026", mine: false },
];

export const RUNS: Run[] = [
  { id: "req_8f21c", target: "algo-usd/spot", kind: "endpoint", outcome: "ok", cost: 0.001, ms: 178, when: "just now", tx: "7A2F9C1B" },
  { id: "run_8c21a", target: "Liquidation Guard", kind: "workflow", outcome: "retried", cost: 0.02, ms: 3240, when: "3 min ago", tx: "4B812D0A" },
  { id: "req_4b19d", target: "wallet-risk/score", kind: "endpoint", outcome: "ok", cost: 0.01, ms: 336, when: "6 min ago", tx: "C11E70FF" },
  { id: "job_2f88",  target: "Enrich 5,000 addresses", kind: "job", outcome: "ok", cost: 1.85, ms: 184000, when: "22 min ago", tx: "9E4A1B22" },
  { id: "req_7e02f", target: "compliance/sanctions", kind: "endpoint", outcome: "failed", cost: 0, ms: 5400, when: "31 min ago", tx: null },
  { id: "run_3f70b", target: "Treasury Sweep", kind: "workflow", outcome: "ok", cost: 0.03, ms: 2100, when: "41 min ago", tx: "1D77C904" },
];

/* ── derived summaries ─────────────────────────────────────────────────── */

export const settledThisMonth = 1284.6;
export const callsThisMonth = ENDPOINTS.reduce((s, e) => s + e.callsTotal, 0);

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
