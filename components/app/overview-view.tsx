"use client";

import { useState } from "react";
import { ArrowUpRight, CornerDownLeft, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_ORIGIN, ago, shortAddr, useWorkspace } from "@/lib/real-data";
import type { View } from "./sidebar";
import { EmptyState, Metric, PageHead, Sheet } from "./bits";
import { networkLabel, txUrl } from "@/lib/explorer";

const PROMPTS = [
  "Price my summariser at 0.01 USDC and list it",
  "Top up collateral when health drops below 1.4",
  "Post a job to label 5,000 wallet addresses",
];

const usd = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function OverviewView({ onGo, onAsk }: { onGo: (v: View) => void; onAsk: (t: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const { data, status, error } = useWorkspace();
  // The chain these figures were actually read from. Naming a network the app
  // is not reading turns every "verify" link into a 404 on a real transaction.
  const net = networkLabel(data?.chain.network ?? "testnet");

  function submit() {
    if (!prompt.trim()) return;
    onAsk(prompt.trim());
    setPrompt("");
  }

  return (
    <>
      <PageHead
        title="Overview"
        subtitle={`Read live from Algorand ${net} and from your deployed agent's own manifest.`}
      />

      {/* composer */}
      <Sheet>
        <div className="bg-[radial-gradient(120%_120%_at_50%_0%,#fff7f1_0%,#ffffff_58%)] px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-[620px] text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-2.5 py-1 text-[11.5px] text-neutral-600 shadow-sm">
              <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-white">LIVE</span>
              {data?.manifest ? `${data.manifest.handle} is serving` : "Pay-per-request, settled in USDC"}
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
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11.5px] font-medium text-neutral-600">
                  <Sparkles size={11} className="text-accent" /> x402
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!prompt.trim()}
                  aria-label="Ask in Chat"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-all",
                    prompt.trim() ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-neutral-200 text-neutral-400"
                  )}
                >
                  <CornerDownLeft size={13} />
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

      {/* Real figures. `You have earned` stays at zero until somebody actually
          pays — inventing a number here is precisely what we refuse to do. */}
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-black/[0.07] sm:grid-cols-4">
        {[
          {
            label: "You have earned",
            value: data ? usd(data.mine.earnedUsdc) : "—",
            unit: "USDC",
            hint: data ? `${data.mine.calls} paid calls to your address` : "reading the chain…",
          },
          {
            label: "Your endpoints live",
            value: data ? String(data.endpoints.length) : "—",
            hint: data?.manifest ? data.manifest.handle : "no manifest yet",
          },
          {
            label: "Network settlements",
            value: data ? String(data.runs.length) : "—",
            hint: "recent x402 payments, all agents",
          },
          {
            label: `${net} round`,
            value: data?.chain.round ? data.chain.round.toLocaleString("en-US") : "—",
            hint: data?.chain.blockTime ? `${data.chain.blockTime.toFixed(1)}s between blocks` : "measuring…",
          },
        ].map((m) => (
          <div key={m.label} className="bg-white px-4 py-4">
            <Metric label={m.label} value={m.value} unit={m.unit} hint={m.hint} />
          </div>
        ))}
      </div>

      {status === "error" && (
        <p className="mt-3 text-[12.5px] text-rose-600">
          Could not read the chain{error ? ` (${error})` : ""}. Nothing here is cached, so the
          figures stop rather than drift.
        </p>
      )}

      {/* real settlements, network-wide */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900">
            Live x402 settlements
          </h2>
          <a
            href="https://explorer.ripar.io/live"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] text-neutral-500 transition-colors hover:text-neutral-900"
          >
            Open the explorer <ArrowUpRight size={13} />
          </a>
        </div>

        <Sheet>
          {status === "loading" ? (
            <p className="px-4 py-10 text-center text-[13px] text-neutral-400">reading the chain…</p>
          ) : !data?.runs.length ? (
            <EmptyState
              title="No settlements in the current window"
              body="This is a young protocol and quiet stretches are normal. Rows appear here when payments actually happen — none are invented to fill the gap."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13.5px]">
                <thead className="border-b border-black/[0.07] text-[12px] text-neutral-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Amount</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Payer</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Paid to</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Round</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">When</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.slice(0, 12).map((r) => (
                    <tr key={r.id} className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.02]">
                      <td className="tnum px-3 py-2.5 font-medium">{usd(r.amountUsdc, 3)} USDC</td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500">{shortAddr(r.from)}</td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500">
                        {shortAddr(r.to)}
                        {data.manifest && r.to === data.manifest.payTo && (
                          <span className="ml-2 rounded bg-orange-50 px-1.5 py-px text-[10.5px] font-semibold text-accent">
                            you
                          </span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-neutral-600">
                        {r.round.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2.5 text-right text-neutral-500">{ago(r.when)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <a
                          href={txUrl(r.id, data?.chain.network ?? "testnet")}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 font-mono text-[12px] text-neutral-500 hover:text-accent"
                        >
                          verify <ExternalLink size={10} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Sheet>

        <p className="mt-2.5 text-[12px] text-neutral-400">
          {`Read from Algorand ${net} via the public indexer.`} Your own agent is{" "}
          <a href={AGENT_ORIGIN} target="_blank" rel="noreferrer" className="underline hover:text-neutral-700">
            {AGENT_ORIGIN.replace("https://", "")}
          </a>
          .
        </p>
      </div>
    </>
  );
}
