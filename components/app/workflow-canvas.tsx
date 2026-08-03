"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type DefaultEdgeOptions,
  type Edge,
  type FitViewOptions,
  type IsValidConnection,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRight, Clock, GitBranch, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { usd, type Step, type StepKind, type Workflow } from "@/lib/app-data";
import { Sheet } from "./bits";

/** One table for what a step kind looks like, shared with the list's chain. */
export const STEP_KINDS: Record<StepKind, {
  label: string;
  Icon: typeof Clock;
  chip: string;
  swatch: string;
  blank: string;
}> = {
  trigger:   { label: "Trigger",   Icon: Clock,      chip: "bg-sky-50 text-sky-600",         swatch: "#0ea5e9", blank: "new trigger" },
  call:      { label: "Paid call", Icon: Zap,        chip: "bg-orange-50 text-accent",       swatch: "#ff6b2b", blank: "new call" },
  condition: { label: "Condition", Icon: GitBranch,  chip: "bg-violet-50 text-violet-600",   swatch: "#8b5cf6", blank: "new condition" },
  action:    { label: "Action",    Icon: ArrowRight, chip: "bg-emerald-50 text-emerald-600", swatch: "#10b981", blank: "new action" },
};

const KIND_ORDER: StepKind[] = ["trigger", "call", "condition", "action"];

/** What the palette hands over on a drag, and what the pane reads on drop. */
const DND_KIND = "application/ripar-step";

type StepData = {
  name: string;
  price?: number;
  // Set only on the copy handed to React Flow while a run walks the chain, so a
  // transient highlight can never leak back into the workflow's steps.
  running?: boolean;
};

/** A node's `type` is its step kind, and the canvas never holds an untyped node. */
type StepNode = Node<StepData, StepKind> & { type: StepKind };

// Never fit so far out that a step's name stops being readable — a long chain
// overflows and is panned to instead. Shared so the toolbar's fit and the
// initial fit frame the graph identically.
// minZoom must reach the canvas floor: a 4-step chain is ~1000px wide and the
// pane can be ~700px, so a 0.75 floor left the last node clipped after fitView.
const FIT: FitViewOptions = { padding: 0.12, minZoom: 0.4, maxZoom: 1 };

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "rgba(0,0,0,0.35)" },
};

/* ── node bodies ───────────────────────────────────────────────────────── */

function StepCard({
  kind,
  data,
  selected,
  children,
}: {
  kind: StepKind;
  data: StepData;
  selected?: boolean;
  children?: ReactNode;
}) {
  const k = STEP_KINDS[kind];
  return (
    <div
      className={cn(
        "w-[212px] rounded-xl border bg-white pb-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors",
        data.running
          ? "border-accent/50 bg-orange-50"
          : selected
            ? "border-neutral-900/30 ring-2 ring-accent/25"
            : "border-black/[0.09]"
      )}
    >
      <div className="flex h-7 items-center gap-2 px-3 pt-2.5">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", k.chip)}>
          <k.Icon size={13} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px] font-medium text-neutral-900">{data.name}</span>
          <span className="block text-[10.5px] text-neutral-400">{k.label}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

/** The card's geometry is fixed, so a condition's branch handles can be pinned
 *  to the rows they belong to: 1px border + 10 pad + 28 header + 17 rule, then
 *  two 20px rows. Change the rows and these move with them. */
const BRANCH_TOP = { yes: 66, no: 86 };

function TriggerNode({ data, selected }: NodeProps<StepNode>) {
  return (
    <>
      <StepCard kind="trigger" data={data} selected={selected} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function CallNode({ data, selected }: NodeProps<StepNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <StepCard kind="call" data={data} selected={selected}>
        <div className="mx-3 mt-2 flex items-baseline justify-between border-t border-black/[0.06] pt-2">
          <span className="text-[10.5px] text-neutral-400">Price</span>
          <span className="tnum text-[11.5px] font-medium text-neutral-700">
            {data.price ? `${usd(data.price, 3)} USDC` : "free"}
          </span>
        </div>
      </StepCard>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function ConditionNode({ data, selected }: NodeProps<StepNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <StepCard kind="condition" data={data} selected={selected}>
        <div className="mx-3 mt-2 border-t border-black/[0.06] pt-2 text-[10.5px] text-neutral-400">
          <div className="flex h-5 items-center">yes</div>
          <div className="flex h-5 items-center">no</div>
        </div>
      </StepCard>
      <Handle type="source" id="yes" position={Position.Right} style={{ top: BRANCH_TOP.yes }} />
      <Handle type="source" id="no" position={Position.Right} style={{ top: BRANCH_TOP.no }} />
    </>
  );
}

function ActionNode({ data, selected }: NodeProps<StepNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <StepCard kind="action" data={data} selected={selected} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

// Module scope on purpose: rebuilding this object per render remounts every node.
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  call: CallNode,
  condition: ConditionNode,
  action: ActionNode,
};

/* ── graph ⇄ steps ─────────────────────────────────────────────────────── */

/**
 * The list, the runner and the cost figure all still speak in ordered steps, so
 * the graph is flattened: walk forward from the nodes nothing feeds into, then
 * append whatever the walk never reached, left to right.
 */
function ordered(nodes: StepNode[], edges: Edge[]): StepNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const fedInto = new Set<string>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e.target]);
    fedInto.add(e.target);
  }

  const leftToRight = (a: StepNode, b: StepNode) => a.position.x - b.position.x;
  const queue = nodes.filter((n) => !fedInto.has(n.id)).sort(leftToRight).map((n) => n.id);
  const seen = new Set<string>();
  const out: StepNode[] = [];

  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) out.push(node);
    queue.push(...(outgoing.get(id) ?? []));
  }
  // A cycle or an island has no entry of its own — still part of the workflow.
  for (const n of [...nodes].sort(leftToRight)) if (!seen.has(n.id)) out.push(n);
  return out;
}

const toSteps = (nodes: StepNode[], edges: Edge[]): Step[] =>
  ordered(nodes, edges).map((n) => ({ name: n.data.name, kind: n.type, price: n.data.price }));

/** One id scheme for every edge — seeded, auto-wired or hand-drawn. */
const edgeId = (source: string, branch: string | undefined, target: string) =>
  `e_${source}${branch ? `:${branch}` : ""}-${target}`;

/** A condition's happy path is its "yes" branch; "no" is drawn by hand. */
const defaultBranch = (from: StepNode) => (from.type === "condition" ? "yes" : undefined);

function fromSteps(steps: Step[]): { nodes: StepNode[]; edges: Edge[] } {
  const nodes: StepNode[] = steps.map((s, i) => ({
    id: `s${i + 1}`,
    type: s.kind,
    position: { x: i * 264, y: 0 },
    data: { name: s.name, price: s.price },
  }));
  const edges: Edge[] = nodes.slice(1).map((n, i) => {
    const branch = defaultBranch(nodes[i]);
    return {
      id: edgeId(nodes[i].id, branch, n.id),
      source: nodes[i].id,
      target: n.id,
      sourceHandle: branch,
      ...defaultEdgeOptions,
    };
  });
  return { nodes, edges };
}

/* ── canvas ────────────────────────────────────────────────────────────── */

export function WorkflowCanvas(props: {
  workflow: Workflow;
  /** Index into the workflow's steps while a run walks the chain. */
  runningStep?: number;
  onStepsChange?: (steps: Step[]) => void;
}) {
  // useReactFlow() is called by Canvas itself, which is exactly the case the
  // provider exists for — <ReactFlow> alone does not supply the store.
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({
  workflow,
  runningStep,
  onStepsChange,
}: {
  workflow: Workflow;
  runningStep?: number;
  onStepsChange?: (steps: Step[]) => void;
}) {
  // Seeded once. The caller keys this component by workflow id, so switching
  // workflows remounts rather than trying to reconcile two graphs.
  const [seed] = useState(() => fromSteps(workflow.steps));
  const [nodes, setNodes] = useState<StepNode[]>(seed.nodes);
  const [edges, setEdges] = useState<Edge[]>(seed.edges);
  const seq = useRef(seed.nodes.length);
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow();

  const selectedNode = nodes.find((n) => n.selected) ?? null;
  const selectedEdge = edges.find((e) => e.selected) ?? null;

  // The parent only cares about the ordered steps, so drags — which change
  // positions but not the chain — stay out of its state.
  const sent = useRef(JSON.stringify(workflow.steps));
  useEffect(() => {
    const steps = toSteps(nodes, edges);
    const key = JSON.stringify(steps);
    if (key === sent.current) return;
    sent.current = key;
    onStepsChange?.(steps);
  }, [nodes, edges, onStepsChange]);

  const onNodesChange: OnNodesChange<StepNode> = useCallback(
    (changes) => setNodes((prev) => applyNodeChanges(changes, prev)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((prev) => applyEdgeChanges(changes, prev)),
    []
  );

  const onConnect: OnConnect = useCallback((c) => {
    if (!c.source || !c.target) return;
    setEdges((prev) => [
      ...prev,
      {
        id: edgeId(c.source, c.sourceHandle ?? undefined, c.target),
        source: c.source,
        target: c.target,
        sourceHandle: c.sourceHandle ?? undefined,
        targetHandle: c.targetHandle ?? undefined,
        ...defaultEdgeOptions,
      },
    ]);
  }, []);

  /** Reachability, so a connection can't close a loop the runner would never leave. */
  const isValidConnection: IsValidConnection = useCallback(
    (c) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      if (nodes.find((n) => n.id === c.target)?.type === "trigger") return false;
      if (edges.some((e) => e.source === c.source && e.target === c.target && (e.sourceHandle ?? null) === (c.sourceHandle ?? null))) return false;

      const seen = new Set<string>();
      const queue = [c.target];
      while (queue.length) {
        const id = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (id === c.source) return false;
        for (const e of edges) if (e.source === id) queue.push(e.target);
      }
      return true;
    },
    [nodes, edges]
  );

  const select = useCallback((id: string) => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === id })));
    setEdges((prev) => prev.map((e) => (e.selected ? { ...e, selected: false } : e)));
  }, []);

  /**
   * Dropping on the pane places a loose step wherever the cursor was. Adding
   * from the toolbar continues the chain instead: it lands to the right of the
   * selection (or the tail) and wires itself up.
   */
  const addStep = useCallback(
    (kind: StepKind, at?: XYPosition) => {
      const id = `s${++seq.current}`;
      const anchor = at ? null : (nodes.find((n) => n.selected) ?? ordered(nodes, edges).at(-1) ?? null);
      const position = at ?? (anchor ? { x: anchor.position.x + 264, y: anchor.position.y } : { x: 24, y: 24 });

      setNodes((prev) => [
        ...prev.map((n) => (n.selected ? { ...n, selected: false } : n)),
        {
          id,
          type: kind,
          position,
          selected: true,
          data: { name: STEP_KINDS[kind].blank, price: kind === "call" ? 0.01 : undefined },
        },
      ]);

      // A trigger opens a chain, so it is never wired behind anything.
      if (anchor && kind !== "trigger") {
        const branch = defaultBranch(anchor);
        setEdges((prev) => [
          ...prev,
          {
            id: edgeId(anchor.id, branch, id),
            source: anchor.id,
            target: id,
            sourceHandle: branch,
            ...defaultEdgeOptions,
          },
        ]);
      }

      // A step added from the toolbar lands off the right of a long chain, so
      // the view follows it. A dropped one is already under the cursor.
      if (!at) setCenter(position.x + 106, position.y + 52, { zoom: getZoom(), duration: 240 });
    },
    [nodes, edges, setCenter, getZoom]
  );

  const updateStep = useCallback((id: string, patch: Partial<StepData> & { kind?: StepKind }) => {
    const { kind, ...data } = patch;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        // Price belongs to paid calls only, so it follows the kind.
        const priced = kind == null ? {} : kind === "call" ? { price: n.data.price ?? 0.01 } : { price: undefined };
        return { ...n, type: kind ?? n.type, data: { ...n.data, ...priced, ...data } };
      })
    );
  }, []);

  const deleteStep = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
  }, []);

  const deleteLink = useCallback((id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id));
  }, []);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const kind = event.dataTransfer.getData(DND_KIND);
    if (!KIND_ORDER.includes(kind as StepKind)) return;
    const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addStep(kind as StepKind, { x: at.x - 106, y: at.y - 26 });
  }

  // The active step, and the edges leaving it, are marked on the copy React Flow
  // renders — never on the state the workflow is read back from.
  const activeId = useMemo(
    () => (runningStep == null ? null : (ordered(nodes, edges)[runningStep]?.id ?? null)),
    [nodes, edges, runningStep]
  );
  const view = useMemo<StepNode[]>(
    () => (activeId ? nodes.map((n) => (n.id === activeId ? { ...n, data: { ...n.data, running: true } } : n)) : nodes),
    [nodes, activeId]
  );
  const wired = useMemo<Edge[]>(
    () =>
      activeId
        ? edges.map((e) =>
            e.source === activeId
              ? { ...e, className: "edge-flow", style: { stroke: "var(--accent)", strokeWidth: 2 } }
              : e
          )
        : edges,
    [edges, activeId]
  );

  return (
    <Sheet>
      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.07] px-3 py-2.5">
        <span className="text-[12px] font-medium text-neutral-500">Add step</span>
        {KIND_ORDER.map((kind) => {
          const k = STEP_KINDS[kind];
          return (
            <button
              key={kind}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_KIND, kind);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => addStep(kind)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900"
            >
              <k.Icon size={12} className="text-neutral-400" />
              {k.label}
            </button>
          );
        })}
        <span className="ml-auto hidden text-[12px] text-neutral-400 lg:block">
          Drag a handle to connect · Delete removes the selection
        </span>
      </div>

      <div className="flex flex-col md:h-[520px] md:flex-row">
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          className="relative h-[380px] min-w-0 bg-[#fbfbfb] md:h-auto md:flex-1"
        >
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-[14px] font-medium text-neutral-800">No steps yet</p>
              <p className="mt-1.5 max-w-[38ch] text-[13px] leading-relaxed text-neutral-500">
                Add a trigger to arm the chain, then a paid call for the work it should buy.
              </p>
            </div>
          )}
          <ReactFlow<StepNode>
            nodes={view}
            edges={wired}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineType={ConnectionLineType.SmoothStep}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            fitViewOptions={FIT}
            minZoom={0.4}
            maxZoom={1.6}
            // The canvas sits inside a scrolling page, so the wheel belongs to
            // the page and zoom belongs to the controls.
            zoomOnScroll={false}
            preventScrolling={false}
            className="rf-canvas"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(0,0,0,0.13)" />
            <Controls showInteractive={false} fitViewOptions={FIT} />
            <MiniMap<StepNode>
              pannable
              zoomable
              ariaLabel="Workflow overview"
              maskColor="rgba(0,0,0,0.06)"
              nodeStrokeWidth={0}
              nodeBorderRadius={3}
              nodeColor={(n) => STEP_KINDS[n.type].swatch}
              style={{ width: 148, height: 96 }}
            />
          </ReactFlow>
        </div>

        <Inspector
          key={selectedNode ? `${selectedNode.id}:${selectedNode.type}` : (selectedEdge?.id ?? "none")}
          node={selectedNode}
          edge={selectedEdge}
          nodes={nodes}
          onUpdate={updateStep}
          onDeleteStep={deleteStep}
          onDeleteLink={deleteLink}
          onSelect={select}
        />
      </div>
    </Sheet>
  );
}

/* ── inspector ─────────────────────────────────────────────────────────── */

function Inspector({
  node,
  edge,
  nodes,
  onUpdate,
  onDeleteStep,
  onDeleteLink,
  onSelect,
}: {
  node: StepNode | null;
  edge: Edge | null;
  nodes: StepNode[];
  onUpdate: (id: string, patch: Partial<StepData> & { kind?: StepKind }) => void;
  onDeleteStep: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [price, setPrice] = useState(node?.data.price != null ? usd(node.data.price, 3) : "");
  const [err, setErr] = useState<string | null>(null);

  const shell = "min-w-0 border-t border-black/[0.07] p-4 md:w-[264px] md:shrink-0 md:overflow-y-auto md:border-l md:border-t-0";

  if (edge) {
    const from = nodes.find((n) => n.id === edge.source);
    const to = nodes.find((n) => n.id === edge.target);
    return (
      <aside className={shell}>
        <h3 className="text-[13px] font-semibold text-neutral-900">Connection</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
          {from?.data.name ?? "—"}
          {edge.sourceHandle && <span className="text-neutral-400"> · {edge.sourceHandle}</span>}
          <span className="mx-1.5 text-neutral-300">→</span>
          {to?.data.name ?? "—"}
        </p>
        <button
          type="button"
          onClick={() => onDeleteLink(edge.id)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          <Trash2 size={13} /> Delete connection
        </button>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className={shell}>
        <h3 className="text-[13px] font-semibold text-neutral-900">Nothing selected</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
          Pick a step to rename it, change its kind or set what a call costs. Drag from a
          step&rsquo;s right edge to the next one to wire them together.
        </p>
        <ul className="mt-4 space-y-1.5">
          {nodes.map((n) => {
            const k = STEP_KINDS[n.type];
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelect(n.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.03]"
                >
                  <k.Icon size={12} className="shrink-0 text-neutral-400" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-700">{n.data.name}</span>
                  <span className="shrink-0 text-[11px] text-neutral-400">{k.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  const step = node;
  const k = STEP_KINDS[step.type];

  function commitPrice(next: string) {
    setPrice(next);
    const n = Number(next);
    if (next.trim() === "" || !Number.isFinite(n) || n < 0) {
      setErr("Price must be zero or more.");
      return;
    }
    setErr(null);
    onUpdate(step.id, { price: n });
  }

  return (
    <aside className={shell}>
      <div className="flex items-center gap-2">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", k.chip)}>
          <k.Icon size={13} />
        </span>
        <h3 className="text-[13px] font-semibold text-neutral-900">Step</h3>
      </div>

      <label className="mt-4 block">
        <span className="text-[12.5px] font-medium text-neutral-700">Name</span>
        <input
          value={step.data.name}
          onChange={(e) => onUpdate(step.id, { name: e.target.value })}
          placeholder={k.blank}
          className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-[13.5px] outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
        />
      </label>

      <label className="mt-3 block">
        <span className="text-[12.5px] font-medium text-neutral-700">Kind</span>
        <select
          value={step.type}
          onChange={(e) => onUpdate(step.id, { kind: e.target.value as StepKind })}
          className="mt-1.5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-neutral-400"
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {STEP_KINDS[k].label}
            </option>
          ))}
        </select>
      </label>

      {step.type === "call" && (
        <label className="mt-3 block">
          <span className="text-[12.5px] font-medium text-neutral-700">Price (USDC)</span>
          <input
            value={price}
            onChange={(e) => commitPrice(e.target.value)}
            inputMode="decimal"
            className="tnum mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-[13.5px] outline-none focus:border-neutral-400"
          />
          {err ? (
            <span className="mt-1.5 block text-[12px] text-rose-600">{err}</span>
          ) : (
            <span className="mt-1.5 block text-[12px] leading-relaxed text-neutral-400">
              Charged per run, quoted back to the caller as HTTP 402.
            </span>
          )}
        </label>
      )}

      <button
        type="button"
        onClick={() => onDeleteStep(step.id)}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
      >
        <Trash2 size={13} /> Delete step
      </button>
    </aside>
  );
}
