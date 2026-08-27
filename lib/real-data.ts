"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AGENT_ORIGIN, MANIFEST_ROUTE } from "./agent-origin";

/**
 * The workspace's real data layer.
 *
 * Every row here comes from something that exists: the live agent's own
 * manifest, and settlements read off whichever Algorand network that manifest
 * declares. Nothing is invented.
 *
 * Where there is genuinely nothing to show — no workflows, because that needs a
 * backend we have not built — the surface says so instead of inventing rows.
 * A dashboard that fabricates its own contents is worth less than an empty one.
 */

/**
 * Which chain to read.
 *
 * This used to be hardcoded to MainNet while the agent settles on TestNet — so
 * "Paid calls received" and "Earned" were pinned at zero STRUCTURALLY. They
 * would have stayed zero even if somebody paid, because we were looking at a
 * different ledger. An honest zero and a zero you cannot move look identical
 * on screen, which is what made it worth fixing rather than explaining.
 *
 * The manifest declares the network, so follow it rather than assuming.
 */
export type ChainNetwork = "mainnet" | "testnet";

const CHAIN: Record<ChainNetwork, { algod: string; indexer: string; usdc: number; feePayer: string }> = {
  mainnet: {
    algod: "https://mainnet-api.algonode.cloud",
    indexer: "https://mainnet-idx.algonode.cloud",
    usdc: 31_566_704,
    feePayer: "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA",
  },
  testnet: {
    algod: "https://testnet-api.algonode.cloud",
    indexer: "https://testnet-idx.algonode.cloud",
    usdc: 10_458_941,
    // The GoPlausible facilitator sponsors fees from its own account, and its
    // history is how a settlement group is found. If it uses a different one on
    // TestNet this walk finds nothing — which is why the view says how many
    // settlements it saw rather than implying it saw them all.
    feePayer: "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA",
  },
};

/** Re-exported so the views keep one import for the workspace's data. */
export { AGENT_ORIGIN };

export type Loadable<T> = {
  data: T | null;
  status: "loading" | "ready" | "error";
  error: string | null;
};

const decode = (b64?: string) => {
  if (!b64) return null;
  try {
    return atob(b64);
  } catch {
    return null;
  }
};

import { getBlock, type BlockResponse } from "./block-cache";

/** Every browser-side read here goes through one deadline. */
const REQUEST_TIMEOUT_MS = 12_000;

async function j<T>(url: string, signal?: AbortSignal): Promise<T> {
  // AlgoNode is a free public endpoint and it rate-limits. A 429 is not a
  // failure of the query, it is the node asking us to slow down, so retry it
  // with backoff rather than surfacing a gap in the data.
  for (let attempt = 0; ; attempt++) {
    // A deadline per attempt, combined with the caller's own signal.
    //
    // Without this there is no timeout anywhere on the browser side: the only
    // abort is the effect cleanup, so a request that never answers keeps the
    // dashboard on "reading the chain…" for as long as the tab is open. The
    // manifest route protects itself from a hung agent with an 8s timeout, but
    // the browser's request TO that route had none, so a stalled function
    // stalled every tile behind it indefinitely.
    const timer = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timer]) : timer;

    const r = await fetch(url, { signal: combined, cache: "no-store" });
    if (r.ok) return r.json() as Promise<T>;

    // Drain the body of a response we are not going to read. An unread body
    // holds its HTTP/2 stream open — that is what leaves an entry sitting at
    // "pending" in the network panel forever, and it is a real socket, not
    // just a cosmetic row.
    await r.body?.cancel().catch(() => {});

    if (r.status !== 429 || attempt >= 3) throw new Error(`${r.status} ${r.statusText}`);
    await new Promise((res) => setTimeout(res, 250 * 2 ** attempt));
  }
}


/* ── real endpoints, from the agent's own published manifest ───────────── */

export type RealEndpoint = {
  name: string;
  description?: string;
  url: string;
  method: string;
  /** As the manifest states it, e.g. "$0.01" — a display string, not a number. */
  price: string;
  tags?: string[];
  /** The route the caller POSTs to, e.g. "/api/summarize". */
  path: string;
  /**
   * `price` parsed to USDC. Null when the manifest states it in a form we cannot
   * read as a number — better to say so than to guess a figure that ends up in
   * somebody's deploy config.
   */
  priceUsdc: number | null;
  live: boolean;
};

/** "$0.01" → 0.01. Null when there is no number in there to take. */
function parsePrice(price: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(price ?? "");
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** The path, or the whole URL if it will not parse — never a fabricated route. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export type Manifest = {
  name: string;
  handle: string;
  description: string;
  payTo: string;
  network: string;
  endpoints: {
    name: string;
    description?: string;
    url: string;
    method: string;
    price: string;
    tags?: string[];
  }[];
  x402?: { network?: string; asset?: { id: number } };
};

/* ── real settlements, read off the chain ──────────────────────────────── */

export type RealRun = {
  id: string;
  target: string;
  round: number;
  when: number;
  amountUsdc: number;
  from: string;
  to: string;
};

async function fetchSettlements(net: ChainNetwork, signal?: AbortSignal, cap = 40): Promise<RealRun[]> {
  const { indexer: INDEXER, usdc: USDC, feePayer: FEE_PAYER } = CHAIN[net];
  const legs = await j<{ transactions?: Record<string, unknown>[] }>(
    `${INDEXER}/v2/accounts/${FEE_PAYER}/transactions?limit=120`,
    signal
  );

  const wanted = (legs.transactions ?? []).filter(
    (t) => t.group && decode(t.note as string)?.startsWith("x402-fee-payer-")
  );
  const rounds = [...new Set(wanted.map((t) => t["confirmed-round"] as number))].slice(0, 12);

  // One shared, serialised, permanently-cached reader. A confirmed block never
  // changes, so the same round is never fetched twice however many components
  // ask for it.
  const blocks: (BlockResponse | null)[] = [];
  for (const r of rounds) blocks.push(await getBlock(INDEXER, r, signal));
  const dropped = blocks.filter((b) => b === null).length;
  if (dropped) {
    console.warn(`[ripar] ${dropped}/${rounds.length} settlement blocks could not be read; the list below is incomplete.`);
  }

  const out: RealRun[] = [];
  for (const blk of blocks) {
    for (const t of blk?.transactions ?? []) {
      const note = decode(t.note);
      if (
        t["tx-type"] === "axfer" &&
        t["asset-transfer-transaction"]?.["asset-id"] === USDC &&
        note?.startsWith("x402-payment-v2-")
      ) {
        const x = t["asset-transfer-transaction"];
        out.push({
          id: t.id,
          target: x.receiver,
          round: t["confirmed-round"],
          when: (t["round-time"] ?? 0) * 1000,
          amountUsdc: (x.amount ?? 0) / 1e6,
          from: t.sender,
          to: x.receiver,
        });
      }
    }
  }
  return out.sort((a, b) => b.round - a.round).slice(0, cap);
}

/* ── real agents: addresses that have actually been paid ───────────────── */

export type RealAgent = {
  address: string;
  calls: number;
  earnedUsdc: number;
  payers: number;
  lastSeen: number;
  medianUsdc: number;
  /** True when this is the agent this workspace deployed. */
  mine: boolean;
};

function agentsFrom(rows: RealRun[], myAddress?: string): RealAgent[] {
  const by = new Map<string, RealRun[]>();
  for (const r of rows) by.set(r.to, [...(by.get(r.to) ?? []), r]);

  const median = (xs: number[]) => {
    const a = [...xs].sort((p, q) => p - q);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };

  return [...by.entries()]
    .map(([address, rs]) => ({
      address,
      calls: rs.length,
      earnedUsdc: rs.reduce((s, r) => s + r.amountUsdc, 0),
      payers: new Set(rs.map((r) => r.from)).size,
      lastSeen: Math.max(...rs.map((r) => r.when)),
      medianUsdc: median(rs.map((r) => r.amountUsdc)),
      mine: Boolean(myAddress) && address === myAddress,
    }))
    .sort((a, b) => b.earnedUsdc - a.earnedUsdc);
}

/* ── the one hook the views consume ────────────────────────────────────── */

export type Workspace = {
  manifest: Manifest | null;
  endpoints: RealEndpoint[];
  runs: RealRun[];
  agents: RealAgent[];
  /** `network` is the chain these rows were actually read from, so a view can
   *  link a transaction to the right explorer instead of assuming MainNet. */
  chain: { network: ChainNetwork; round: number | null; blockTime: number | null };
  /**
   * Settlements to OUR payout address specifically. Agent-wide by necessity —
   * a payment names the address it pays, never the endpoint it paid for.
   */
  mine: { calls: number; earnedUsdc: number };
};

/**
 * The polling implementation. Private: everything reaches it through
 * `useWorkspace`, which shares ONE of these across the whole shell.
 *
 * `enabled` exists so the hook can be called unconditionally — React forbids
 * a conditional hook — while still doing nothing when a provider above is
 * already polling.
 */
/**
 * Seconds per block, inferred from two settlements far enough apart to be
 * meaningful.
 *
 * Returns null rather than a guess when there is not enough spread: with fewer
 * than two runs, or two that landed in the same round, there is no interval to
 * divide by, and "measuring…" is the honest answer.
 */
function measureBlockTime(runs: RealRun[]): number | null {
  const usable = runs.filter((r) => r.round > 0 && r.when > 0);
  if (usable.length < 2) return null;

  let newest = usable[0];
  let oldest = usable[0];
  for (const r of usable) {
    if (r.round > newest.round) newest = r;
    if (r.round < oldest.round) oldest = r;
  }

  const rounds = newest.round - oldest.round;
  const seconds = (newest.when - oldest.when) / 1000;
  if (rounds <= 0 || seconds <= 0) return null;

  const per = seconds / rounds;
  // A real Algorand block is well inside this range. Outside it, the sample is
  // not what we think it is — and a wrong number is worse than none.
  return per > 0.2 && per < 30 ? per : null;
}

function useWorkspacePoll(enabled: boolean): Loadable<Workspace> {
  const [s, setS] = useState<Loadable<Workspace>>({
    data: null,
    status: "loading",
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function load() {
      try {
        // The manifest comes FIRST, on its own, because it names the network.
        // Fetching it alongside the chain calls meant choosing a chain before
        // the agent had told us which one — and the choice was MainNet while
        // the agent settles on TestNet, so every earned figure was pinned at
        // zero and would have stayed there however much anyone paid.
        //
        // Through this app's own origin, not the agent's: the agent sends no
        // CORS header, so a browser is not allowed to read it directly.
        const manifest = await j<Manifest>(MANIFEST_ROUTE, ac.signal).catch(() => null);
        const net: ChainNetwork = manifest?.network === "mainnet" ? "mainnet" : "testnet";
        const { algod: ALGOD } = CHAIN[net];

        const [runs, status] = await Promise.all([
          fetchSettlements(net, ac.signal),
          j<{ "last-round": number }>(`${ALGOD}/v2/status`, ac.signal),
        ]);

        const head = status["last-round"];
        // Block time from the settlements already in hand, not two more round
        // trips.
        //
        // This used to fetch /v2/blocks/{head-5} and /v2/blocks/{head-1} with
        // ?format=json purely to subtract two timestamps. Those were the last
        // two hops of the load and they bought nothing: every run below already
        // carries the round it landed in AND its wall-clock time, so the same
        // figure is a subtraction over a far longer baseline at zero request
        // cost. Two fewer requests per poll, and two fewer things that can hang.
        const blockTime = measureBlockTime(runs);

        const payTo = manifest?.payTo;
        const mineRuns = payTo ? runs.filter((r) => r.to === payTo) : [];

        // No per-endpoint call count or revenue, on purpose. A settlement is a
        // USDC transfer to the agent's payout address; it carries the payer, the
        // amount and a note, but nothing that names which endpoint was called.
        // The totals below are therefore agent-wide, and attributing them to a
        // row would print the same number against every endpoint.
        const endpoints: RealEndpoint[] = (manifest?.endpoints ?? []).map((e) => ({
          ...e,
          path: pathOf(e.url),
          priceUsdc: parsePrice(e.price),
          live: true,
        }));

        if (stopped) return;
        setS({
          status: "ready",
          error: null,
          data: {
            manifest,
            endpoints,
            runs,
            agents: agentsFrom(runs, payTo),
            chain: { network: net, round: head, blockTime },
            mine: {
              calls: mineRuns.length,
              earnedUsdc: mineRuns.reduce((s2, r) => s2 + r.amountUsdc, 0),
            },
          },
        });
      } catch (e) {
        if ((e as Error).name === "AbortError" || stopped) return;
        setS((p) => ({ ...p, status: "error", error: (e as Error).message }));
      }
      if (!stopped) timer = setTimeout(load, 30_000);
    }

    load();
    return () => {
      stopped = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, [enabled]);

  return s;
}

/**
 * One poller for the whole workspace.
 *
 * Seven components call `useWorkspace` — the shell, the sidebar, the ⌘K
 * palette and four views — and each call used to mount its own copy of the
 * hook above. That meant one independent 30s poller per mounted consumer, all
 * fetching byte-identical data: a fresh dashboard load fired the manifest four
 * times, and navigating between views stacked more on top. Two of those
 * concurrent calls came back 502 from the proxy, which is the honest cost of
 * asking the same upstream the same question four times at once.
 *
 * Reads stay live — the 30s cadence and the no-store proxy are unchanged. Only
 * the duplication goes.
 */
const WorkspaceContext = createContext<Loadable<Workspace> | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspacePoll(true);
  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace(): Loadable<Workspace> {
  const shared = useContext(WorkspaceContext);
  // Called unconditionally to satisfy the rules of hooks, but inert whenever a
  // provider is above: a consumer rendered outside one still works on its own.
  const own = useWorkspacePoll(shared === null);
  return shared ?? own;
}

export const shortAddr = (a: string, head = 6, tail = 4) =>
  !a ? "—" : a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;

export const ago = (ms: number) => {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
};
