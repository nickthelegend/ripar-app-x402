"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  FolderTree,
  GitPullRequest,
  Globe,
  Hash,
  Plug,
  Search,
  Sparkles,
  Triangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/app-data";
import {
  DND_MCP_TOOL,
  MCP_CATEGORIES,
  MCP_CATEGORY_ORDER,
  MCP_TOOLS,
  type McpCategory,
  type McpTool,
} from "@/lib/mcp-tools";
import { useMcpServers } from "@/lib/mcp-servers";
import { McpConnectModal } from "./mcp-connect";

/** Lucide carries no brand marks, so each category gets the closest shape. */
export const MCP_CATEGORY_ICON: Record<McpCategory, typeof Globe> = {
  filesystem: FolderTree,
  http: Globe,
  github: GitPullRequest,
  slack: Hash,
  postgres: Database,
  search: Search,
  llm: Sparkles,
  algorand: Triangle,
};

type Group = { key: string; label: string; hint: string; attached: boolean; tools: McpTool[] };

const optionId = (toolId: string) => `mcp-opt-${toolId.replace(/[^a-z0-9]+/gi, "-")}`;

/** The palette hands a tool over two ways, and both end at the same call. */
export function McpPalette({ onAdd }: { onAdd: (tool: McpTool) => void }) {
  const servers = useMcpServers();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [connect, setConnect] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo<Group[]>(() => {
    const term = q.trim().toLowerCase();
    const matches = (t: McpTool) =>
      !term || `${t.name} ${t.id} ${t.description} ${MCP_CATEGORIES[t.category].label}`.toLowerCase().includes(term);

    const built = MCP_CATEGORY_ORDER.map((c) => ({
      key: c,
      label: MCP_CATEGORIES[c].label,
      hint: MCP_CATEGORIES[c].blurb,
      attached: false,
      tools: MCP_TOOLS.filter((t) => t.category === c && matches(t)),
    }));
    // Attached servers sit below the built-ins, in the order they were added.
    const remote = servers.map((s) => ({
      key: `srv:${s.id}`,
      label: s.label,
      hint: s.url,
      attached: true,
      tools: s.tools.filter((t) => s.enabled.includes(t.id) && matches(t)),
    }));
    return [...built, ...remote].filter((g) => g.tools.length > 0);
  }, [q, servers]);

  // Arrow keys walk the list as it reads, so the flat order is the drawn order.
  const flat = useMemo(() => groups.flatMap((g) => g.tools), [groups]);
  const index = useMemo(() => new Map(flat.map((t, i) => [t.id, i])), [flat]);
  // A shrinking filter must not strand the highlight past the end of the list.
  const at = Math.min(sel, flat.length - 1);
  const active = flat[at];

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel, q]);

  const total = MCP_TOOLS.length + servers.reduce((sum, s) => sum + s.enabled.length, 0);

  return (
    <aside className="flex min-h-0 flex-col border-b border-black/[0.07] bg-white md:w-[218px] md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-3 pt-3">
        <h3 className="text-[12.5px] font-semibold text-neutral-900">MCP tools</h3>
        <span className="tnum text-[11.5px] text-neutral-400">{total}</span>
        <button
          type="button"
          onClick={() => setConnect(true)}
          aria-label="Connect an MCP server"
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-black/10 px-1.5 py-1 text-[11.5px] font-medium text-neutral-600 transition-colors hover:border-black/20 hover:text-neutral-900"
        >
          <Plug size={11} /> Connect
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="mcp-tool-list"
            aria-activedescendant={active ? optionId(active.id) : undefined}
            aria-label="Search MCP tools"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel(Math.min(at + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(at - 1, 0));
              } else if (e.key === "Home") {
                e.preventDefault();
                setSel(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setSel(flat.length - 1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (active) onAdd(active);
              } else if (e.key === "Escape" && q) {
                e.preventDefault();
                setQ("");
                setSel(0);
              }
            }}
            placeholder="Search tools…"
            className="w-full rounded-lg border border-black/10 bg-white py-1.5 pl-7 pr-7 text-[12.5px] outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setSel(0);
              }}
              aria-label="Clear tool search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 transition-colors hover:text-neutral-900"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div
        ref={listRef}
        id="mcp-tool-list"
        role="listbox"
        aria-label="MCP tools"
        className="max-h-[240px] min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 md:max-h-none"
      >
        {flat.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <p className="text-[12.5px] font-medium text-neutral-700">No tool matches</p>
            <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
              Nothing in the library answers to &ldquo;{q}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => {
                setQ("");
                setSel(0);
              }}
              className="mt-3 rounded-lg border border-black/10 px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition-colors hover:border-black/20"
            >
              Clear search
            </button>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label} className="pt-1.5 first:pt-0.5">
              <div className="flex items-baseline gap-1.5 px-2 py-1" title={g.hint}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400">
                  {g.label}
                </span>
                {g.attached && <span className="text-[10.5px] text-emerald-700">attached</span>}
                <span className="tnum ml-auto text-[10.5px] text-neutral-300">{g.tools.length}</span>
              </div>
              {g.tools.map((t) => {
                const i = index.get(t.id) ?? -1;
                const on = i === at;
                const Icon = MCP_CATEGORY_ICON[t.category];
                return (
                  <div
                    key={t.id}
                    id={optionId(t.id)}
                    role="option"
                    aria-selected={on}
                    data-active={on}
                    title={`${t.description}${t.price ? ` · ${usd(t.price, 3)} USDC per call` : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_MCP_TOOL, t.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => onAdd(t)}
                    className={cn(
                      "flex cursor-grab items-center gap-1.5 rounded-lg px-2 py-[5px] transition-colors active:cursor-grabbing",
                      on ? "bg-orange-50" : "hover:bg-black/[0.03]"
                    )}
                  >
                    <Icon size={12} className="shrink-0 text-neutral-400" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-700">{t.name}</span>
                    {t.price ? (
                      <span className="tnum shrink-0 text-[10.5px] text-accent">{usd(t.price, 3)}</span>
                    ) : (
                      <span className="shrink-0 text-[10.5px] text-neutral-300">free</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <p className="border-t border-black/[0.07] px-3 py-2 text-[11px] leading-relaxed text-neutral-400">
        Drag a tool onto the canvas, or use ↑↓ and press Enter to drop it in the centre.
      </p>

      <McpConnectModal open={connect} onClose={() => setConnect(false)} />
    </aside>
  );
}
