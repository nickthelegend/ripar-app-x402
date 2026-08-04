"use client";

import { useEffect, useState } from "react";
import { AGENT_ORIGIN, MANIFEST_ROUTE } from "./agent-origin";

/**
 * The workspace's real data layer.
 *
 * Every row here comes from something that exists: the live agent's own
 * manifest, and settlements read off Algorand MainNet. Nothing is invented.
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

async function j<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
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

  const blocks = await Promise.all(
    rounds.map((r) =>
      j<{ transactions?: Record<string, any>[] }>(`${INDEXER}/v2/blocks/${r}`, signal).catch(
        () => null
      )
    )
  );

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

export function useWorkspace(): Loadable<Workspace> {
  const [s, setS] = useState<Loadable<Workspace>>({
    data: null,
    status: "loading",
    error: null,
  });

  useEffect(() => {
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
        let blockTime: number | null = null;
        try {
          const [a, b] = await Promise.all([
            j<{ block: { ts: number } }>(`${ALGOD}/v2/blocks/${head - 5}?format=json`, ac.signal),
            j<{ block: { ts: number } }>(`${ALGOD}/v2/blocks/${head - 1}?format=json`, ac.signal),
          ]);
          blockTime = (b.block.ts - a.block.ts) / 4;
        } catch {
          /* the round alone is still worth showing */
        }

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
  }, []);

  return s;
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
