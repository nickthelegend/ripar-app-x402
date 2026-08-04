"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
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
  type OnDelete,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowRight,
  Blocks,
  Clock,
  Download,
  GitBranch,
  Lock,
  LockOpen,
  Maximize2,
  Minus,
  PanelLeft,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { usd, type Step, type StepKind, type Workflow } from "@/lib/app-data";
import { DND_MCP_TOOL, MCP_CATEGORIES, type McpTool } from "@/lib/mcp-tools";
import { useMcpToolIndex } from "@/lib/mcp-servers";
import { clearGraph, loadGraph, nextSeq, saveGraph, type WorkflowGraph } from "@/lib/workflow-graph";
import {
  COALESCE_MS,
  recordEdit,
  useActivity,
  type WorkflowEdit,
  type WorkflowRun,
} from "@/lib/workflow-activity";
import { CopyButton, Sheet } from "./bits";
import { HistoryPanel, RunsPanel } from "./workflow-activity-panels";
import { MCP_CATEGORY_ICON, McpPalette } from "./mcp-palette";
import { WorkflowRail } from "./workflow-rail";

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
  mcp:       { label: "MCP tool",  Icon: Blocks,     chip: "bg-indigo-50 text-indigo-600",   swatch: "#6366f1", blank: "new tool" },
};

// The toolbar's kinds. An MCP step is never blank — it comes from the palette
// with a tool already attached — so it is not offered here.
const KIND_ORDER: StepKind[] = ["trigger", "call", "condition", "action"];

/** What the palette hands over on a drag, and what the pane reads on drop. */
const DND_KIND = "application/ripar-step";

type StepData = {
  name: string;
  price?: number;
  /** Set only on an MCP step: which catalogue tool it runs. */
  tool?: string;
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

/** Half a card, so a drop lands under the cursor rather than beside it. */
const CARD = { w: 212, h: 52 };

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  // The canvas is dark, so the arrow is drawn out of the ink rather than onto it.
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "rgba(255,255,255,0.42)" },
};

/* ── node bodies ───────────────────────────────────────────────────────── */

/** A card's glyph wears its kind's own swatch, mixed for the dark canvas — one
 *  colour table drives the light list, the minimap and the node alike. */
const glyph = (swatch: string) => ({
  color: `color-mix(in srgb, ${swatch} 74%, white)`,
  background: `color-mix(in srgb, ${swatch} 20%, transparent)`,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${swatch} 30%, transparent)`,
});

function StepCard({
  kind,
  data,
  selected,
  icon: Icon = STEP_KINDS[kind].Icon,
  swatch = STEP_KINDS[kind].swatch,
  sub = STEP_KINDS[kind].label,
  children,
}: {
  kind: StepKind;
  data: StepData;
  selected?: boolean;
  /** An MCP card wears its tool's category rather than the kind's own mark. */
  icon?: typeof Clock;
  swatch?: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-[212px] rounded-xl border pb-2.5 transition-colors",
        data.running
          ? "border-accent/70 bg-[#221408] shadow-[0_10px_30px_-14px_rgba(255,107,43,0.9)]"
          : selected
            ? "border-accent/55 bg-[#191b1d] shadow-[0_0_0_1px_rgba(255,107,43,0.22)]"
            : "border-white/[0.09] bg-[#16181a] hover:border-white/20"
      )}
    >
      <div className="flex h-7 items-center gap-2 px-3 pt-2.5">
        <span
          style={glyph(swatch)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        >
          <Icon size={13} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px] font-medium text-neutral-100">{data.name}</span>
          <span className="block truncate text-[10.5px] text-white/40">{sub}</span>
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
        <div className="mx-3 mt-2 flex items-baseline justify-between border-t border-white/[0.08] pt-2">
          <span className="text-[10.5px] text-white/40">Price</span>
          <span className="tnum text-[11.5px] font-medium text-white/75">
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
        <div className="mx-3 mt-2 border-t border-white/[0.08] pt-2 text-[10.5px] text-white/40">
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

/** The tool behind the step, resolved live: detaching its server leaves the
 *  card standing and says so rather than dropping the step out of the graph. */
function McpNode({ data, selected }: NodeProps<StepNode>) {
  const tools = useMcpToolIndex();
  const tool = data.tool ? tools.get(data.tool) : undefined;
  const category = tool ? MCP_CATEGORIES[tool.category] : null;

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <StepCard
        kind="mcp"
        data={data}
        selected={selected}
        icon={tool ? MCP_CATEGORY_ICON[tool.category] : STEP_KINDS.mcp.Icon}
        swatch={category?.swatch ?? STEP_KINDS.mcp.swatch}
        sub={tool && category ? `MCP · ${tool.serverLabel ?? category.label}` : "MCP · tool not attached"}
      >
        <div className="mx-3 mt-2 flex items-baseline justify-between gap-2 border-t border-white/[0.08] pt-2">
          <span className="min-w-0 truncate font-mono text-[10px] text-white/35">{data.tool ?? "no tool"}</span>
          <span className="tnum shrink-0 text-[11.5px] font-medium text-white/75">
            {data.price ? `${usd(data.price, 3)} USDC` : "free"}
          </span>
        </div>
      </StepCard>
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
  mcp: McpNode,
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
  ordered(nodes, edges).map((n) => ({ name: n.data.name, kind: n.type, price: n.data.price, tool: n.data.tool }));

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
    data: { name: s.name, price: s.price, tool: s.tool },
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

/* ── graph ⇄ stored draft ──────────────────────────────────────────────── */

const toGraph = (nodes: StepNode[], edges: Edge[]): WorkflowGraph => ({
  // Positions are rounded: sub-pixel drift would rewrite the draft on every drag.
  nodes: nodes.map((n) => ({
    id: n.id,
    kind: n.type,
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    name: n.data.name,
    price: n.data.price,
    tool: n.data.tool,
  })),
  edges: edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  })),
});

const fromGraph = (g: WorkflowGraph): { nodes: StepNode[]; edges: Edge[] } => ({
  nodes: g.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: n.x, y: n.y },
    data: { name: n.name, price: n.price, tool: n.tool },
  })),
  edges: g.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    ...defaultEdgeOptions,
  })),
});

const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

/* ── shared control styling ────────────────────────────────────────────── */

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:border-black/20 hover:text-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:border-black/10 disabled:hover:text-neutral-300";

const FIELD =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13.5px] outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400";

/** Icon-only toolbar control. Never unlabelled — the name is what a screen
 *  reader reads and what the tooltip shows. */
function IconButton({
  label,
  Icon,
  onClick,
  pressed,
  disabled,
}: {
  label: string;
  Icon: typeof Clock;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:border-black/[0.07] disabled:text-neutral-300",
        pressed
          ? "border-neutral-900/25 bg-neutral-900 text-white hover:bg-neutral-800"
          : "border-black/10 bg-white text-neutral-500 hover:border-black/20 hover:text-neutral-900"
      )}
    >
      <Icon size={14} />
    </button>
  );
}

/* ── canvas ────────────────────────────────────────────────────────────── */

/** Nothing to subscribe to — the snapshot pair alone is what tells the canvas
 *  it is past hydration. */
const noSubscribe = () => () => {};

type CanvasProps = {
  workflow: Workflow;
  /** Every workflow in the workspace, for the rail that switches between them. */
  workflows?: Workflow[];
  /** The server's copy of the chain — what "revert to saved" goes back to. */
  saved?: Step[];
  /** Index into the workflow's steps while a run walks the chain. */
  runningStep?: number;
  /** A run is in flight — this workflow's or another's. */
  busy?: boolean;
  onOpen?: (id: string) => void;
  onStepsChange?: (steps: Step[]) => void;
  onRun?: () => void;
  onRename?: (patch: { name?: string; summary?: string }) => void;
  onDelete?: () => void;
};

/** How the builder is arranged, as opposed to what is on the canvas. It lives
 *  above the per-workflow remount because switching workflows from the rail
 *  must not fold the rail away under you. */
type Chrome = { rail: boolean; tools: boolean; locked: boolean; tab: Tab };

// A phone has no room for the rails stacked above the canvas, so they start
// collapsed there. The server has no width to read, and never draws the canvas.
const openChrome = (): Chrome =>
  typeof window === "undefined"
    ? { rail: false, tools: false, locked: false, tab: "properties" }
    : { rail: window.innerWidth >= 1024, tools: window.innerWidth >= 768, locked: false, tab: "properties" };

export function WorkflowCanvas(props: CanvasProps) {
  const [chrome, setChrome] = useState<Chrome>(openChrome);
  // The draft lives in localStorage, which the server cannot read. Mounting the
  // canvas only after hydration lets it seed from the draft in one pass, rather
  // than drawing the stored chain and swapping it out a frame later.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!hydrated) return <CanvasSkeleton />;

  // useReactFlow() is called by Canvas itself, which is exactly the case the
  // provider exists for — <ReactFlow> alone does not supply the store. Keyed by
  // workflow so a switch starts a clean graph and a clean store, rather than
  // reconciling two.
  return (
    <ReactFlowProvider key={props.workflow.id}>
      <Canvas {...props} chrome={chrome} onChrome={setChrome} />
    </ReactFlowProvider>
  );
}

function CanvasSkeleton() {
  // Holds the builder's frame — toolbar, rails, pane, inspector — so the page
  // does not jump when the real canvas takes over a frame later.
  return (
    <Sheet>
      <div className="h-[45px] border-b border-black/[0.07]" />
      <div className="flex flex-col md:h-[520px] md:flex-row">
        <div className="border-b border-black/[0.07] md:w-[218px] md:shrink-0 md:border-b-0 md:border-r" />
        <div className="flex h-[380px] min-w-0 items-center justify-center bg-[#0e0f11] md:h-auto md:flex-1">
          <p className="animate-pulse text-[13px] text-white/45">Loading the builder…</p>
        </div>
        <div className="border-t border-black/[0.07] md:w-[288px] md:shrink-0 md:border-l md:border-t-0" />
      </div>
    </Sheet>
  );
}

function Canvas({
  workflow,
  workflows,
  saved,
  runningStep,
  busy,
  chrome,
  onChrome,
  onOpen,
  onStepsChange,
  onRun,
  onRename,
  onDelete,
}: CanvasProps & { chrome: Chrome; onChrome: (next: (c: Chrome) => Chrome) => void }) {
  // Seeded once, from the locally stored draft when there is one. The provider
  // above is keyed by workflow id, so switching workflows remounts this rather
  // than trying to reconcile two graphs.
  const [seed] = useState(() => {
    const draft = loadGraph(workflow.id);
    const graph = draft ? fromGraph(draft) : fromSteps(workflow.steps);
    return { ...graph, at: draft?.at ?? null, signature: JSON.stringify(toGraph(graph.nodes, graph.edges)) };
  });
  const [nodes, setNodes] = useState<StepNode[]>(seed.nodes);
  const [edges, setEdges] = useState<Edge[]>(seed.edges);
  const { rail, tools, locked, tab } = chrome;
  const setPanel = useCallback(
    (next: Partial<Chrome>) => onChrome((c) => ({ ...c, ...next })),
    [onChrome]
  );
  const [dropping, setDropping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftAt, setDraftAt] = useState<number | null>(seed.at);
  const seq = useRef(nextSeq(seed.nodes));
  // What is on disk, so an untouched graph is never written back over itself.
  const stored = useRef(seed.signature);
  // The name a rename burst started from, so a coalesced log line still names
  // what the step used to be called rather than its second-to-last keystroke.
  const renamedFrom = useRef<{ id: string; from: string; at: number } | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setCenter, getZoom, fitView, zoomIn, zoomOut } = useReactFlow();
  const catalogue = useMcpToolIndex();
  const activity = useActivity(workflow.id);
  const { toast } = useToast();

  const selectedNode = nodes.find((n) => n.selected) ?? null;
  const selectedEdge = edges.find((e) => e.selected) ?? null;

  const log = useCallback(
    (text: string, key?: string) => recordEdit(workflow.id, text, key),
    [workflow.id]
  );

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

  /** React Flow frames on init only, so a graph swapped in later asks for its
   *  own frame — once the new cards have been measured. */
  const frame = useCallback(() => {
    setTimeout(() => void fitView(FIT), 80);
  }, [fitView]);

  // Debounced so a drag writes once it settles, not once per animation frame.
  useEffect(() => {
    const graph = toGraph(nodes, edges);
    const payload = JSON.stringify(graph);
    if (payload === stored.current) return;
    const t = setTimeout(() => {
      const at = saveGraph(workflow.id, graph);
      // A browser that refuses to store leaves stored.current alone, so the
      // next edit tries again rather than silently reporting a saved draft.
      if (at == null) return;
      stored.current = payload;
      setDraftAt(at);
    }, 400);
    return () => clearTimeout(t);
  }, [nodes, edges, workflow.id]);

  const onNodesChange: OnNodesChange<StepNode> = useCallback(
    (changes) => setNodes((prev) => applyNodeChanges(changes, prev)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((prev) => applyEdgeChanges(changes, prev)),
    []
  );

  const nameOf = useCallback(
    (id: string) => nodes.find((n) => n.id === id)?.data.name ?? "a step",
    [nodes]
  );

  const onConnect: OnConnect = useCallback(
    (c) => {
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
      log(`Connected “${nameOf(c.source)}” to “${nameOf(c.target)}”`);
    },
    [log, nameOf]
  );

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

  const select = useCallback(
    (id: string) => {
      setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === id })));
      setEdges((prev) => prev.map((e) => (e.selected ? { ...e, selected: false } : e)));
      // Picking a step is a request to see it, whichever tab was last open.
      setPanel({ tab: "properties" });
    },
    [setPanel]
  );

  /**
   * Dropping on the pane places a loose step wherever the cursor was. Adding
   * from the toolbar continues the chain instead: it lands to the right of the
   * selection (or the tail) and wires itself up.
   */
  const addNode = useCallback(
    (init: { kind: StepKind } & StepData, at?: XYPosition) => {
      const { kind, ...data } = init;
      const id = `s${++seq.current}`;
      const anchor = at ? null : (nodes.find((n) => n.selected) ?? ordered(nodes, edges).at(-1) ?? null);
      const position = at ?? (anchor ? { x: anchor.position.x + 264, y: anchor.position.y } : { x: 24, y: 24 });

      setNodes((prev) => [
        ...prev.map((n) => (n.selected ? { ...n, selected: false } : n)),
        { id, type: kind, position, selected: true, data },
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
      if (!at) setCenter(position.x + CARD.w / 2, position.y + CARD.h, { zoom: getZoom(), duration: 240 });
      log(`Added ${STEP_KINDS[kind].label.toLowerCase()} “${data.name}”`);
    },
    [nodes, edges, setCenter, getZoom, log]
  );

  const addStep = useCallback(
    (kind: StepKind, at?: XYPosition) =>
      addNode({ kind, name: STEP_KINDS[kind].blank, price: kind === "call" ? 0.01 : undefined }, at),
    [addNode]
  );

  const addTool = useCallback(
    (tool: McpTool, at?: XYPosition) => addNode({ kind: "mcp", name: tool.name, price: tool.price, tool: tool.id }, at),
    [addNode]
  );

  /** Where the keyboard drops a tool: the middle of the pane, stepped aside if
   *  a card already sits there so repeated adds don't stack into one. */
  const centre = useCallback((): XYPosition | undefined => {
    const box = pane.current?.getBoundingClientRect();
    if (!box) return undefined;
    const at = screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    let spot = { x: at.x - CARD.w / 2, y: at.y - CARD.h / 2 };
    while (nodes.some((n) => Math.abs(n.position.x - spot.x) < 24 && Math.abs(n.position.y - spot.y) < 24)) {
      spot = { x: spot.x + 28, y: spot.y + 28 };
    }
    return spot;
  }, [nodes, screenToFlowPosition]);

  /** A locked canvas is read-only: it can be inspected and run, not rewired. */
  const blocked = useCallback(() => {
    if (!locked) return false;
    toast("The canvas is locked — unlock it to edit the chain", "error");
    return true;
  }, [locked, toast]);

  const updateStep = useCallback(
    (id: string, patch: Partial<StepData> & { kind?: StepKind }) => {
      const target = nodes.find((n) => n.id === id);
      const { kind, ...data } = patch;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          // Price belongs to paid calls only, so it follows the kind.
          const priced = kind == null ? {} : kind === "call" ? { price: n.data.price ?? 0.01 } : { price: undefined };
          // A tool reference means nothing once the step is no longer an MCP one.
          const tooled = kind == null || kind === "mcp" ? {} : { tool: undefined };
          return { ...n, type: kind ?? n.type, data: { ...n.data, ...priced, ...tooled, ...data } };
        })
      );
      if (!target) return;

      if (data.name != null && data.name !== target.data.name) {
        const burst = renamedFrom.current;
        const from =
          burst && burst.id === id && Date.now() - burst.at < COALESCE_MS ? burst.from : target.data.name;
        renamedFrom.current = { id, from, at: Date.now() };
        log(`Renamed “${from}” to “${data.name}”`, `name:${id}`);
      }
      if (kind && kind !== target.type) {
        log(`“${target.data.name}” is now a ${STEP_KINDS[kind].label.toLowerCase()}`, `kind:${id}`);
      }
      if (data.price != null && data.price !== target.data.price) {
        log(`Priced “${target.data.name}” at ${usd(data.price, 3)} USDC`, `price:${id}`);
      }
      if (data.tool && data.tool !== target.data.tool) {
        log(`“${target.data.name}” now runs ${data.tool}`, `tool:${id}`);
      }
    },
    [nodes, log]
  );

  const deleteStep = useCallback(
    (id: string) => {
      log(`Deleted “${nameOf(id)}”`);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    },
    [log, nameOf]
  );

  const deleteLink = useCallback(
    (id: string) => {
      const edge = edges.find((e) => e.id === id);
      if (edge) log(`Disconnected “${nameOf(edge.source)}” from “${nameOf(edge.target)}”`);
      setEdges((prev) => prev.filter((e) => e.id !== id));
    },
    [edges, log, nameOf]
  );

  /** Backspace and Delete remove through React Flow itself rather than through
   *  the inspector, so the log is written here too — an edit made with the
   *  keyboard is still an edit, and History must not quietly miss it. */
  const onGraphDelete: OnDelete<StepNode, Edge> = useCallback(
    ({ nodes: gone, edges: cut }) => {
      for (const n of gone) log(`Deleted “${n.data.name}”`);
      // An edge pulled out with its node is not a separate change the user made.
      const removed = new Set(gone.map((n) => n.id));
      for (const e of cut) {
        if (removed.has(e.source) || removed.has(e.target)) continue;
        log(`Disconnected “${nameOf(e.source)}” from “${nameOf(e.target)}”`);
      }
    },
    [log, nameOf]
  );

  const resetToSaved = useCallback(() => {
    // Reverting rewrites the whole chain, so the lock has to hold it back too.
    if (blocked()) return;
    const base = fromSteps(saved ?? workflow.steps);
    clearGraph(workflow.id);
    stored.current = JSON.stringify(toGraph(base.nodes, base.edges));
    seq.current = base.nodes.length;
    setNodes(base.nodes);
    setEdges(base.edges);
    setDraftAt(null);
    frame();
    log("Reverted to the saved workflow");
    toast("Reverted to the saved workflow");
  }, [blocked, saved, workflow.id, workflow.steps, frame, log, toast]);

  /** Writes the draft now rather than waiting out the debounce, so "Save" is a
   *  thing that happened and not a thing that is about to. */
  const saveNow = useCallback(() => {
    const graph = toGraph(nodes, edges);
    const at = saveGraph(workflow.id, graph);
    if (at == null) {
      toast("This browser refused to store the draft", "error");
      return;
    }
    stored.current = JSON.stringify(graph);
    setDraftAt(at);
    log("Saved the draft");
    toast("Draft saved on this device");
  }, [nodes, edges, workflow.id, log, toast]);

  const clearCanvas = useCallback(() => {
    if (blocked()) return;
    if (nodes.length === 0) {
      toast("The canvas is already empty");
      return;
    }
    const before = { nodes, edges };
    setNodes([]);
    setEdges([]);
    log(`Cleared the canvas · ${before.nodes.length} ${before.nodes.length === 1 ? "step" : "steps"} removed`);
    toast(`Cleared ${before.nodes.length} ${before.nodes.length === 1 ? "step" : "steps"}`, "default", {
      label: "Undo",
      onClick: () => {
        setNodes(before.nodes);
        setEdges(before.edges);
        log("Undid the clear");
        frame();
      },
    });
  }, [blocked, nodes, edges, frame, log, toast]);

  /** The graph as it stands, as a file — the same shape the draft is stored in,
   *  plus the ordered steps a runner would walk. */
  const downloadJson = useCallback(() => {
    const payload = {
      id: workflow.id,
      name: workflow.name,
      summary: workflow.summary,
      trigger: workflow.trigger,
      exportedAt: new Date().toISOString(),
      steps: toSteps(nodes, edges),
      graph: toGraph(nodes, edges),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workflow.id}.workflow.json`;
    link.click();
    // Revoking in the same tick can beat the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast(`Downloaded ${workflow.id}.workflow.json`);
  }, [workflow, nodes, edges, toast]);

  const rename = useCallback(
    (patch: { name?: string; summary?: string }) => {
      onRename?.(patch);
      if (patch.name != null) log(`Renamed the workflow to “${patch.name}”`, "wf:name");
      if (patch.summary != null) log("Edited the workflow description", "wf:summary");
    },
    [onRename, log]
  );

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropping(false);
    if (blocked()) return;
    const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const spot = { x: at.x - CARD.w / 2, y: at.y - CARD.h / 2 };

    const toolId = event.dataTransfer.getData(DND_MCP_TOOL);
    if (toolId) {
      const tool = catalogue.get(toolId);
      // The tool's server can be detached mid-drag; then there is nothing to add.
      if (tool) addTool(tool, spot);
      return;
    }
    const kind = event.dataTransfer.getData(DND_KIND);
    if (KIND_ORDER.includes(kind as StepKind)) addStep(kind as StepKind, spot);
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

  const running = runningStep != null;

  return (
    <Sheet>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-black/[0.07] px-3 py-2.5">
        <IconButton
          label={rail ? "Hide the workflow list" : "Show the workflow list"}
          Icon={PanelLeft}
          pressed={rail}
          onClick={() => setPanel({ rail: !rail })}
        />
        <IconButton
          label={tools ? "Hide the MCP tools" : "Show the MCP tools"}
          Icon={Blocks}
          pressed={tools}
          onClick={() => setPanel({ tools: !tools })}
        />
        <span aria-hidden className="mx-1 h-5 w-px bg-black/[0.08]" />
        <span className="text-[12px] font-medium text-neutral-500">Add step</span>
        {KIND_ORDER.map((kind) => {
          const k = STEP_KINDS[kind];
          return (
            <button
              key={kind}
              type="button"
              draggable={!locked}
              disabled={locked}
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_KIND, kind);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => addStep(kind)}
              className={BTN}
            >
              <k.Icon size={12} className="text-neutral-400" />
              {k.label}
            </button>
          );
        })}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {draftAt != null && (
            <span className="mr-1 text-[12px] text-neutral-400">
              Draft saved <span className="tnum">{clock(draftAt)}</span>
            </span>
          )}
          <IconButton label="Fit the graph to the pane" Icon={Maximize2} onClick={() => void fitView(FIT)} />
          <IconButton label="Zoom out" Icon={Minus} onClick={() => void zoomOut({ duration: 160 })} />
          <IconButton label="Zoom in" Icon={Plus} onClick={() => void zoomIn({ duration: 160 })} />
          <IconButton
            label={locked ? "Unlock the canvas" : "Lock the canvas"}
            Icon={locked ? Lock : LockOpen}
            pressed={locked}
            onClick={() => {
              setPanel({ locked: !locked });
              toast(locked ? "Canvas unlocked" : "Canvas locked — steps can be read, not moved");
            }}
          />
          <span aria-hidden className="mx-1 h-5 w-px bg-black/[0.08]" />
          <button type="button" onClick={saveNow} className={BTN}>
            <Save size={12} className="text-neutral-400" /> Save
          </button>
          <IconButton
            label="Revert to the saved workflow"
            Icon={RotateCcw}
            onClick={resetToSaved}
            disabled={draftAt == null}
          />
          <IconButton label="Download the workflow as JSON" Icon={Download} onClick={downloadJson} />
          <button
            type="button"
            onClick={() => onRun?.()}
            disabled={!onRun || busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors",
              !onRun || busy ? "cursor-not-allowed bg-neutral-300" : "bg-neutral-900 hover:bg-neutral-800"
            )}
          >
            <Play size={12} /> {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:h-[520px] md:flex-row">
        {/* One column for both rails: two of them would leave the pane too
            narrow to read a chain in. A grid, not a flex column, because the
            palette sizes itself for a flex ROW parent — as a grid item its
            own shrink rules are inert and the 1fr track can scroll it. */}
        {(rail || tools) && (
          <div
            className={cn(
              "grid min-h-0 md:w-[218px] md:shrink-0",
              rail && tools ? "md:grid-rows-[auto_minmax(0,1fr)]" : "md:grid-rows-[minmax(0,1fr)]"
            )}
          >
            {rail && (
              <WorkflowRail
                workflows={workflows ?? [workflow]}
                currentId={workflow.id}
                stacked={tools}
                onOpen={(id) => onOpen?.(id)}
              />
            )}
            {tools && (
              <McpPalette
                onAdd={(tool) => {
                  if (blocked()) return;
                  addTool(tool, centre());
                }}
              />
            )}
          </div>
        )}

        <div
          ref={pane}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            // A locked canvas says so with the cursor, before the drop happens.
            e.dataTransfer.dropEffect = locked
              ? "none"
              : e.dataTransfer.types.includes(DND_MCP_TOOL)
                ? "copy"
                : "move";
            if (!dropping) setDropping(true);
          }}
          onDragLeave={(e) => {
            // Crossing onto a child fires dragleave too — only the pane counts.
            const to = e.relatedTarget as Element | null;
            if (!to || !e.currentTarget.contains(to)) setDropping(false);
          }}
          className={cn(
            "relative h-[380px] min-w-0 bg-[#0e0f11] md:h-auto md:flex-1",
            dropping && (locked ? "ring-2 ring-inset ring-rose-500/50" : "ring-2 ring-inset ring-accent/50")
          )}
        >
          {locked && (
            <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2 py-1 text-[11px] font-medium text-white/70">
              <Lock size={11} /> Locked
            </span>
          )}

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-[14px] font-medium text-neutral-100">No steps yet</p>
              <p className="mt-1.5 max-w-[38ch] text-[13px] leading-relaxed text-white/50">
                Add a trigger to arm the chain, then a paid call for the work it should buy — or
                drag an MCP tool in from the left.
              </p>
            </div>
          )}
          <ReactFlow<StepNode>
            nodes={view}
            edges={wired}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDelete={onGraphDelete}
            onNodeClick={() => setPanel({ tab: "properties" })}
            onEdgeClick={() => setPanel({ tab: "properties" })}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineType={ConnectionLineType.SmoothStep}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            deleteKeyCode={locked ? null : ["Backspace", "Delete"]}
            fitView
            fitViewOptions={FIT}
            minZoom={0.4}
            maxZoom={1.6}
            // The canvas sits inside a scrolling page, so the wheel belongs to
            // the page and zoom belongs to the toolbar.
            zoomOnScroll={false}
            preventScrolling={false}
            className="rf-canvas"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(255,255,255,0.14)" />
            <MiniMap<StepNode>
              pannable
              zoomable
              ariaLabel="Workflow overview"
              maskColor="rgba(0,0,0,0.55)"
              bgColor="#141517"
              nodeStrokeWidth={0}
              nodeBorderRadius={3}
              nodeColor={(n) => {
                if (n.type !== "mcp") return STEP_KINDS[n.type].swatch;
                const tool = n.data.tool ? catalogue.get(n.data.tool) : undefined;
                return tool ? MCP_CATEGORIES[tool.category].swatch : STEP_KINDS.mcp.swatch;
              }}
              style={{ width: 148, height: 96 }}
            />
          </ReactFlow>
        </div>

        <Inspector
          tab={tab}
          onTab={(next) => setPanel({ tab: next })}
          workflow={workflow}
          node={selectedNode}
          edge={selectedEdge}
          nodes={nodes}
          catalogue={catalogue}
          locked={locked}
          runs={activity.runs}
          edits={activity.edits}
          onUpdate={updateStep}
          onDeleteStep={deleteStep}
          onDeleteLink={deleteLink}
          onSelect={select}
          onClear={clearCanvas}
          onRename={onRename ? rename : undefined}
          onDelete={onDelete ? () => setConfirmDelete(true) : undefined}
        />
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${workflow.name}?`}
        description="The workflow, its draft graph and its run and edit history are removed from this device. This cannot be undone."
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              onDelete?.();
            }}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-rose-700"
          >
            Delete workflow
          </button>
        </div>
      </Modal>
    </Sheet>
  );
}

/* ── inspector ─────────────────────────────────────────────────────────── */

type Tab = "properties" | "runs" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "properties", label: "Properties" },
  { id: "runs", label: "Runs" },
  { id: "history", label: "History" },
];

function Inspector({
  tab,
  onTab,
  workflow,
  node,
  edge,
  nodes,
  catalogue,
  locked,
  runs,
  edits,
  onUpdate,
  onDeleteStep,
  onDeleteLink,
  onSelect,
  onClear,
  onRename,
  onDelete,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  workflow: Workflow;
  node: StepNode | null;
  edge: Edge | null;
  nodes: StepNode[];
  catalogue: Map<string, McpTool>;
  locked: boolean;
  runs: WorkflowRun[];
  edits: WorkflowEdit[];
  onUpdate: (id: string, patch: Partial<StepData> & { kind?: StepKind }) => void;
  onDeleteStep: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onSelect: (id: string) => void;
  onClear: () => void;
  onRename?: (patch: { name?: string; summary?: string }) => void;
  onDelete?: () => void;
}) {
  const counts: Record<Tab, number | null> = { properties: null, runs: runs.length, history: edits.length };

  /** Arrow keys walk the tab strip, and focus follows so the roving tabindex
   *  never strands the keyboard on a tab that has left the tab order. */
  function onTabKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    onTab(next);
    document.getElementById(`wf-tab-${next}`)?.focus();
  }

  return (
    <aside className="flex min-h-0 flex-col border-t border-black/[0.07] md:w-[288px] md:shrink-0 md:border-l md:border-t-0">
      <div
        role="tablist"
        aria-label="Workflow inspector"
        onKeyDown={onTabKey}
        className="flex items-center gap-0.5 border-b border-black/[0.07] px-2 py-1.5"
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              id={`wf-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`wf-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onTab(t.id)}
              className={cn(
                "rounded-lg px-2 py-1 text-[12.5px] font-medium transition-colors",
                on ? "bg-black/[0.055] text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
              )}
            >
              {t.label}
              {count != null && count > 0 && (
                <span className="tnum ml-1.5 text-[11px] text-neutral-400">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id={`wf-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`wf-tab-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto p-3.5 md:overflow-y-auto"
      >
        {tab === "properties" && (
          <PropertiesPanel
            // Remounted per selection so the price field re-seeds from the step
            // it is now editing rather than holding the last one's text.
            key={node ? `${node.id}:${node.type}` : (edge?.id ?? "workflow")}
            workflow={workflow}
            node={node}
            edge={edge}
            nodes={nodes}
            catalogue={catalogue}
            locked={locked}
            onUpdate={onUpdate}
            onDeleteStep={onDeleteStep}
            onDeleteLink={onDeleteLink}
            onSelect={onSelect}
            onClear={onClear}
            onRename={onRename}
            onDelete={onDelete}
          />
        )}
        {tab === "runs" && <RunsPanel runs={runs} />}
        {tab === "history" && <HistoryPanel edits={edits} />}
      </div>
    </aside>
  );
}

function PropertiesPanel({
  workflow,
  node,
  edge,
  nodes,
  catalogue,
  locked,
  onUpdate,
  onDeleteStep,
  onDeleteLink,
  onSelect,
  onClear,
  onRename,
  onDelete,
}: {
  workflow: Workflow;
  node: StepNode | null;
  edge: Edge | null;
  nodes: StepNode[];
  catalogue: Map<string, McpTool>;
  locked: boolean;
  onUpdate: (id: string, patch: Partial<StepData> & { kind?: StepKind }) => void;
  onDeleteStep: (id: string) => void;
  onDeleteLink: (id: string) => void;
  onSelect: (id: string) => void;
  onClear: () => void;
  onRename?: (patch: { name?: string; summary?: string }) => void;
  onDelete?: () => void;
}) {
  const [price, setPrice] = useState(node?.data.price != null ? usd(node.data.price, 3) : "");
  const [err, setErr] = useState<string | null>(null);

  if (edge) {
    const from = nodes.find((n) => n.id === edge.source);
    const to = nodes.find((n) => n.id === edge.target);
    return (
      <>
        <h3 className="text-[13px] font-semibold text-neutral-900">Connection</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
          {from?.data.name ?? "—"}
          {edge.sourceHandle && <span className="text-neutral-400"> · {edge.sourceHandle}</span>}
          <span className="mx-1.5 text-neutral-300">→</span>
          {to?.data.name ?? "—"}
        </p>
        {locked ? (
          <p className="mt-4 text-[12.5px] leading-relaxed text-neutral-400">
            The canvas is locked, so connections cannot be removed.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => onDeleteLink(edge.id)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <Trash2 size={13} /> Delete connection
          </button>
        )}
      </>
    );
  }

  if (!node) {
    return (
      <>
        <label className="block">
          <span className="text-[12.5px] font-medium text-neutral-700">Workflow name</span>
          <input
            value={workflow.name}
            onChange={(e) => onRename?.({ name: e.target.value })}
            disabled={!onRename}
            className={cn(FIELD, "mt-1.5")}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[12.5px] font-medium text-neutral-700">Description</span>
          <textarea
            value={workflow.summary}
            onChange={(e) => onRename?.({ summary: e.target.value })}
            disabled={!onRename}
            rows={3}
            className={cn(FIELD, "mt-1.5 resize-y leading-relaxed")}
          />
        </label>

        <div className="mt-3 flex items-center gap-2">
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-neutral-700">Workflow id</div>
            <div className="truncate font-mono text-[11.5px] text-neutral-400">{workflow.id}</div>
          </div>
          <CopyButton text={workflow.id} what="the workflow id" className="ml-auto" />
        </div>

        <dl className="mt-3 space-y-1 border-t border-black/[0.06] pt-2.5 text-[12px]">
          {[
            ["Trigger", workflow.trigger],
            ["Steps", `${nodes.length}`],
            ["Cost / run", `${usd(workflow.costPerRun, 3)} USDC`],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="text-neutral-400">{k}</dt>
              <dd className="tnum ml-auto text-neutral-700">{v}</dd>
            </div>
          ))}
        </dl>

        <h4 className="mt-4 text-[12.5px] font-medium text-neutral-700">Steps</h4>
        {nodes.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-500">
            Nothing on the canvas yet. Add a step from the toolbar, or drag an MCP tool in from
            the palette.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-0.5">
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
        )}

        <div className="mt-5 flex flex-wrap gap-1.5 border-t border-black/[0.06] pt-3">
          <button
            type="button"
            onClick={onClear}
            disabled={locked || nodes.length === 0}
            className={BTN}
          >
            <Trash2 size={12} className="text-neutral-400" /> Clear canvas
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              <Trash2 size={12} /> Delete workflow
            </button>
          )}
        </div>
      </>
    );
  }

  const step = node;
  const k = STEP_KINDS[step.type];
  const tool = step.data.tool ? catalogue.get(step.data.tool) : undefined;
  // Nothing converts *into* an MCP step — those arrive from the palette with a
  // tool attached — but one that is already MCP can be converted away.
  const kinds = step.type === "mcp" ? [...KIND_ORDER, "mcp" as StepKind] : KIND_ORDER;

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

  /** Swapping the tool carries its price over, and its name too unless the step
   *  has been renamed by hand. */
  function commitTool(id: string) {
    const next = catalogue.get(id);
    if (!next) return;
    const renamed = !!tool && step.data.name !== tool.name;
    setPrice(next.price != null ? usd(next.price, 3) : "");
    onUpdate(step.id, { tool: id, price: next.price, name: renamed ? step.data.name : next.name });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", k.chip)}>
          <k.Icon size={13} />
        </span>
        <h3 className="text-[13px] font-semibold text-neutral-900">{step.type === "mcp" ? "MCP step" : "Step"}</h3>
      </div>

      {locked && (
        <p className="mt-2 text-[12px] leading-relaxed text-neutral-400">
          The canvas is locked. Unlock it from the toolbar to edit this step.
        </p>
      )}

      <label className="mt-4 block">
        <span className="text-[12.5px] font-medium text-neutral-700">Name</span>
        <input
          value={step.data.name}
          onChange={(e) => onUpdate(step.id, { name: e.target.value })}
          placeholder={k.blank}
          disabled={locked}
          className={cn(FIELD, "mt-1.5")}
        />
      </label>

      <label className="mt-3 block">
        <span className="text-[12.5px] font-medium text-neutral-700">Kind</span>
        <select
          value={step.type}
          onChange={(e) => onUpdate(step.id, { kind: e.target.value as StepKind })}
          disabled={locked}
          className={cn(FIELD, "mt-1.5")}
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {STEP_KINDS[kind].label}
            </option>
          ))}
        </select>
      </label>

      {step.type === "mcp" && (
        <>
          <label className="mt-3 block">
            <span className="text-[12.5px] font-medium text-neutral-700">Tool</span>
            <select
              value={tool?.id ?? ""}
              onChange={(e) => commitTool(e.target.value)}
              disabled={locked}
              className={cn(FIELD, "mt-1.5")}
            >
              {!tool && <option value="">{step.data.tool ?? "No tool"} — not attached</option>}
              {[...catalogue.values()].map((t) => (
                <option key={t.id} value={t.id}>
                  {MCP_CATEGORIES[t.category].label} · {t.name}
                </option>
              ))}
            </select>
          </label>

          {tool ? (
            <div className="mt-3">
              <p className="text-[12.5px] leading-relaxed text-neutral-500">{tool.description}</p>
              <p className="mt-1.5 font-mono text-[11.5px] text-neutral-400">{tool.id}</p>
              {tool.inputs.length > 0 ? (
                <dl className="mt-2.5 space-y-1 border-t border-black/[0.06] pt-2.5">
                  {tool.inputs.map((input) => (
                    <div key={input.name} className="flex items-baseline gap-2 text-[12px]">
                      <dt className="font-mono text-neutral-700">{input.name}</dt>
                      <dd className="ml-auto text-neutral-400">
                        {input.type}
                        {input.required ? " · required" : ""}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2.5 border-t border-black/[0.06] pt-2.5 text-[12px] text-neutral-400">
                  Takes no arguments.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[12.5px] leading-relaxed text-rose-600">
              The server this tool came from is no longer attached. Pick another tool, or
              reconnect it from the palette.
            </p>
          )}
        </>
      )}

      {(step.type === "call" || step.type === "mcp") && (
        <label className="mt-3 block">
          <span className="text-[12.5px] font-medium text-neutral-700">Price (USDC)</span>
          <input
            value={price}
            onChange={(e) => commitPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0.000"
            disabled={locked}
            className={cn(FIELD, "tnum mt-1.5")}
          />
          {err ? (
            <span className="mt-1.5 block text-[12px] text-rose-600">{err}</span>
          ) : (
            <span className="mt-1.5 block text-[12px] leading-relaxed text-neutral-400">
              {step.type === "mcp"
                ? "What this tool charges per call. Free tools leave it at zero."
                : "Charged per run, quoted back to the caller as HTTP 402."}
            </span>
          )}
        </label>
      )}

      {!locked && (
        <button
          type="button"
          onClick={() => onDeleteStep(step.id)}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          <Trash2 size={13} /> Delete step
        </button>
      )}
    </>
  );
}
