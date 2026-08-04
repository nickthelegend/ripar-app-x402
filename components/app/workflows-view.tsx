"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, MoreHorizontal, Pause, Play, Plus } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { WORKFLOWS, usd, type Status, type Step, type Workflow } from "@/lib/app-data";
import { EmptyState, PageHead, SearchInput, Segmented, Sheet, StatusPill } from "./bits";
import { STEP_KINDS, WorkflowCanvas } from "./workflow-canvas";

type Filter = "all" | "live" | "paused" | "draft";

const costOf = (steps: Step[]) => steps.reduce((sum, s) => sum + (s.price ?? 0), 0);

// The server's copy of each chain, captured before the session edits anything.
// The builder's "reset to saved" goes back to this, not to the live item.
const SAVED_STEPS = new Map(WORKFLOWS.map((w) => [w.id, w.steps]));

/** The step chain, rendered as the actual sequence rather than a summary. */
function Chain({ steps, running }: { steps: Step[]; running?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const Icon = STEP_KINDS[s.kind].Icon;
        const active = running === i;
        return (
          <span key={`${s.name}-${i}`} className="flex items-center gap-1.5">
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
  // Starts empty on purpose. A workflow is something you build; shipping four
  // invented ones would be the same fabrication we removed everywhere else.
  // WORKFLOWS remains importable as starter templates via 'New workflow'.
  const [items, setItems] = useState<Workflow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
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
    toast(verb);
  }

  /** Walk the chain a step at a time so a run is legible, not a spinner. */
  function run(w: Workflow) {
    if (running) return;
    if (w.steps.length === 0) return toast("Nothing to run — this workflow has no steps yet", "error");
    let step = 0;
    setRunning({ id: w.id, step });
    const tick = setInterval(() => {
      step += 1;
      if (step >= w.steps.length) {
        clearInterval(tick);
        setRunning(null);
        toast(`${w.name} completed · ${usd(w.costPerRun, 3)} USDC`, "success");
      } else {
        setRunning({ id: w.id, step });
      }
    }, 620);
  }

  // The canvas hands the edited chain back so the list, the run and the cost
  // figure all keep describing the same workflow.
  const saveSteps = useCallback((id: string, steps: Step[]) => {
    setItems((p) => p.map((w) => (w.id === id ? { ...w, steps, costPerRun: costOf(steps) } : w)));
  }, []);

  const open = openId ? (items.find((w) => w.id === openId) ?? null) : null;

  if (open) {
    return (
      <Builder
        workflow={open}
        running={running?.id === open.id ? running.step : undefined}
        busy={!!running}
        onBack={() => setOpenId(null)}
        onRun={() => run(open)}
        onStatus={setStatus}
        onSteps={saveSteps}
      />
    );
  }

  return (
    <>
      <PageHead
        title="Workflows"
        subtitle="A workflow chains triggers, paid calls and onchain actions. Ripar guarantees the run: retries with backoff, idempotency keys, and a record of every attempt."
        actions={
          <button
            type="button"
            onClick={() => { setItems(WORKFLOWS); toast(`Loaded ${WORKFLOWS.length} starter templates — edit one in the builder`); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <Plus size={14} /> Start from a template
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
                    <button type="button" onClick={() => setOpenId(w.id)} className="min-w-0 text-left">
                      <span className="flex items-center gap-2.5">
                        <span className="text-[14.5px] font-semibold text-neutral-900">{w.name}</span>
                        <StatusPill status={isRunning ? "live" : w.status} />
                      </span>
                      <span className="mt-1 block max-w-[70ch] text-[13px] leading-relaxed text-neutral-500">{w.summary}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(w.id)}
                        className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900"
                      >
                        Open builder
                      </button>
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
                    {w.steps.length === 0 ? (
                      <p className="text-[12.5px] text-neutral-400">No steps yet — open the builder to draw the chain.</p>
                    ) : (
                      <Chain steps={w.steps} running={isRunning ? running.step : undefined} />
                    )}
                  </div>

                  <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-black/[0.06] pt-3 text-[12.5px]">
                    {[
                      ["Trigger", w.trigger],
                      ["Runs 24h", w.runs24h.toLocaleString("en-US")],
                      ["Cost / run", `${usd(w.costPerRun, 3)} USDC`],
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
    </>
  );
}

/** The builder: the same workflow, opened as the graph it actually is. */
function Builder({
  workflow,
  running,
  busy,
  onBack,
  onRun,
  onStatus,
  onSteps,
}: {
  workflow: Workflow;
  running?: number;
  busy: boolean;
  onBack: () => void;
  onRun: () => void;
  onStatus: (id: string, status: Status, verb: string) => void;
  onSteps: (id: string, steps: Step[]) => void;
}) {
  // A metered MCP tool bills the same way a paid call does, so it counts here.
  const paid = workflow.steps.filter((s) => s.kind === "call" || (s.kind === "mcp" && !!s.price)).length;
  const onStepsChange = useCallback((steps: Step[]) => onSteps(workflow.id, steps), [onSteps, workflow.id]);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft size={13} /> All workflows
      </button>

      <PageHead
        title={workflow.name}
        subtitle={workflow.summary}
        actions={
          <>
            {workflow.status === "live" ? (
              <button
                type="button"
                onClick={() => onStatus(workflow.id, "paused", `Paused ${workflow.name}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900"
              >
                <Pause size={14} /> Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStatus(workflow.id, "live", `${workflow.name} is live`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900"
              >
                <Play size={14} /> Arm
              </button>
            )}
            <button
              type="button"
              onClick={onRun}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors",
                busy ? "cursor-not-allowed bg-neutral-300" : "bg-neutral-900 hover:bg-neutral-800"
              )}
            >
              <Play size={14} /> {running != null ? "Running…" : "Run now"}
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pb-4 text-[12.5px]">
        <StatusPill status={running != null ? "live" : workflow.status} />
        {[
          ["Trigger", workflow.trigger],
          ["Steps", `${workflow.steps.length}`],
          ["Paid calls", `${paid}`],
          ["Cost / run", `${usd(workflow.costPerRun)} USDC`],
          ["Success", workflow.successRate ? `${(workflow.successRate * 100).toFixed(1)}%` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-1.5">
            <span className="text-neutral-400">{k}</span>
            <span className="tnum text-neutral-700">{v}</span>
          </div>
        ))}
      </div>

      <WorkflowCanvas
        key={workflow.id}
        workflow={workflow}
        saved={SAVED_STEPS.get(workflow.id) ?? workflow.steps}
        runningStep={running}
        onStepsChange={onStepsChange}
      />

      <p className="mt-3 max-w-[76ch] text-[12.5px] leading-relaxed text-neutral-500">
        Each step is checkpointed. A retry resumes from the failed step rather than re-running
        the ones that already paid — so the cost per run above is the worst case, not a
        multiple of it.
      </p>
    </>
  );
}
