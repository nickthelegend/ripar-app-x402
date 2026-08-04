"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/app-data";
import { type WorkflowEdit, type WorkflowRun } from "@/lib/workflow-activity";
import { SortHeader } from "./bits";

// The builder inspector's Runs and History tabs. Both read what lib/workflow-
// activity.ts recorded on this device and neither invents a row: a workflow
// nobody has run has no runs, and says so.

/** A stamp inside today reads as a time; anything older needs its date. */
const when = (at: number) => {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fullStamp = (at: number) =>
  new Date(at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const EMPTY = "rounded-xl border border-dashed border-black/12 px-4 py-8 text-center";
const NOTE = "mt-3 border-t border-black/[0.06] pt-2.5 text-[11.5px] leading-relaxed text-neutral-400";
// px-3 throughout, because that is what SortHeader draws with — a header on a
// different inset from its own column reads as a misaligned table.
const TH = "px-3 py-2 text-left font-medium text-neutral-400";
const TD = "px-3 py-1.5";

type RunField = "at" | "cost";

export function RunsPanel({ runs }: { runs: WorkflowRun[] }) {
  const [sort, setSort] = useState<{ field: RunField; dir: "asc" | "desc" }>({ field: "at", dir: "desc" });

  const rows = useMemo(() => {
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...runs].sort((a, b) => (sort.field === "at" ? a.at - b.at : a.cost - b.cost) * sign);
  }, [runs, sort]);

  const onSort = (field: RunField) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));

  if (runs.length === 0) {
    return (
      <div className={EMPTY}>
        <p className="text-[13px] font-medium text-neutral-800">No runs yet</p>
        <p className="mx-auto mt-1.5 text-[12px] leading-relaxed text-neutral-500">
          Press Run to walk the chain. Each walk is recorded here with what its steps quote.
        </p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full text-[12.5px]">
        <caption className="sr-only">Runs of this workflow, recorded on this device</caption>
        <thead className="text-[11.5px]">
          <tr>
            <SortHeader label="When" field={"at" as RunField} sort={sort} onSort={onSort} />
            <th scope="col" className={TH}>Status</th>
            <SortHeader label="Cost" field={"cost" as RunField} sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              title={`${fullStamp(r.at)} · ${r.steps} ${r.steps === 1 ? "step" : "steps"} · ${secs(r.ms)}`}
              className="border-t border-black/[0.05]"
            >
              <td className={cn(TD, "tnum text-neutral-600")}>{when(r.at)}</td>
              <td className={TD}>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      r.outcome === "ok" ? "bg-emerald-500" : "bg-rose-500"
                    )}
                  />
                  <span className={r.outcome === "ok" ? "text-emerald-700" : "text-rose-700"}>
                    {r.outcome === "ok" ? "Completed" : "Failed"}
                  </span>
                </span>
              </td>
              <td className={cn(TD, "tnum text-right text-neutral-700")}>{usd(r.cost, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={NOTE}>
        A run here walks the chain in this browser and is recorded on this device. The cost is what
        those steps quote, not what anything paid: no USDC has moved, and nothing schedules this
        chain to run on its own.
      </p>
    </>
  );
}

export function HistoryPanel({ edits }: { edits: WorkflowEdit[] }) {
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  // Held newest-first, so ascending is the reversal.
  const rows = useMemo(() => (dir === "desc" ? edits : [...edits].reverse()), [edits, dir]);

  if (edits.length === 0) {
    return (
      <div className={EMPTY}>
        <p className="text-[13px] font-medium text-neutral-800">Nothing edited yet</p>
        <p className="mx-auto mt-1.5 text-[12px] leading-relaxed text-neutral-500">
          Adding, renaming, wiring or deleting a step is logged here, on this device.
        </p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full text-[12.5px]">
        <caption className="sr-only">Edits made to this workflow on this device</caption>
        <thead className="text-[11.5px]">
          <tr>
            <SortHeader
              label="Time"
              field={"at" as const}
              sort={{ field: "at" as const, dir }}
              onSort={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
            />
            <th scope="col" className={TH}>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-black/[0.05] align-top">
              <td className={cn(TD, "tnum whitespace-nowrap text-neutral-400")} title={fullStamp(e.at)}>
                {when(e.at)}
              </td>
              <td className={cn(TD, "leading-relaxed text-neutral-700")}>{e.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={NOTE}>
        The last {edits.length === 1 ? "edit" : `${edits.length} edits`} — kept with the draft in
        this browser, not on a server.
      </p>
    </>
  );
}
