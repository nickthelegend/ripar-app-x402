// Settled calls. Generated from a fixed seed and a fixed anchor rather than the
// clock, so the server and the browser produce byte-identical rows and the table
// hydrates without a flicker.

import { ENDPOINTS, SAMPLE_CALLERS, type Endpoint } from "./app-data";

export type ReceiptState = "settled" | "refunded" | "pending";

export type Receipt = {
  id: string;
  at: number;
  slug: string;
  endpoint: string;
  caller: string;
  amount: number; // USDC moved from caller to payout
  fee: number; // ALGO paid to the network for the settlement
  state: ReceiptState;
  tx: string | null;
};

export const RECEIPT_STATE: Record<ReceiptState, { dot: string; text: string; label: string }> = {
  settled: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Settled" },
  pending: { dot: "bg-amber-500", text: "text-amber-700", label: "Pending" },
  refunded: { dot: "bg-neutral-400", text: "text-neutral-500", label: "Refunded" },
};

/** The newest receipt in the sample set; every period filter counts back from it. */
export const ANCHOR = Date.UTC(2026, 7, 4, 9, 14, 0);

const ALGO_FEE = 0.001;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(): Receipt[] {
  const rand = mulberry32(0x1a2b3c4d);
  // Only an endpoint currently taking calls can be producing receipts, and the
  // busier ones should appear more often. The weight is capped, or the busiest
  // endpoint would be the only one visible in a sample this size.
  const earning = ENDPOINTS.filter((e) => e.calls24h > 0);
  const pool: Endpoint[] = earning.flatMap((e) =>
    Array.from({ length: Math.min(6, Math.max(1, Math.round(e.calls24h / 900))) }, () => e)
  );

  const out: Receipt[] = [];
  let at = ANCHOR - 30 * 24 * 3600 * 1000;
  const step = (30 * 24 * 3600 * 1000) / 120;

  for (let i = 0; i < 120; i++) {
    at += step * (0.35 + rand() * 1.3);
    if (at > ANCHOR) break;

    const e = pool[Math.floor(rand() * pool.length)];
    const roll = rand();
    // A handler that fails is refunded, never charged; the newest few are still
    // waiting on confirmation.
    const state: ReceiptState =
      ANCHOR - at < 90_000 ? "pending" : roll < (e.status === "error" ? 0.28 : 0.02) ? "refunded" : "settled";

    const hex = Array.from({ length: 8 }, () => "0123456789ABCDEF"[Math.floor(rand() * 16)]).join("");
    out.push({
      id: `rcpt_${(0x10000 + i * 977).toString(16)}`,
      at: Math.round(at),
      slug: e.slug,
      endpoint: e.name,
      caller: SAMPLE_CALLERS[Math.floor(rand() * SAMPLE_CALLERS.length)],
      amount: state === "refunded" ? 0 : e.price,
      fee: state === "refunded" ? 0 : ALGO_FEE,
      state,
      tx: state === "refunded" ? null : hex,
    });
  }
  return out.reverse();
}

export const RECEIPTS: Receipt[] = build();

export const PERIODS = [
  { value: "24h" as const, label: "24h", ms: 24 * 3600 * 1000 },
  { value: "7d" as const, label: "7 days", ms: 7 * 24 * 3600 * 1000 },
  { value: "30d" as const, label: "30 days", ms: 30 * 24 * 3600 * 1000 },
];

export type Period = (typeof PERIODS)[number]["value"];

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC, written out rather than localised, so a receipt reads the same wherever
 *  it is opened and the CSV matches the table exactly. */
export function utc(at: number): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Receipt[]): string {
  const head = ["receipt_id", "settled_at_utc", "endpoint", "route", "caller", "amount_usdc", "network_fee_algo", "status", "tx_id"];
  const body = rows.map((r) =>
    [r.id, utc(r.at), r.endpoint, `/${r.slug}`, r.caller, r.amount.toFixed(6), r.fee.toFixed(6), r.state, r.tx ?? ""]
      .map(cell)
      .join(",")
  );
  // A trailing newline keeps `wc -l` and most parsers happy.
  return [head.join(","), ...body].join("\n") + "\n";
}

/** Hands the browser a real file. Returns false when the download was blocked. */
export function downloadCsv(filename: string, csv: string): boolean {
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
