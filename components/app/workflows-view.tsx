"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Clock, GitBranch, MoreHorizontal, Pause, Play, Plus, Zap } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { WORKFLOWS, usd, type Status, type Workflow } from "@/lib/app-data";
import { EmptyState, Metric, PageHead, SearchInput, Segmented, Sheet, StatusPill } from "./bits";

type Filter = "all" | "live" | "paused" | "draft";

const STEP_ICON = { trigger: Clock, call: Zap, condition: GitBranch, action: ArrowRight } as const;

/** The step chain, rendered as the actual sequence rather than a summary. */
function Chain({ steps, running }: { steps: Workflow["steps"]; running?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const Icon = STEP_ICON[s.kind];
        const active = running === i;
        return (
          <span key={s.name} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] transition-colors",
                active
                  ? "border-accent/40 bg-orange-50 text-accent"
                  : "border-black/[0.08] bg-white text-neutral-600"
              )}
            >
              <Icon size={12} className={active ? "text-accent" : "text-neutral-400"} />
              {s.name}
            </span>
            {i < steps.length - 1 && <span aria-hidden className="text-neutral-300">→</span>}
          </span>
        );
      })}
    </div>
  );
}

export function WorkflowsView() {
  const [items, setItems] = useState<Workflow[]>(WORKFLOWS);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Workflow | null>(null);
  const [running, setRunning] = useState<{ id: string; step: number } | null>(null);
  const { toast } = useToast();

  const counts = useMemo(
    () => ({
      all: items.length,
      live: items.filter((w) => w.status === "live").length,
      paused: items.filter((w) => w.status === "paused").length,
      draft: items.filter((w) => w.status === "draft").length,
    }),
    [items]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const scoped = filter === "all" ? items : items.filter((w) => w.status === filter);
    return term ? scoped.filter((w) => [w.name, w.summary, w.trigger].join(" ").toLowerCase().includes(term)) : scoped;
  }, [items, filter, q]);

  function setStatus(id: string, status: Status, verb: string) {
    setItems((p) => p.map((w) => (w.id === id ? { ...w, status } : w)));
    setOpen((o) => (o && o.id === id ? { ...o, status } : o));
    toast(verb);
  }

  /** Walk the chain a step at a time so a run is legible, not a spinner. */
  function run(w: Workflow) {
    if (running) return;
    let step = 0;
    setRunning({ id: w.id, step });
    const tick = setInterval(() => {
      step += 1;
      if (step >= w.steps.length) {
        clearInterval(tick);
        setRunning(null);
        toast(`${w.name} completed · ${usd(w.costPerRun)} USDC`, "success");
      } else {
        setRunning({ id: w.id, step });
      }
    }, 620);
  }

  return (
    <>
      <PageHead
        title="Workflows"
        subtitle="A workflow chains triggers, paid calls and onchain actions. Ripar guarantees the run: retries with backoff, idempotency keys, and a record of every attempt."
        actions={
          <button
            type="button"
            onClick={() => toast("Draft workflow created — add a trigger to arm it")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <Plus size={14} /> New workflow
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "live", label: "Live", count: counts.live },
            { value: "paused", label: "Paused", count: counts.paused },
            { value: "draft", label: "Draft", count: counts.draft },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search workflows…" className="w-full sm:w-[280px]" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No workflows match" body={q ? `Nothing matches “${q}”.` : "Nothing in this view."} />
      ) : (
        <div className="space-y-3">
          {rows.map((w) => {
            const isRunning = running?.id === w.id;
            return (
              <Sheet key={w.id}>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" onClick={() => setOpen(w)} className="min-w-0 text-left">
                      <span className="flex items-center gap-2.5">
                        <span className="text-[14.5px] font-semibold text-neutral-900">{w.name}</span>
                        <StatusPill status={isRunning ? "live" : w.status} />
                      </span>
                      <span className="mt-1 block max-w-[70ch] text-[13px] leading-relaxed text-neutral-500">{w.summary}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => run(w)}
                        disabled={!!running}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                          running ? "cursor-not-allowed text-neutral-300" : "text-neutral-700 hover:border-black/20 hover:text-neutral-900"
                        )}
                      >
                        <Play size={12} /> {isRunning ? "Running…" : "Run now"}
                      </button>
                      <Menu
                        align="end"
                        trigger={({ toggle }) => (
                          <button type="button" onClick={toggle} aria-label={`Actions for ${w.name}`} className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-black/[0.05] hover:text-neutral-900">
                            <MoreHorizontal size={15} />
                          </button>
                        )}
                      >
                        {w.status === "live" ? (
                          <MenuItem icon={<Pause size={14} />} onClick={() => setStatus(w.id, "paused", `Paused ${w.name}`)}>Pause</MenuItem>
                        ) : (
                          <MenuItem icon={<Play size={14} />} onClick={() => setStatus(w.id, "live", `${w.name} is live`)}>Arm</MenuItem>
                        )}
                      </Menu>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Chain steps={w.steps} running={isRunning ? running.step : undefined} />
                  </div>

                  <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-black/[0.06] pt-3 text-[12.5px]">
                    {[
                      ["Trigger", w.trigger],
                      ["Runs 24h", w.runs24h.toLocaleString("en-US")],
                      ["Cost / run", `${usd(w.costPerRun)} USDC`],
                      ["Success", w.successRate ? `${(w.successRate * 100).toFixed(1)}%` : "—"],
                      ["Last run", w.lastRun],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline gap-1.5">
                        <dt className="text-neutral-400">{k}</dt>
                        <dd className="tnum text-neutral-700">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Sheet>
            );
          })}
        </div>
      )}

      <SlideOver open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} width="max-w-lg">
        {open && (
          <div className="space-y-7">
            <div>
              <StatusPill status={open.status} />
              <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-600">{open.summary}</p>
            </div>
            <div className="grid grid-cols-2 gap-5 border-t border-black/[0.07] pt-5">
              <Metric label="Trigger" value={open.trigger} />
              <Metric label="Runs (24h)" value={open.runs24h.toLocaleString("en-US")} />
              <Metric label="Cost per run" value={usd(open.costPerRun)} unit="USDC" />
              <Metric label="Success" value={open.successRate ? `${(open.successRate * 100).toFixed(1)}%` : "—"} />
            </div>
            <div className="border-t border-black/[0.07] pt-5">
              <h3 className="text-[13px] font-semibold text-neutral-900">Steps</h3>
              <ol className="mt-3 space-y-2">
                {open.steps.map((s, i) => {
                  const Icon = STEP_ICON[s.kind];
                  return (
                    <li key={s.name} className="flex items-center gap-3 rounded-lg border border-black/[0.07] px-3 py-2">
                      <span className="tnum w-4 font-mono text-[11px] text-neutral-400">{i + 1}</span>
                      <Icon size={14} className="text-neutral-400" />
                      <span className="text-[13px] text-neutral-800">{s.name}</span>
                      <span className="ml-auto text-[11.5px] capitalize text-neutral-400">{s.kind}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-[12.5px] leading-relaxed text-neutral-500">
                Each step is checkpointed. A retry resumes from the failed step rather than
                re-running the ones that already paid.
              </p>
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
