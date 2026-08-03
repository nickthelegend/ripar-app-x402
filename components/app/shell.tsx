"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu as MenuIcon, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { AGENTS, ENDPOINTS, WORKFLOWS } from "@/lib/app-data";
import { NAV, Sidebar, type View } from "./sidebar";
import { OverviewView } from "./overview-view";
import { ChatView, type Turn } from "./chat-view";
import { EndpointsView } from "./endpoints-view";
import { WorkflowsView } from "./workflows-view";
import { AgentsView } from "./agents-view";

export function AppShell() {
  const [view, setView] = useState<View>("overview");
  // Held here so the conversation survives leaving Chat and coming back.
  const [turns, setTurns] = useState<Turn[]>([]);
  const [nav, setNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  // A sentence typed into the Overview composer opens Chat with it already in
  // the box. Leaving Chat drops it so it can't reappear on a later visit.
  const [seed, setSeed] = useState("");
  const { toast } = useToast();

  const go = useCallback((v: View) => {
    setView(v);
    setNav(false);
    if (v !== "chat") setSeed("");
  }, []);

  const ask = useCallback((text: string) => {
    setSeed(text);
    setView("chat");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh bg-[#fafafa]">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-[228px] shrink-0 border-r border-black/[0.07] bg-white lg:block">
        <Sidebar view={view} onSelect={go} onSearch={() => setPalette(true)} onWithdraw={() => setWithdraw(true)} onSettings={() => toast("Settings land with real accounts")} />
      </aside>

      {/* mobile drawer */}
      {nav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-neutral-900/25 backdrop-blur-sm" onClick={() => setNav(false)} />
          <div className="absolute inset-y-0 left-0 w-[248px] border-r border-black/10 bg-white">
            <Sidebar view={view} onSelect={go} onSearch={() => { setNav(false); setPalette(true); }} onWithdraw={() => { setNav(false); setWithdraw(true); }} onSettings={() => toast("Settings land with real accounts")} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-black/[0.07] bg-white px-4 py-2.5 lg:hidden">
          <button type="button" onClick={() => setNav((v) => !v)} aria-label="Toggle navigation" className="rounded-md p-1.5 text-neutral-600">
            {nav ? <X size={18} /> : <MenuIcon size={18} />}
          </button>
          <span className="text-[14px] font-semibold capitalize">{view}</span>
        </div>

        <main className="mx-auto max-w-[1120px] px-5 py-7 sm:px-8">
          {view === "overview" && <OverviewView onGo={go} onAsk={ask} />}
          {view === "chat" && <ChatView seed={seed} turns={turns} setTurns={setTurns} />}
          {view === "endpoints" && <EndpointsView />}
          {view === "workflows" && <WorkflowsView />}
          {view === "agents" && <AgentsView />}
        </main>
      </div>

      {palette && <Palette onClose={() => setPalette(false)} onGo={go} />}

      <Modal open={withdraw} onClose={() => setWithdraw(false)} title="Withdraw to wallet" description="Settlement already lands in your own Algorand address — Ripar never holds the balance.">
        <p className="text-[13.5px] leading-relaxed text-neutral-600">
          There is nothing to withdraw from Ripar. Each paid call settles directly from the
          caller to <span className="font-mono text-[12.5px]">PERA…K7QX</span>, so the funds are
          already yours. This button exists to say so.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => setWithdraw(false)} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800">
            Got it
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** ⌘K across every surface, its entries built from the real data. Mounted only
 *  while it is open, so closing it drops the query and the highlight without an
 *  effect having to reach back in and reset them. */
function Palette({ onClose, onGo }: { onClose: () => void; onGo: (v: View) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const entries = [
    // Driven off NAV so a new surface reaches the palette by being navigable.
    ...NAV.map((n) => ({ label: n.label, hint: "Go to", run: () => onGo(n.id) })),
    ...ENDPOINTS.map((e) => ({ label: e.name, hint: `Endpoint · /${e.slug}`, run: () => onGo("endpoints") })),
    ...WORKFLOWS.map((w) => ({ label: w.name, hint: "Workflow", run: () => onGo("workflows") })),
    ...AGENTS.map((a) => ({ label: a.name, hint: `Agent · @${a.handle}`, run: () => onGo("agents") })),
  ];
  const term = q.trim().toLowerCase();
  const results = (term ? entries.filter((e) => `${e.label} ${e.hint}`.toLowerCase().includes(term)) : entries).slice(0, 9);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-neutral-900/25 px-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && results[sel]) { results[sel].run(); onClose(); }
          }}
          placeholder="Jump to anything…"
          className="w-full border-b border-black/[0.07] px-4 py-3.5 text-[14px] outline-none placeholder:text-neutral-400"
        />
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-neutral-400">No matches</li>}
          {results.map((r, i) => (
            <li key={`${r.label}-${i}`}>
              <button
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => { r.run(); onClose(); }}
                className={cn("flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left transition-colors", i === sel ? "bg-orange-50" : "hover:bg-black/[0.03]")}
              >
                <span className="text-[13.5px] font-medium text-neutral-900">{r.label}</span>
                <span className="ml-auto truncate text-[12px] text-neutral-400">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
