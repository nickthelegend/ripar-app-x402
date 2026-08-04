"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDownToLine, Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENDPOINTS } from "@/lib/app-data";
import { CEILING, LEVEL_TONE, LOG_LEVELS, logStream, stamp, type LogLevel } from "@/lib/logs";
import { EmptyState, PageHead, SearchInput, Segmented, Sheet, SortHeader } from "./bits";

type Scope = "all" | LogLevel;

export function LogsView() {
  // The stream owns the buffer — see lib/logs.ts. Until it has attached the
  // snapshot is null, which is the view's loading state.
  const lines = useSyncExternalStore(logStream.subscribe, logStream.snapshot, logStream.serverSnapshot);
  const live = useSyncExternalStore(logStream.subscribe, logStream.isLive, () => true);
  const [level, setLevel] = useState<Scope>("all");
  const [slug, setSlug] = useState("all");
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [follow, setFollow] = useState(true);
  const pane = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const base: Record<Scope, number> = { all: 0, debug: 0, info: 0, warn: 0, error: 0 };
    for (const l of lines ?? []) {
      if (slug !== "all" && l.slug !== slug) continue;
      base.all++;
      base[l.level]++;
    }
    return base;
  }, [lines, slug]);

  const rows = useMemo(() => {
    if (!lines) return [];
    const term = q.trim().toLowerCase();
    const found = lines.filter(
      (l) =>
        (slug === "all" || l.slug === slug) &&
        (level === "all" || l.level === level) &&
        (!term || `${l.slug} ${l.message} ${l.level}`.toLowerCase().includes(term))
    );
    return dir === "asc" ? found : [...found].reverse();
  }, [lines, level, slug, q, dir]);

  // "Follow" means stick to the newest end, whichever end the sort put it at.
  useEffect(() => {
    const el = pane.current;
    if (!el || !follow) return;
    el.scrollTop = dir === "asc" ? el.scrollHeight : 0;
  }, [rows, follow, dir]);

  function onScroll() {
    const el = pane.current;
    if (!el) return;
    const atNewest =
      dir === "asc" ? el.scrollHeight - el.scrollTop - el.clientHeight < 24 : el.scrollTop < 24;
    setFollow(atNewest);
  }

  function jumpToLatest() {
    const el = pane.current;
    if (el) el.scrollTop = dir === "asc" ? el.scrollHeight : 0;
    setFollow(true);
  }

  return (
    <>
      <PageHead
        title="Logs"
        subtitle="Every quote, payment check and settlement each endpoint writes, newest as they arrive. Paused and draft endpoints write nothing, so they are not listed."
        actions={
          <button
            type="button"
            onClick={() => logStream.setLive(!live)}
            aria-pressed={live}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20"
          >
            {live ? <Pause size={13} /> : <Play size={13} />}
            {live ? "Pause stream" : "Resume stream"}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: "all" as Scope, label: "All", count: counts.all },
            ...LOG_LEVELS.map((l) => ({ value: l as Scope, label: LEVEL_TONE[l].label[0] + LEVEL_TONE[l].label.slice(1).toLowerCase(), count: counts[l] })),
          ]}
        />
        <label className="flex items-center gap-2">
          <span className="sr-only">Filter by endpoint</span>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[12.5px] text-neutral-700 outline-none transition-colors focus:border-neutral-400"
          >
            <option value="all">All endpoints</option>
            {ENDPOINTS.map((e) => (
              <option key={e.id} value={e.slug}>/{e.slug}</option>
            ))}
          </select>
        </label>
        <SearchInput value={q} onChange={setQ} placeholder="Search log lines…" className="w-full sm:w-[260px]" />
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px]">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              live ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-neutral-400"
            )}
          />
          <span className={live ? "text-emerald-700" : "text-neutral-500"}>{live ? "Streaming" : "Paused"}</span>
          <span className="tnum text-neutral-400">· {rows.length} shown</span>
        </span>
      </div>

      <div className="relative">
        <Sheet>
          <div ref={pane} onScroll={onScroll} className="h-[460px] overflow-auto">
            <table className="w-full min-w-[640px] table-fixed text-[13px]">
              <colgroup>
                <col className="w-[108px]" />
                <col className="w-[92px]" />
                <col className="w-[190px]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-white text-[12px] shadow-[0_1px_0_rgba(0,0,0,0.07)]">
                <tr>
                  <SortHeader
                    label="Time"
                    field="at"
                    sort={{ field: "at" as const, dir }}
                    onSort={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
                  />
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Level</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Endpoint</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-400">Message</th>
                </tr>
              </thead>
              <tbody>
                {lines === null ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-20 text-center">
                      <span className="inline-flex items-center gap-2 text-[13px] text-neutral-500">
                        <Loader2 size={14} className="animate-spin text-neutral-400" />
                        Attaching to the log stream…
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8">
                      <EmptyState
                        title="No lines match"
                        body={
                          q
                            ? `Nothing in the last ${lines.length} lines matches “${q}”.`
                            : slug !== "all"
                              ? "This endpoint has written nothing at that level. Paused and draft endpoints take no traffic at all."
                              : "Nothing at that level yet — the stream is still running."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((l) => {
                    const tone = LEVEL_TONE[l.level];
                    return (
                      <tr key={l.id} className="border-b border-black/[0.04] align-top last:border-0 hover:bg-black/[0.02]">
                        <td className="tnum px-3 py-1.5 font-mono text-[11.5px] text-neutral-400">{stamp(l.at)}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold", tone.text)}>
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
                            {tone.label}
                          </span>
                        </td>
                        <td className="truncate px-3 py-1.5 font-mono text-[11.5px] text-neutral-500">/{l.slug}</td>
                        <td className="px-3 py-1.5 font-mono text-[11.5px] leading-relaxed text-neutral-700">{l.message}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Sheet>

        {!follow && rows.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg transition-colors hover:bg-neutral-800"
          >
            <ArrowDownToLine size={12} /> Jump to latest
          </button>
        )}
      </div>

      <p className="mt-2.5 text-[12px] text-neutral-400">
        Lines are generated in this browser for the preview and are capped at the most recent {CEILING}.
        Nothing here is fetched from a server.
      </p>
    </>
  );
}
