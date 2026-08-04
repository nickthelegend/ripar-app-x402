// Per-workflow graph drafts. The builder is a canvas you leave mid-thought, so
// the edited graph — positions included — outlives a reload. Only the draft is
// stored; the workflow itself still comes from the server copy, which is what
// "reset to saved" goes back to.

import { STEP_KIND_IDS, type StepKind } from "./app-data";

export type GraphNode = {
  id: string;
  kind: StepKind;
  x: number;
  y: number;
  name: string;
  price?: number;
  /** Set only on an MCP step: which catalogue tool it runs. */
  tool?: string;
};

export type GraphEdge = { id: string; source: string; target: string; sourceHandle?: string };

export type WorkflowGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** `at` is when the draft was written, shown next to the reset affordance. */
export type SavedGraph = WorkflowGraph & { at: number };

const VERSION = 1;
const key = (workflowId: string) => `ripar-wf-graph:${workflowId}`;
const KINDS = new Set<string>(STEP_KIND_IDS);

function isNode(v: unknown): v is GraphNode {
  const n = v as GraphNode | null;
  return (
    !!n &&
    typeof n.id === "string" &&
    typeof n.name === "string" &&
    typeof n.kind === "string" &&
    KINDS.has(n.kind) &&
    Number.isFinite(n.x) &&
    Number.isFinite(n.y)
  );
}

function isEdge(v: unknown): v is GraphEdge {
  const e = v as GraphEdge | null;
  return !!e && typeof e.id === "string" && typeof e.source === "string" && typeof e.target === "string";
}

/** Returns null for anything it does not fully recognise — a bad draft is
 *  dropped rather than half-restored on top of the real workflow. */
export function loadGraph(workflowId: string): SavedGraph | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(workflowId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; at?: number; nodes?: unknown; edges?: unknown };
    if (parsed.version !== VERSION || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;

    const nodes = parsed.nodes.filter(isNode);
    if (nodes.length !== parsed.nodes.length) return null;
    const ids = new Set(nodes.map((n) => n.id));
    // An edge to a node that is gone would render as a dangling arrow.
    const edges = parsed.edges.filter(isEdge).filter((e) => ids.has(e.source) && ids.has(e.target));

    return { nodes, edges, at: typeof parsed.at === "number" ? parsed.at : Date.now() };
  } catch {
    return null;
  }
}

/** Returns the write time so the caller can label the draft, or null if the
 *  browser refused to store it. */
export function saveGraph(workflowId: string, graph: WorkflowGraph): number | null {
  if (typeof window === "undefined") return null;
  const at = Date.now();
  try {
    localStorage.setItem(key(workflowId), JSON.stringify({ version: VERSION, at, ...graph }));
    return at;
  } catch {
    return null;
  }
}

export function clearGraph(workflowId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(workflowId));
  } catch {
    /* nothing to undo — the draft simply stays */
  }
}

/** Node ids are `s<n>`; a restored graph must not hand out an id it already used. */
export function nextSeq(nodes: { id: string }[]): number {
  return nodes.reduce((max, n) => {
    const m = /^s(\d+)$/.exec(n.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}
