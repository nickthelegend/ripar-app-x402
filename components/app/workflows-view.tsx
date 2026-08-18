"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Play, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { WORKFLOWS, costOfSteps, usd, type Step, type Workflow } from "@/lib/app-data";
import { ago, useWorkspace } from "@/lib/real-data";
import { runWorkflow, type RunResult } from "@/lib/workflow-run";
import { clearActivity, recordRun, useActivity } from "@/lib/workflow-activity";
import { clearGraph } from "@/lib/workflow-graph";
import { EmptyState, PageHead, SearchInput, Sheet } from "./bits";
import { STEP_KINDS, WorkflowCanvas } from "./workflow-canvas";

/** Steps that quote USDC. A metered MCP tool bills the way a paid call does. */
const paidSteps = (steps: Step[]) =>
  steps.filter((s) => s.kind === "call" || (s.kind === "mcp" && !!s.price)).length;

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

/**
 * What a workflow is, rather than what it has supposedly done. Every figure here
 * is read off the chain of steps in front of you — except the run count, which
 * comes from lib/workflow-activity and counts only the walks this browser has
 * actually recorded. A template that has never been run says "never" — these
 * ship as starting points, and a run appears only once its calls have gone out
 * and come back.
 */
function Facts({ w }: { w: Workflow }) {
  const { runs } = useActivity(w.id);
  const last = runs[0];

  return (
    <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-black/[0.06] pt-3 text-[12.5px]">
      {[
        ["Trigger", w.trigger],
        ["Steps", String(w.steps.length)],
        ["Paid steps", String(paidSteps(w.steps))],
        ["Cost / run", `${usd(costOfSteps(w.steps), 3)} USDC`],
        ["Run from this browser", last ? `${runs.length}× · last ${ago(last.at)}` : "never"],
      ].map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt className="text-neutral-400">{k}</dt>
          <dd className="tnum text-neutral-700">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WorkflowsView() {
  // Starts empty on purpose. A workflow is something you build; shipping four
  // invented ones would be the same fabrication we removed everywhere else.
  // WORKFLOWS remains importable as starter templates via 'New workflow'.
  const [items, setItems] = useState<Workflow[]>([]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [running, setRunning] = useState<{ id: string; step: number } | null>(null);
  const workspace = useWorkspace();
  const { toast } = useToast();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term
      ? items.filter((w) => [w.name, w.summary, w.trigger].join(" ").toLowerCase().includes(term))
      : items;
  }, [items, q]);

  /**
   * Walk the chain, issuing the requests it describes.
   *
   * Every `call` step hits a real endpoint from the deployed agent's manifest
   * with no payment attached, so the endpoint answers 402 with a priced
   * challenge, and the figure reported below is decoded from that challenge.
   * The steps that cannot execute say so instead of being animated past.
   */
  async function run(w: Workflow) {
    if (running) return;
    if (w.steps.length === 0) return toast("Nothing to run — this workflow has no steps yet", "error");

    const endpoints = workspace.data?.endpoints ?? [];
    if (!endpoints.some((e) => e.live) && w.steps.some((st) => st.kind === "call")) {
      return toast("No live endpoint in the manifest to call — nothing would be requested", "error");
    }

    setRunning({ id: w.id, step: 0 });
    let result: RunResult;
    try {
      result = await runWorkflow(w, endpoints, {
        onStep: (i) => setRunning({ id: w.id, step: i }),
      });
    } finally {
      setRunning(null);
    }

    recordRun(w.id, {
      // The outcome is the servers' answer, not the fact that the loop finished.
      outcome: result.ok ? "ok" : "failed",
      steps: result.executed,
      cost: result.quotedUsdc,
      ms: result.ms,
    });

    const skipped = w.steps.length - result.executed;
    const tail = skipped > 0 ? ` · ${skipped} step${skipped === 1 ? "" : "s"} had nothing to call` : "";
    if (result.ok) {
      toast(
        `${w.name} ran · ${result.executed} paid call${result.executed === 1 ? "" : "s"} quoted ` +
          `${usd(result.quotedUsdc, 3)} USDC in ${result.ms}ms${tail}`,
        "success",
      );
    } else {
      // Name the first thing that actually went wrong, rather than "failed".
      const bad = result.results.find((r) => !r.ok);
      toast(bad ? `${w.name}: ${bad.detail}` : `${w.name} ran but nothing was executable${tail}`, "error");
    }
  }

  // The canvas hands the edited chain back so the list, the run and the cost
  // figure all keep describing the same workflow.
  const saveSteps = useCallback((id: string, steps: Step[]) => {
    setItems((p) => p.map((w) => (w.id === id ? { ...w, steps } : w)));
  }, []);

  /** The builder's Properties tab edits the workflow itself, not its chain. */
  const rename = useCallback((id: string, patch: { name?: string; summary?: string }) => {
    setItems((p) => p.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  function remove(w: Workflow) {
    // The draft graph and the activity are keyed by id — leaving them behind
    // would hand a later workflow with the same id somebody else's history.
    clearGraph(w.id);
    clearActivity(w.id);
    setItems((p) => p.filter((x) => x.id !== w.id));
    setOpenId(null);
    toast(`Deleted ${w.name}`);
  }

  const open = openId ? (items.find((w) => w.id === openId) ?? null) : null;

  if (open) {
    return (
      <Builder
        workflow={open}
        workflows={items}
        running={running?.id === open.id ? running.step : undefined}
        busy={!!running}
        onBack={() => setOpenId(null)}
        onOpen={setOpenId}
        onRun={() => run(open)}
        onSteps={saveSteps}
        onRename={rename}
        onDelete={() => remove(open)}
      />
    );
  }

  return (
    <>
      <PageHead
        title="Workflows"
        subtitle="A workflow chains triggers, paid calls and onchain actions. Press Run and every paid call in the chain is issued for real, against the deployed agent's published manifest — the price each step reports is decoded from the 402 that endpoint just returned, not from the template. Nothing is scheduled: there is no trigger service behind it yet, so no workflow fires on its own. And no USDC moves — the calls carry no payment, which is exactly why the answer is 402."
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

      {/* No status filter. A workflow here is never armed, paused or live —
          nothing schedules it — so filtering by a status would be sorting
          workflows into states that do not exist. */}
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search workflows…" className="w-full sm:w-[280px]" />
        {items.length > 0 && (
          <span className="tnum ml-auto text-[12.5px] text-neutral-400">
            {rows.length} of {items.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "No workflows match" : "No workflows yet"}
          body={
            q
              ? `Nothing matches “${q}”.`
              : "Start from a template to open one in the builder. Templates are chains worth building, not workflows that have run."
          }
        />
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
                        {isRunning && (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            Walking the chain
                          </span>
                        )}
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
                      {/* No Arm. It used to flip this card to "Live", which read as
                          "scheduled and firing" — nothing schedules a workflow, and
                          the flag did not survive a reload either. */}
                    </div>
                  </div>

                  <div className="mt-4">
                    {w.steps.length === 0 ? (
                      <p className="text-[12.5px] text-neutral-400">No steps yet — open the builder to draw the chain.</p>
                    ) : (
                      <Chain steps={w.steps} running={isRunning ? running.step : undefined} />
                    )}
                  </div>

                  <Facts w={w} />
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
  workflows,
  running,
  busy,
  onBack,
  onOpen,
  onRun,
  onSteps,
  onRename,
  onDelete,
}: {
  workflow: Workflow;
  /** Every workflow in the workspace — the canvas rail switches between them. */
  workflows: Workflow[];
  running?: number;
  busy: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  onRun: () => void;
  onSteps: (id: string, steps: Step[]) => void;
  onRename: (id: string, patch: { name?: string; summary?: string }) => void;
  onDelete: () => void;
}) {
  const onStepsChange = useCallback((steps: Step[]) => onSteps(workflow.id, steps), [onSteps, workflow.id]);
  const onRenamePatch = useCallback(
    (patch: { name?: string; summary?: string }) => onRename(workflow.id, patch),
    [onRename, workflow.id]
  );

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
          // Arm lived here too. It set a flag no scheduler reads and no reload
          // survives, so the only button left is the one that does something.
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
        }
      />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pb-4 text-[12.5px]">
        {[
          ["Trigger", workflow.trigger],
          ["Steps", `${workflow.steps.length}`],
          ["Paid steps", `${paidSteps(workflow.steps)}`],
          ["Cost / run", `${usd(costOfSteps(workflow.steps))} USDC`],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-1.5">
            <span className="text-neutral-400">{k}</span>
            <span className="tnum text-neutral-700">{v}</span>
          </div>
        ))}
      </div>

      {/* Deliberately unkeyed: the canvas keys its own React Flow provider by
          workflow, so a switch from its rail reloads the graph without folding
          away the rail that switched it. */}
      <WorkflowCanvas
        workflow={workflow}
        workflows={workflows}
        saved={SAVED_STEPS.get(workflow.id) ?? workflow.steps}
        runningStep={running}
        busy={busy}
        onOpen={onOpen}
        onRun={onRun}
        onStepsChange={onStepsChange}
        onRename={onRenamePatch}
        onDelete={onDelete}
      />

      <p className="mt-3 max-w-[76ch] text-[12.5px] leading-relaxed text-neutral-500">
        Cost per run is the sum of what this chain&apos;s paid steps quote. Run walks the chain here
        in the browser and records the walk on this device — it signs nothing, and the trigger above
        describes what would fire the chain once there is a service to fire it, not something running
        now.
      </p>
    </>
  );
}
