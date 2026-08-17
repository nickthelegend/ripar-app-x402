import { getBlock } from "./block-cache";
"use client";

import { useEffect, useState } from "react";

/**
 * Real Algorand MainNet figures for the workspace.
 *
 * The rest of app-data.ts is sample data for surfaces that need a backend we do
 * not have yet. These numbers are not: they come from the chain, so the header
 * of the Overview is true even while the tables below it are illustrative.
 * AlgoNode serves `access-control-allow-origin: *`, so the browser reads
 * MainNet directly — no proxy, no key.
 */
const ALGOD = "https://mainnet-api.algonode.cloud";
const INDEXER = "https://mainnet-idx.algonode.cloud";
const FEE_PAYER = "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA";
const USDC = 31_566_704;

export type LiveChain = {
  round: number | null;
  blockTime: number | null;
  /** x402 settlements the facilitator sponsored in the recent window. */
  settlements: number | null;
  volumeUsdc: number | null;
  status: "loading" | "live" | "error";
};

const decode = (b64?: string) => {
  if (!b64) return null;
  try {
    return atob(b64);
  } catch {
    return null;
  }
};

export function useLiveChain(): LiveChain {
  const [s, setS] = useState<LiveChain>({
    round: null, blockTime: null, settlements: null, volumeUsdc: null, status: "loading",
  });

  useEffect(() => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const j = async (u: string) => {
      const r = await fetch(u, { signal: ac.signal, cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    };

    async function load() {
      try {
        const status = await j(`${ALGOD}/v2/status`);
        const head = status["last-round"] as number;

        const [a, b, legs] = await Promise.all([
          j(`${ALGOD}/v2/blocks/${head - 5}?format=json`),
          j(`${ALGOD}/v2/blocks/${head - 1}?format=json`),
          j(`${INDEXER}/v2/accounts/${FEE_PAYER}/transactions?limit=60`),
        ]);

        const groups = new Set<string>();
        const rounds = new Set<number>();
        for (const t of legs.transactions ?? []) {
          if (t.group && decode(t.note)?.startsWith("x402-fee-payer-")) {
            groups.add(t.group);
            rounds.add(t["confirmed-round"]);
          }
        }

        // Volume needs the axfer leg, which lives in the block, so only sample a
        // few rounds — the header should not fire twenty requests to draw a number.
        let volume = 0;
        const sample = [...rounds].slice(0, 6);
        // Same shared cache the workspace uses, so these rounds are almost
        // always already in memory and cost no request at all.
        const blocks: any[] = [];
        for (const r of sample) blocks.push(await getBlock(INDEXER, r));
        for (const blk of blocks) {
          for (const t of blk?.transactions ?? []) {
            const note = decode(t.note);
            if (
              t["tx-type"] === "axfer" &&
              t["asset-transfer-transaction"]?.["asset-id"] === USDC &&
              note?.startsWith("x402-payment-v2-")
            ) {
              volume += (t["asset-transfer-transaction"].amount ?? 0) / 1e6;
            }
          }
        }

        if (stopped) return;
        setS({
          round: head,
          blockTime: (b.block.ts - a.block.ts) / 4,
          settlements: groups.size,
          volumeUsdc: volume,
          status: "live",
        });
      } catch (e) {
        if ((e as Error).name === "AbortError" || stopped) return;
        setS((p) => ({ ...p, status: "error" }));
      }
      if (!stopped) timer = setTimeout(load, 20_000);
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
