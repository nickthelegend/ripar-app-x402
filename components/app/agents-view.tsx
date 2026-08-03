"use client";

import { useMemo, useState } from "react";
import { Bot, Gavel, MoreHorizontal, Pause, Play, Plus, Send } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { AGENTS, usd, type Agent, type AgentStatus } from "@/lib/app-data";
import { EmptyState, Metric, PageHead, SearchInput, Segmented, Sheet, SortHeader, StatusPill } from "./bits";

type Scope = "all" | "mine" | "hired";
type Field = "name" | "jobsWon" | "successRate" | "earned" | "avgBid";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: Field; dir: "asc" | "desc" }>({ field: "earned", dir: "desc" });
  const [open, setOpen] = useState<Agent | null>(null);
  const [posting, setPosting] = useState(false);
  const { toast } = useToast();

  const counts = useMemo(
    () => ({
      all: agents.length,
      mine: agents.filter((a) => a.mine).length,
      hired: agents.filter((a) => !a.mine && a.jobsWon > 0).length,
    }),
    [agents]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const scoped = agents.filter((a) =>
      scope === "mine" ? a.mine : scope === "hired" ? !a.mine && a.jobsWon > 0 : true
    );
    const found = term
      ? scoped.filter((a) =>
          [a.name, a.handle, a.summary, ...a.skills].join(" ").toLowerCase().includes(term)
        )
      : scoped;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...found].sort((a, b) =>
      sort.field === "name"
        ? a.name.localeCompare(b.name) * dir
        : ((a[sort.field] as number) - (b[sort.field] as number)) * dir
    );
  }, [agents, scope, q, sort]);

  function toggleSort(field: Field) {
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));
  }

  function setStatus(id: string, status: AgentStatus, verb: string) {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    setOpen((o) => (o && o.id === id ? { ...o, status } : o));
    toast(`${verb} ${agents.find((a) => a.id === id)?.name ?? "agent"}`);
  }

  return (
    <>
      <PageHead
        title="Agents"
        subtitle="Agents bid for posted work and are paid per x402 when their result verifies. Yours appear alongside the open market."
        actions={
          <>
            <button
              type="button"
              onClick={() => setPosting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900"
            >
              <Gavel size={14} /> Post a job
            </button>
            <button
              type="button"
              onClick={() => toast("Agent scaffold created — wire a handler to publish it")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
            >
              <Plus size={14} /> New agent
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "mine", label: "Mine", count: counts.mine },
            { value: "hired", label: "Hired", count: counts.hired },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search name, handle or skill…" className="w-full sm:w-[280px]" />
        <span className="tnum ml-auto text-[12.5px] text-neutral-400">
          {rows.length} of {counts.all}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No agents match"
          body={q ? `Nothing matches “${q}”. Try a skill like “extraction” or clear the search.` : "No agents in this view yet."}
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
            <table className="w-full min-w-[880px] text-[13.5px]">
              <thead className="border-b border-black/[0.07] text-[12px]">
                <tr>
                  <SortHeader label="Agent" field="name" sort={sort} onSort={toggleSort} />
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Status</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Skills</th>
                  <SortHeader label="Jobs won" field="jobsWon" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Success" field="successRate" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Avg bid" field="avgBid" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Earned" field="earned" sort={sort} onSort={toggleSort} align="right" />
                  <th scope="col" className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setOpen(a)}
                    className="group cursor-pointer border-b border-black/[0.05] transition-colors last:border-0 hover:bg-black/[0.02]"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-neutral-500">
                          <Bot size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-900">{a.name}</span>
                          <span className="block truncate font-mono text-[11.5px] text-neutral-400">@{a.handle}</span>
                        </span>
                        {a.mine && (
                          <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">
                            Mine
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><StatusPill status={a.status} /></td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {a.skills.slice(0, 2).map((s) => (
                          <span key={s} className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[11.5px] text-neutral-600">
                            {s}
                          </span>
                        ))}
                        {a.skills.length > 2 && (
                          <span className="px-1 py-0.5 text-[11.5px] text-neutral-400">+{a.skills.length - 2}</span>
                        )}
                      </span>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{a.jobsWon.toLocaleString("en-US")}</td>
                    <td className="tnum px-3 py-2.5 text-right">
                      <span className={a.successRate >= 0.97 ? "text-neutral-900" : "text-amber-700"}>{pct(a.successRate)}</span>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-neutral-600">{usd(a.avgBid)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-medium">{usd(a.earned)}</td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Menu
                        align="end"
                        trigger={({ toggle }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            aria-label={`Actions for ${a.name}`}
                            className="rounded-md p-1 text-neutral-400 opacity-0 transition-all hover:bg-black/[0.05] hover:text-neutral-900 focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        )}
                      >
                        <MenuItem icon={<Send size={14} />} onClick={() => setOpen(a)}>Open</MenuItem>
                        {a.status === "offline" ? (
                          <MenuItem icon={<Play size={14} />} onClick={() => setStatus(a.id, "idle", "Brought online")}>
                            Bring online
                          </MenuItem>
                        ) : (
                          <MenuItem icon={<Pause size={14} />} onClick={() => setStatus(a.id, "offline", "Took offline")}>
                            Take offline
                          </MenuItem>
                        )}
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}

      <SlideOver open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""}>
        {open && (
          <div className="space-y-7">
            <div>
              <div className="flex items-center gap-2.5">
                <StatusPill status={open.status} />
                <span className="font-mono text-[12px] text-neutral-400">@{open.handle}</span>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-600">{open.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {open.skills.map((s) => (
                  <span key={s} className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[12px] text-neutral-600">{s}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5 border-t border-black/[0.07] pt-5">
              <Metric label="Jobs won" value={open.jobsWon.toLocaleString("en-US")} hint={`of ${open.jobsBid.toLocaleString("en-US")} bids`} />
              <Metric label="Success rate" value={pct(open.successRate)} hint="verified results" />
              <Metric label="Earned" value={usd(open.earned)} unit="USDC" />
              <Metric label="Median response" value={`${open.responseMs}`} unit="ms" />
            </div>

            <div className="border-t border-black/[0.07] pt-5">
              <h3 className="text-[13px] font-semibold text-neutral-900">Bidding</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
                Average bid {usd(open.avgBid)} USDC. Escrow releases only once the result passes the
                job&rsquo;s verification, so an unverified run pays nothing.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setPosting(true); setOpen(null); }}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  Post a job to {open.name}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(open.id, open.status === "offline" ? "idle" : "offline", open.status === "offline" ? "Brought online" : "Took offline")}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20"
                >
                  {open.status === "offline" ? "Bring online" : "Take offline"}
                </button>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      <PostJob open={posting} onClose={() => setPosting(false)} />
    </>
  );
}

function PostJob({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("2.50");
  const [closes, setCloses] = useState("15m");
  const [err, setErr] = useState<string | null>(null);
  const { toast } = useToast();

  function submit() {
    if (!title.trim()) return setErr("Give the job a title so agents know what they are bidding on.");
    const b = Number(budget);
    if (!Number.isFinite(b) || b < 0.1) return setErr("Budget must be at least 0.10 USDC.");
    setErr(null);
    toast(`Job posted — ${usd(b)} USDC held in escrow`, "success");
    setTitle("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Post a job" description="Competing agents bid. Escrow releases only against a verified result.">
      <div className="space-y-4">
        <label className="block">
          <span className="text-[12.5px] font-medium text-neutral-700">What needs doing</span>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setErr(null); }}
            placeholder="Enrich 5,000 wallet addresses"
            className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-[13.5px] outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[12.5px] font-medium text-neutral-700">Budget (USDC)</span>
            <input
              value={budget}
              onChange={(e) => { setBudget(e.target.value); setErr(null); }}
              inputMode="decimal"
              className="tnum mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-[13.5px] outline-none focus:border-neutral-400"
            />
          </label>
          <label className="block">
            <span className="text-[12.5px] font-medium text-neutral-700">Bidding closes</span>
            <select
              value={closes}
              onChange={(e) => setCloses(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-neutral-400"
            >
              {["5m", "15m", "1h", "24h"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        </div>
        {err && <p className="text-[12.5px] text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:text-neutral-900">
            Cancel
          </button>
          <button type="button" onClick={submit} className={cn("rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800")}>
            Post job
          </button>
        </div>
      </div>
    </Modal>
  );
}
