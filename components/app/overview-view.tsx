"use client";

import { useState } from "react";
import { ArrowUpRight, Check, CornerDownLeft, Paperclip, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  AGENTS, ENDPOINTS, RUNS, WORKFLOWS, callsThisMonth, compact, settledThisMonth, usd,
} from "@/lib/app-data";
import type { View } from "./sidebar";
import { Metric, PageHead, Sheet, StatusPill } from "./bits";

const PROMPTS = [
  "Price my summariser at 0.01 USDC and list it",
  "Top up collateral when health drops below 1.4",
  "Post a job to label 5,000 wallet addresses",
];

const OUTCOME = {
  ok: { dot: "bg-emerald-500", label: "ok" },
  retried: { dot: "bg-amber-500", label: "retried" },
  failed: { dot: "bg-rose-500", label: "failed" },
} as const;

export function OverviewView({ onGo }: { onGo: (v: View) => void }) {
  const [prompt, setPrompt] = useState("");
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const live = ENDPOINTS.filter((e) => e.status === "live").length;
  const armed = WORKFLOWS.filter((w) => w.status === "live").length;
  const working = AGENTS.filter((a) => a.status === "working" || a.status === "bidding").length;

  function submit() {
    if (!prompt.trim()) return;
    setSent(true);
    toast("Composer is not wired to a model yet — this is the shape of the flow", "default");
    setTimeout(() => setSent(false), 1600);
    setPrompt("");
  }

  return (
    <>
      <PageHead title="Overview" subtitle="What is earning, what is armed, and what ran recently." />

      {/* composer */}
      <Sheet>
        <div className="bg-[radial-gradient(120%_120%_at_50%_0%,#fff7f1_0%,#ffffff_58%)] px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-[620px] text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-2.5 py-1 text-[11.5px] text-neutral-600 shadow-sm">
              <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-white">NEW</span>
              Pay-per-request, settled in USDC
            </span>
            <h2 className="mt-4 text-[21px] font-semibold tracking-[-0.02em] text-neutral-900 sm:text-[24px]">
              Ship a paid{" "}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 align-middle text-[18px] shadow-sm ring-1 ring-black/[0.06] sm:text-[20px]">
                <Sparkles size={15} className="text-accent" /> endpoint
              </span>{" "}
              in one click
            </h2>

            <div className="mx-auto mt-6 rounded-2xl bg-white p-3 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.07]">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                rows={2}
                placeholder="Describe the workflow — triggers, conditions, price per call…"
                className="w-full resize-none bg-transparent px-1.5 py-1 text-left text-[13.5px] leading-relaxed outline-none placeholder:text-neutral-400"
              />
              <div className="mt-1.5 flex items-center gap-2 px-1">
                <button type="button" aria-label="Attach a file" onClick={() => toast("Attachments land with the first real deploy")} className="rounded-md p-1 text-neutral-400 transition-colors hover:text-neutral-700">
                  <Paperclip size={14} />
                </button>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11.5px] font-medium text-neutral-600">
                  <Sparkles size={11} className="text-accent" /> x402
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!prompt.trim()}
                  aria-label="Send"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-all",
                    prompt.trim() ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-neutral-200 text-neutral-400"
                  )}
                >
                  {sent ? <Check size={13} /> : <CornerDownLeft size={13} />}
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="rounded-full border border-black/[0.08] bg-white/70 px-2.5 py-1 text-[12px] text-neutral-600 transition-colors hover:border-black/20 hover:text-neutral-900"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>

      {/* the four figures that describe the account */}
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-black/[0.07] sm:grid-cols-4">
        {[
          { label: "Settled this month", value: usd(settledThisMonth), unit: "USDC", hint: `${compact(callsThisMonth)} paid calls` },
          { label: "Endpoints live", value: String(live), hint: `${ENDPOINTS.length} total` },
          { label: "Workflows armed", value: String(armed), hint: `${WORKFLOWS.length} total` },
          { label: "Agents active", value: String(working), hint: `${AGENTS.length} on the market` },
        ].map((m) => (
          <div key={m.label} className="bg-white px-4 py-4">
            <Metric label={m.label} value={m.value} unit={m.unit} hint={m.hint} />
          </div>
        ))}
      </div>

      {/* recent activity */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900">Recent activity</h2>
          <button type="button" onClick={() => onGo("endpoints")} className="inline-flex items-center gap-1 text-[12.5px] text-neutral-500 transition-colors hover:text-neutral-900">
            All endpoints <ArrowUpRight size={13} />
          </button>
        </div>
        <Sheet>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-[13.5px]">
              <thead className="border-b border-black/[0.07] text-[12px] text-neutral-400">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Request</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Target</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Outcome</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Cost</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Latency</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Settled</th>
                </tr>
              </thead>
              <tbody>
                {RUNS.map((r) => (
                  <tr key={r.id} className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.02]">
                    <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500">{r.id}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-neutral-900">{r.target}</span>
                      <span className="ml-2 rounded bg-black/[0.04] px-1.5 py-px text-[11px] text-neutral-500">{r.kind}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-600">
                        <span className={cn("h-1.5 w-1.5 rounded-full", OUTCOME[r.outcome].dot)} />
                        {OUTCOME[r.outcome].label}
                      </span>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{r.cost ? usd(r.cost, 3) : "—"}</td>
                    <td className="tnum px-3 py-2.5 text-right text-neutral-600">
                      {r.ms >= 1000 ? `${(r.ms / 1000).toFixed(1)}s` : `${r.ms}ms`}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.tx ? (
                        <a
                          href={`https://allo.info/tx/${r.tx}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[12px] text-neutral-500 underline underline-offset-2 transition-colors hover:text-accent"
                        >
                          {r.tx.slice(0, 6)}…
                        </a>
                      ) : (
                        <span className="text-[12px] text-neutral-300">not charged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
        <p className="mt-2.5 text-[12px] text-neutral-400">
          A failed call is never charged — the caller keeps their USDC and the row settles to nothing.
        </p>
      </div>
    </>
  );
}
