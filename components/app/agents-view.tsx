"use client";

import { useMemo, useState } from "react";
import { Bot, ExternalLink } from "lucide-react";
import { SlideOver } from "@/components/ui/slide-over";
import { ago, shortAddr, useWorkspace, type RealAgent } from "@/lib/real-data";
import { accountUrl, networkLabel } from "@/lib/explorer";
import { EmptyState, Metric, PageHead, SearchInput, Segmented, Sheet, SortHeader } from "./bits";

type Scope = "all" | "mine";
type Field = "address" | "calls" | "earnedUsdc" | "payers" | "medianUsdc";

const usd = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * There is no agent registry to read, so an agent here is defined by behaviour:
 * an address that has actually received x402 settlements. That is exactly what
 * the chain knows, and it is worth more than a directory of self-declared
 * listings — every row is backed by somebody having really paid.
 */
export function AgentsView() {
  const { data, status, error } = useWorkspace();
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: Field; dir: "asc" | "desc" }>({
    field: "earnedUsdc",
    dir: "desc",
  });
  const [open, setOpen] = useState<RealAgent | null>(null);

  const agents = data?.agents ?? [];
  // Named from the chain these rows were actually read off, never assumed —
  // the app follows whichever network the agent's manifest declares.
  const net = networkLabel(data?.chain.network ?? "testnet");
  const counts = useMemo(
    () => ({ all: agents.length, mine: agents.filter((a) => a.mine).length }),
    [agents]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const scoped = scope === "mine" ? agents.filter((a) => a.mine) : agents;
    const found = term ? scoped.filter((a) => a.address.toLowerCase().includes(term)) : scoped;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...found].sort((a, b) =>
      sort.field === "address"
        ? a.address.localeCompare(b.address) * dir
        : ((a[sort.field] as number) - (b[sort.field] as number)) * dir
    );
  }, [agents, scope, q, sort]);

  const toggleSort = (field: Field) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));

  return (
    <>
      <PageHead
        title="Agents"
        subtitle={`Every address here has actually been paid over x402 on Algorand ${net}. There is no registry to read, so an agent is defined by what it has earned rather than by what it claims.`}
      />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "mine", label: "Mine", count: counts.mine },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search by address…" className="w-full sm:w-[300px]" />
        <span className="tnum ml-auto text-[12.5px] text-neutral-400">
          {rows.length} of {counts.all}
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
          title={q ? "No agents match" : scope === "mine" ? "Nobody has paid your agent yet" : "No settlements in this window"}
          body={
            q
              ? `Nothing matches “${q}”.`
              : scope === "mine"
                ? "Your endpoint is live and quoting. This fills in the moment a real payment lands — it will not show anything before then."
                : "This is a young protocol and quiet stretches are normal. No rows are invented to fill the gap."
          }
        />
      ) : (
        <Sheet>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13.5px]">
              <thead className="border-b border-black/[0.07] text-[12px]">
                <tr>
                  <SortHeader label="Agent address" field="address" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Paid calls" field="calls" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Distinct payers" field="payers" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Median call" field="medianUsdc" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Earned" field="earnedUsdc" sort={sort} onSort={toggleSort} align="right" />
                  <th scope="col" className="px-3 py-2 text-right font-medium text-neutral-400">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.address}
                    onClick={() => setOpen(a)}
                    className="group cursor-pointer border-b border-black/[0.05] transition-colors last:border-0 hover:bg-black/[0.02]"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-neutral-500">
                          <Bot size={14} />
                        </span>
                        <span className="font-mono text-[12.5px] text-neutral-800">{shortAddr(a.address, 10, 6)}</span>
                        {a.mine && (
                          <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">
                            Mine
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{a.calls}</td>
                    <td className="tnum px-3 py-2.5 text-right text-neutral-600">{a.payers}</td>
                    <td className="tnum px-3 py-2.5 text-right text-neutral-600">{usd(a.medianUsdc, 3)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-medium">{usd(a.earnedUsdc)}</td>
                    <td className="px-3 py-2.5 text-right text-neutral-500">{ago(a.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}

      <p className="mt-2.5 text-[12px] text-neutral-400">
        {`Derived from x402 settlements on Algorand ${net}. An agent with one payer and many calls is`}{" "}
        usually one operator testing; many distinct payers is the signal worth watching.
      </p>

      <SlideOver open={!!open} onClose={() => setOpen(null)} title="Agent" width="max-w-lg">
        {open && (
          <div className="space-y-7">
            <div>
              <p className="break-all font-mono text-[12.5px] text-neutral-700">{open.address}</p>
              <a
                href={accountUrl(open.address, data?.chain.network ?? "testnet")}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-neutral-500 underline underline-offset-2 hover:text-accent"
              >
                View on the block explorer <ExternalLink size={11} />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-5 border-t border-black/[0.07] pt-5">
              <Metric label="Paid calls" value={String(open.calls)} hint="settlements received" />
              <Metric label="Distinct payers" value={String(open.payers)} />
              <Metric label="Earned" value={usd(open.earnedUsdc)} unit="USDC" />
              <Metric label="Median call" value={usd(open.medianUsdc, 3)} unit="USDC" hint="a proxy for list price" />
            </div>

            <div className="border-t border-black/[0.07] pt-5">
              <h3 className="text-[13px] font-semibold text-neutral-900">What this is, exactly</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
                An address observed receiving x402 payments in the recent window. We do not know its
                name, its endpoints or its owner — the chain does not carry that. What we do know is
                that {open.payers} distinct {open.payers === 1 ? "party has" : "parties have"} paid it{" "}
                {open.calls} {open.calls === 1 ? "time" : "times"}, which is harder to fake than a listing.
              </p>
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
