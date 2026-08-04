"use client";

import { useMemo, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ago, shortAddr, useWorkspace, type ChainNetwork, type RealRun } from "@/lib/real-data";
import { EmptyState, Metric, PageHead, SearchInput, Segmented, Sheet, SortHeader } from "./bits";

type Scope = "mine" | "all";
type Field = "when" | "amountUsdc" | "round";

const usd = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC, written out rather than localised, so a receipt reads the same wherever
 *  it is opened and the CSV matches the table exactly. Empty when the settlement
 *  carries no round-time — the indexer always sends one, but printing 1970 if it
 *  ever does not would be worse than saying nothing. */
function utc(at: number): string {
  if (!at) return "";
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Lora carries both networks. Which one to link is read from the chain these
 *  rows came off, not assumed — the agent settles on TestNet, and a MainNet link
 *  would land every "verify" on a transaction that does not exist. */
const txUrl = (net: ChainNetwork, id: string) => `https://lora.algokit.io/${net}/transaction/${id}`;

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** No endpoint or status column, because the chain carries neither — see the
 *  note under the table. Every field here is one the settlement really states. */
function toCsv(rows: RealRun[]): string {
  const head = ["tx_id", "settled_at_utc", "round", "payer", "paid_to", "amount_usdc"];
  const body = rows.map((r) =>
    [r.id, utc(r.when), r.round, r.from, r.to, r.amountUsdc.toFixed(6)].map(cell).join(",")
  );
  // A trailing newline keeps `wc -l` and most parsers happy.
  return [head.join(","), ...body].join("\n") + "\n";
}

/** Hands the browser a real file. Returns false when the download was blocked. */
function downloadCsv(filename: string, csv: string): boolean {
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

/**
 * A receipt here is a settlement read off Algorand: a USDC transfer that really
 * moved. Nothing is stored on our side, so the table is exactly what the chain
 * will tell anybody who looks, and each row links the transaction to prove it.
 */
export function ReceiptsView() {
  const { data, status, error } = useWorkspace();
  // "Mine" first: this page is about what the deployed agent has been paid. The
  // network-wide list is one tab away, so a quiet address is not a dead end.
  const [scope, setScope] = useState<Scope>("mine");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: Field; dir: "asc" | "desc" }>({ field: "when", dir: "desc" });
  const { toast } = useToast();

  const runs = data?.runs ?? [];
  const payTo = data?.manifest?.payTo;
  // The chain these rows were actually read from. The fallback is never on
  // screen — a row only exists once `data` is in hand, and so has a network.
  const net = data?.chain.network ?? "testnet";

  const counts = useMemo(
    () => ({ all: runs.length, mine: payTo ? runs.filter((r) => r.to === payTo).length : 0 }),
    [runs, payTo]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const scoped = scope === "mine" ? (payTo ? runs.filter((r) => r.to === payTo) : []) : runs;
    const found = term
      ? scoped.filter((r) => `${r.id} ${r.from} ${r.to}`.toLowerCase().includes(term))
      : scoped;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...found].sort((a, b) => (a[sort.field] - b[sort.field]) * dir);
  }, [runs, payTo, scope, q, sort]);

  const totals = useMemo(() => {
    const gross = rows.reduce((n, r) => n + r.amountUsdc, 0);
    return {
      gross,
      average: rows.length ? gross / rows.length : 0,
      payers: new Set(rows.map((r) => r.from)).size,
    };
  }, [rows]);

  const toggleSort = (field: Field) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));

  function exportCsv() {
    if (rows.length === 0) return;
    const name = `ripar-receipts-${scope}-${utc(Date.now()).slice(0, 10)}.csv`;
    const ok = downloadCsv(name, toCsv(rows));
    toast(
      ok ? `Exported ${rows.length} receipts to ${name}` : "The browser blocked the download",
      ok ? "success" : "error"
    );
  }

  return (
    <>
      <PageHead
        title="Receipts"
        subtitle="One row per settlement read off Algorand — a USDC transfer that really moved. Payment goes straight from the caller to your payout address, Ripar is never in the path, so these are chain records rather than an account balance."
        actions={
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors",
              rows.length === 0 ? "cursor-not-allowed bg-neutral-300" : "bg-neutral-900 hover:bg-neutral-800"
            )}
          >
            <Download size={14} /> Export {rows.length} rows as CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-black/[0.07] sm:grid-cols-4">
        {[
          { label: "Settled in view", value: usd(totals.gross), unit: "USDC", hint: `${rows.length} ${rows.length === 1 ? "row" : "rows"}` },
          { label: "Average settlement", value: usd(totals.average, 3), unit: "USDC", hint: "rows in view" },
          { label: "Distinct payers", value: String(totals.payers), hint: "addresses in view" },
          {
            label: "Paid to your address",
            value: data ? usd(data.mine.earnedUsdc) : "—",
            unit: "USDC",
            hint: data ? `${data.mine.calls} settlements, all scopes` : "reading the chain…",
          },
        ].map((m) => (
          <div key={m.label} className="bg-white px-4 py-4">
            <Metric label={m.label} value={m.value} unit={m.unit} hint={m.hint} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 py-4">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "mine", label: "Mine", count: counts.mine },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search address or tx…" className="w-full sm:w-[300px]" />
        <span className="tnum ml-auto text-[12.5px] text-neutral-400">
          {rows.length} {rows.length === 1 ? "receipt" : "receipts"}
        </span>
      </div>

      {status === "loading" ? (
        <Sheet>
          <p className="px-4 py-12 text-center text-[13px] text-neutral-400">reading the chain…</p>
        </Sheet>
      ) : status === "error" ? (
        <EmptyState
          title="Could not read the chain"
          body={`${error ?? "The indexer did not answer."} Nothing here is cached, so the table stays empty rather than showing something stale.`}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? "No receipts match" : scope === "mine" ? "Nobody has paid your agent yet" : "No settlements in this window"}
          body={
            q
              ? `Nothing matches “${q}”.`
              : scope === "mine"
                ? "Your endpoint is live and quoting, but no payment has landed. A row appears here the moment a real one does — there is no sample to look at in the meantime."
                : "No x402 settlement has been seen on the recent rounds we can read. Quiet stretches are normal on a young protocol, and no rows are invented to fill the gap."
          }
          action={
            q ? (
              <button type="button" onClick={() => setQ("")} className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium">
                Clear search
              </button>
            ) : scope === "mine" && counts.all > 0 ? (
              <button type="button" onClick={() => setScope("all")} className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium">
                See all {counts.all} network settlements
              </button>
            ) : undefined
          }
        />
      ) : (
        <Sheet>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13.5px]">
              <thead className="border-b border-black/[0.07] text-[12px]">
                <tr>
                  <SortHeader label="Settled (UTC)" field="when" sort={sort} onSort={toggleSort} />
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Payer</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Paid to</th>
                  <SortHeader label="Round" field="round" sort={sort} onSort={toggleSort} align="right" />
                  <th scope="col" className="px-3 py-2 text-right font-medium text-neutral-400">Age</th>
                  <SortHeader label="Amount" field="amountUsdc" sort={sort} onSort={toggleSort} align="right" />
                  <th scope="col" className="px-3 py-2 text-right font-medium text-neutral-400">Tx</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.id} r={r} net={net} mine={r.to === payTo} />
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}

      {/* One template literal rather than JSX text with holes in it: a chunk that
          follows an expression and wraps onto the next line loses its leading
          space, and this note read "Algorand testnetindexer" until it did not. */}
      <p className="mt-2.5 text-[12px] leading-relaxed text-neutral-400">
        {`Read from the Algorand ${net} indexer by walking the x402 facilitator’s recent transactions — these are the settlements we can see, not a complete ledger. There is no endpoint column because the payment does not carry one: it credits a payout address, and the chain never records which route was called.`}
        {rows.length > 0 &&
          ` The CSV downloads exactly the ${rows.length} rows shown, in the order shown.`}
      </p>
    </>
  );
}

function Row({ r, net, mine }: { r: RealRun; net: ChainNetwork; mine: boolean }) {
  return (
    <tr className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.02]">
      <td className="tnum px-3 py-2.5 font-mono text-[12px] text-neutral-600">{utc(r.when) || "—"}</td>
      <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500" title={r.from}>
        {shortAddr(r.from)}
      </td>
      <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500" title={r.to}>
        {shortAddr(r.to)}
        {mine && (
          <span className="ml-2 rounded bg-orange-50 px-1.5 py-px font-sans text-[10.5px] font-semibold text-accent">
            you
          </span>
        )}
      </td>
      <td className="tnum px-3 py-2.5 text-right text-neutral-600">{r.round.toLocaleString("en-US")}</td>
      <td className="px-3 py-2.5 text-right text-neutral-500">{ago(r.when)}</td>
      <td className="tnum px-3 py-2.5 text-right font-medium">{usd(r.amountUsdc, 3)}</td>
      <td className="px-3 py-2.5 text-right">
        <a
          href={txUrl(net, r.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[12px] text-neutral-500 underline underline-offset-2 transition-colors hover:text-accent"
        >
          verify <ExternalLink size={10} />
        </a>
      </td>
    </tr>
  );
}
