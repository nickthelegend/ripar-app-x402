"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/app-data";
import { shortAddress } from "@/lib/algorand-address";
import {
  ANCHOR, PERIODS, RECEIPTS, RECEIPT_STATE, downloadCsv, toCsv, utc,
  type Period, type Receipt,
} from "@/lib/receipts";
import { EmptyState, Metric, PageHead, SearchInput, Segmented, Sheet, SortHeader } from "./bits";

type Field = "at" | "endpoint" | "amount" | "state";

export function ReceiptsView() {
  const [period, setPeriod] = useState<Period>("30d");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: Field; dir: "asc" | "desc" }>({ field: "at", dir: "desc" });
  const { toast } = useToast();

  const counts = useMemo(() => {
    const map = {} as Record<Period, number>;
    for (const p of PERIODS) map[p.value] = RECEIPTS.filter((r) => ANCHOR - r.at <= p.ms).length;
    return map;
  }, []);

  const rows = useMemo(() => {
    const window = PERIODS.find((p) => p.value === period)!.ms;
    const term = q.trim().toLowerCase();
    const found = RECEIPTS.filter(
      (r) =>
        ANCHOR - r.at <= window &&
        (!term || `${r.id} ${r.endpoint} ${r.slug} ${r.caller} ${r.state} ${r.tx ?? ""}`.toLowerCase().includes(term))
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...found].sort((a, b) => {
      if (sort.field === "endpoint") return a.endpoint.localeCompare(b.endpoint) * dir;
      if (sort.field === "state") return a.state.localeCompare(b.state) * dir;
      return ((a[sort.field] as number) - (b[sort.field] as number)) * dir;
    });
  }, [period, q, sort]);

  const totals = useMemo(() => {
    const settled = rows.filter((r) => r.state === "settled");
    const gross = settled.reduce((n, r) => n + r.amount, 0);
    return {
      gross,
      settled: settled.length,
      refunded: rows.filter((r) => r.state === "refunded").length,
      fees: rows.reduce((n, r) => n + r.fee, 0),
      average: settled.length ? gross / settled.length : 0,
    };
  }, [rows]);

  const toggleSort = (field: Field) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: field === "endpoint" ? "asc" : "desc" }));

  function exportCsv() {
    if (rows.length === 0) return;
    const name = `ripar-receipts-${period}-${utc(ANCHOR).slice(0, 10)}.csv`;
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
        subtitle="One row per paid call. Settlement goes straight from the caller to your payout address — Ripar is never in the path, so these are records, not an account balance. The preview carries a sample of 120 receipts rather than the full ledger, so the figures below describe the rows in view."
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
          { label: "Settled in view", value: usd(totals.gross), unit: "USDC", hint: `${totals.settled} of ${rows.length} rows` },
          { label: "Average call", value: usd(totals.average, 3), unit: "USDC", hint: "settled rows only" },
          { label: "Network fees", value: usd(totals.fees, 3), unit: "ALGO", hint: "paid by the caller" },
          { label: "Refunded", value: String(totals.refunded), hint: "failed calls, never charged" },
        ].map((m) => (
          <div key={m.label} className="bg-white px-4 py-4">
            <Metric label={m.label} value={m.value} unit={m.unit} hint={m.hint} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 py-4">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label, count: counts[p.value] }))}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search receipt, route, caller or tx…" className="w-full sm:w-[300px]" />
        <span className="tnum ml-auto text-[12.5px] text-neutral-400">{rows.length} receipts</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "No receipts match" : "Nothing settled in this window"}
          body={
            q
              ? `Nothing in the last ${period} matches “${q}”.`
              : "Widen the period, or send a call through an endpoint from its test console."
          }
          action={
            q ? (
              <button type="button" onClick={() => setQ("")} className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium">
                Clear search
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
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Receipt</th>
                  <SortHeader label="Settled (UTC)" field="at" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Endpoint" field="endpoint" sort={sort} onSort={toggleSort} />
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Caller</th>
                  <SortHeader label="Status" field="state" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Amount" field="amount" sort={sort} onSort={toggleSort} align="right" />
                  <th scope="col" className="px-3 py-2 text-right font-medium text-neutral-400">Tx</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}

      <p className="mt-2.5 text-[12px] leading-relaxed text-neutral-400">
        Sample receipts, generated for this preview from the endpoints above — no call in this table
        happened, and this is not the whole ledger. The CSV export is real: it downloads exactly the{" "}
        {rows.length} rows shown, in the order shown.
      </p>
    </>
  );
}

function Row({ r }: { r: Receipt }) {
  const tone = RECEIPT_STATE[r.state];
  return (
    <tr className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.02]">
      <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500">{r.id}</td>
      <td className="tnum px-3 py-2.5 font-mono text-[12px] text-neutral-600">{utc(r.at)}</td>
      <td className="px-3 py-2.5">
        <span className="block font-medium text-neutral-900">{r.endpoint}</span>
        <span className="block font-mono text-[11.5px] text-neutral-400">/{r.slug}</span>
      </td>
      <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500" title={r.caller}>
        {shortAddress(r.caller, 6, 4)}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium", tone.text)}>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
          {tone.label}
        </span>
      </td>
      <td className="tnum px-3 py-2.5 text-right font-medium">
        {r.state === "refunded" ? <span className="text-neutral-400">—</span> : usd(r.amount, 3)}
      </td>
      <td className="px-3 py-2.5 text-right">
        {r.tx ? (
          <a
            href={`https://allo.info/tx/${r.tx}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] text-neutral-500 underline underline-offset-2 transition-colors hover:text-accent"
          >
            {r.tx.slice(0, 6)}…
          </a>
        ) : (
          <span className="text-[12px] text-neutral-300">not charged</span>
        )}
      </td>
    </tr>
  );
}
