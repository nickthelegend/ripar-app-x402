"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Rocket } from "lucide-react";
import { SlideOver } from "@/components/ui/slide-over";
import { AGENT_ORIGIN, useWorkspace, type RealEndpoint } from "@/lib/real-data";
import { EmptyState, Metric, PageHead, Sheet, StatusPill } from "./bits";
import { DeployModal } from "./deploy-modal";
import { TestConsole } from "./test-console";

const usd = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Endpoints come from the deployed agent's own `/.well-known/ripar.json`, so
 * this table cannot drift from what is actually serving: if the agent changes
 * its price, this changes with it.
 */
export function EndpointsView() {
  const { data, status, error } = useWorkspace();
  const [open, setOpen] = useState<RealEndpoint | null>(null);
  const [deploying, setDeploying] = useState<RealEndpoint | null>(null);
  const [testing, setTesting] = useState<RealEndpoint | null>(null);

  const endpoints = data?.endpoints ?? [];

  return (
    <>
      <PageHead
        title="Endpoints"
        subtitle={
          data?.manifest
            ? `Read live from ${data.manifest.handle}'s published manifest. An unpaid call to any of these returns a real 402 carrying a USDC quote.`
            : "Read live from your deployed agent's published manifest."
        }
        actions={
          <a
            href={`${AGENT_ORIGIN}/.well-known/ripar.json`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-black/20"
          >
            View manifest <ExternalLink size={13} />
          </a>
        }
      />

      {status === "loading" ? (
        <Sheet>
          <p className="px-4 py-12 text-center text-[13px] text-neutral-400">
            reading {AGENT_ORIGIN.replace("https://", "")}…
          </p>
        </Sheet>
      ) : !data?.manifest ? (
        <EmptyState
          title="No agent reachable"
          body={`Could not read a manifest from ${AGENT_ORIGIN}${error ? ` (${error})` : ""}. Deploy an agent with the Ripar SDK and this fills in from its own manifest — nothing is listed here that is not actually serving.`}
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-black/[0.07] sm:grid-cols-4">
            <div className="bg-white px-4 py-4">
              <Metric label="Agent" value={data.manifest.handle} hint={AGENT_ORIGIN.replace("https://", "")} />
            </div>
            <div className="bg-white px-4 py-4">
              <Metric label="Endpoints live" value={String(endpoints.length)} />
            </div>
            <div className="bg-white px-4 py-4">
              <Metric label="Paid calls received" value={String(data.mine.calls)} hint="to your payout address" />
            </div>
            <div className="bg-white px-4 py-4">
              <Metric label="Earned" value={usd(data.mine.earnedUsdc)} unit="USDC" />
            </div>
          </div>

          <Sheet>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13.5px]">
                <thead className="border-b border-black/[0.07] text-[12px] text-neutral-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Endpoint</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Method</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Paid calls</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((e) => (
                    <tr
                      key={e.name}
                      onClick={() => setOpen(e)}
                      className="cursor-pointer border-b border-black/[0.05] last:border-0 hover:bg-black/[0.02]"
                    >
                      <td className="px-3 py-2.5">
                        <span className="block font-medium text-neutral-900">{e.name}</span>
                        <span className="block truncate font-mono text-[11.5px] text-neutral-400">
                          {e.url.replace(AGENT_ORIGIN, "")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><StatusPill status="live" /></td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-neutral-500">{e.method}</td>
                      <td className="tnum px-3 py-2.5 text-right">{e.price}</td>
                      <td className="tnum px-3 py-2.5 text-right text-neutral-600">{e.calls}</td>
                      <td className="tnum px-3 py-2.5 text-right font-medium">{usd(e.earnedUsdc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sheet>

          {data.mine.calls === 0 && (
            <p className="mt-2.5 text-[12px] text-neutral-400">
              Zero paid calls so far, and it stays zero until somebody actually pays. The endpoint is
              live and quoting — try it yourself with{" "}
              <code className="rounded bg-black/[0.04] px-1 py-px font-mono text-[11.5px]">
                curl -X POST {AGENT_ORIGIN}/api/summarize -d &apos;&#123;&quot;text&quot;:&quot;…&quot;&#125;&apos;
              </code>
              .
            </p>
          )}
        </>
      )}

      <SlideOver open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} width="max-w-lg">
        {open && <Detail e={open} onDeploy={() => { setDeploying(open); setOpen(null); }} onTest={() => { setTesting(open); setOpen(null); }} />}
      </SlideOver>

      {deploying && <DeployModal endpoint={deploying as never} open onClose={() => setDeploying(null)} />}
      {testing && <TestConsole endpoint={testing as never} open onClose={() => setTesting(null)} />}
    </>
  );
}

function Detail({ e, onDeploy, onTest }: { e: RealEndpoint; onDeploy: () => void; onTest: () => void }) {
  const [copied, setCopied] = useState(false);
  const snippet = `curl -X POST ${e.url} \\\n  -H 'content-type: application/json' \\\n  -d '{"text":"…"}'`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the snippet is on screen to select */
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <StatusPill status="live" />
        {e.description && <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-600">{e.description}</p>}
        <a
          href={e.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 break-all font-mono text-[12px] text-neutral-500 hover:text-accent"
        >
          {e.url} <ExternalLink size={11} />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-5 border-t border-black/[0.07] pt-5">
        <Metric label="Price" value={e.price} unit="per request" />
        <Metric label="Paid calls" value={String(e.calls)} />
        <Metric label="Earned" value={usd(e.earnedUsdc)} unit="USDC" />
        <Metric label="Method" value={e.method} />
      </div>

      <div className="border-t border-black/[0.07] pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-neutral-900">Call it</h3>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md border border-black/10 px-2 py-1 text-[12px] text-neutral-500 transition-colors hover:text-neutral-900"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="mt-2.5 overflow-x-auto rounded-lg border border-black/[0.07] bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed text-neutral-700">
{snippet}
        </pre>
        <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
          Unpaid, that returns a real <span className="font-mono">402</span> with a USDC quote. This
          is not a simulation — the endpoint is public.
        </p>
      </div>

      <div className="flex gap-2 border-t border-black/[0.07] pt-5">
        <button type="button" onClick={onTest} className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:border-black/20">
          Test console
        </button>
        <button type="button" onClick={onDeploy} className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800">
          <Rocket size={13} /> Deploy another
        </button>
      </div>
    </div>
  );
}
