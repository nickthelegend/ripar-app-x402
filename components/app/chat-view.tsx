"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, Square } from "lucide-react";
import { Mark } from "@/components/ui/mark";
import { cn } from "@/lib/utils";
import { PageHead, Sheet } from "./bits";

type Fact = { label: string; value: string };

export type Turn = {
  id: number;
  role: "you" | "ripar";
  text: string;
  tool?: { call: string; result: string; done: boolean };
  facts?: Fact[];
  streaming?: boolean;
  stopped?: boolean;
};

/**
 * Replies are scripted and run entirely in the browser — there is no model
 * behind this yet. Each script is the shape of an answer the real thing has to
 * give: the call it would make, what came back, then the plain-language reply.
 */
type Script = {
  match: RegExp;
  tool?: { call: string; result: string };
  reply: string;
  facts?: Fact[];
};

const SCRIPTS: Script[] = [
  {
    match: /\b(price|pricing|charge|cost|usdc|402|list|publish|bazaar)\b/i,
    tool: {
      call: `ripar.endpoint.update({ slug: "text/summarize", price: 0.01, listed: true })`,
      result: "ok · draft → live, quote armed",
    },
    reply:
      "Done. Summarise now answers an unpaid request with 402 and a 0.010 USDC quote, and it is listed on the Bazaar so agents can find it without you introducing them. A caller that attaches X-PAYMENT and retries gets the run, and the USDC settles straight to your address — Ripar never holds it.",
    facts: [
      { label: "Route", value: "api.ripar.io/a/text/summarize" },
      { label: "Price", value: "0.010 USDC / request" },
      { label: "Listed", value: "x402 Bazaar" },
    ],
  },
  {
    match: /\b(job|bid|hire|label|labell?ing|enrich|address(es)?|escrow)\b/i,
    tool: {
      call: `ripar.job.post({ title: "Label 5,000 addresses", budget: 2.5, closes: "15m" })`,
      result: "ok · escrow held, bidding open",
    },
    reply:
      "Posted. 2.50 USDC sits in escrow and bidding closes in fifteen minutes. Agents carrying the enrichment or labelling skill can bid on it. Escrow only releases against a result that passes the job's verification, so an agent that returns nothing useful is paid nothing.",
    facts: [
      { label: "Budget", value: "2.50 USDC" },
      { label: "Bidding closes", value: "15m" },
      { label: "Skills wanted", value: "enrichment · labelling" },
    ],
  },
  {
    match: /\b(workflow|trigger|cron|every|watch|collateral|health|top ?up|when)\b/i,
    tool: {
      call: `ripar.workflow.create({ trigger: "cron 5m", steps: 4 })`,
      result: "ok · draft created, not armed",
    },
    reply:
      "Drafted a four-step chain: a five-minute cron, a paid read of the position health, a condition on the health factor, then the top-up action. It stays a draft until you arm it. Open it under Workflows to move the steps around, rewire the branches, or change what the read costs.",
    facts: [
      { label: "Trigger", value: "cron · every 5m" },
      { label: "Steps", value: "4" },
      { label: "Cost / run", value: "0.020 USDC" },
      { label: "State", value: "draft" },
    ],
  },
  {
    match: /\b(endpoint|deploy|ship|expose|api|handler|route)\b/i,
    tool: {
      call: `ripar.endpoint.create({ name: "Wallet Risk Score", price: 0.01 })`,
      result: "ok · draft created",
    },
    reply:
      "Created it as a draft with a public route and a payout address already attached. Deploy a handler to it and set it live, and the x402 middleware takes care of the quote, the payment check and the receipt for every call.",
    facts: [
      { label: "Route", value: "api.ripar.io/a/wallet-risk-score" },
      { label: "Price", value: "0.010 USDC / request" },
      { label: "Status", value: "draft" },
    ],
  },
];

const FALLBACK: Omit<Script, "match"> = {
  reply:
    "I can price and list an endpoint, draft a workflow, or post a job for agents to bid on. Say which and what it should cost — for example, price my summariser at 0.01 USDC, or post a job to label 5,000 addresses.",
};

const SUGGESTIONS = [
  "Price my summariser at 0.01 USDC and list it",
  "Post a job to label 5,000 wallet addresses",
  "Top up collateral when health drops below 1.4",
  "Create an endpoint that scores wallet risk",
];

const WORD_MS = 30;
const TOOL_MS = 900;

let counter = 0;

export function ChatView({
  seed,
  turns,
  setTurns,
}: {
  seed?: string;
  turns: Turn[];
  setTurns: React.Dispatch<React.SetStateAction<Turn[]>>;
}) {
  const [draft, setDraft] = useState(seed ?? "");
  const [busy, setBusy] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);
  // Auto-scroll only while the reader is already at the bottom, so reading back
  // through the conversation isn't yanked away mid-sentence.
  const stick = useRef(true);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Grow the composer with its content, up to the point where it would eat the
  // transcript.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function send(text: string) {
    const body = text.trim();
    if (!body || busy) return;

    const script = SCRIPTS.find((s) => s.match.test(body)) ?? FALLBACK;
    const askId = ++counter;
    const replyId = ++counter;

    stick.current = true;
    setDraft("");
    setBusy(true);
    setTurns((t) => [
      ...t,
      { id: askId, role: "you", text: body },
      {
        id: replyId,
        role: "ripar",
        text: "",
        tool: script.tool ? { ...script.tool, done: false } : undefined,
        streaming: true,
      },
    ]);

    const words = script.reply.split(" ");
    const stream = () => {
      let spoken = 0;
      const next = () => {
        spoken += 1;
        setTurns((t) => t.map((m) => (m.id === replyId ? { ...m, text: words.slice(0, spoken).join(" ") } : m)));
        if (spoken < words.length) {
          later(next, WORD_MS);
        } else {
          setTurns((t) => t.map((m) => (m.id === replyId ? { ...m, streaming: false, facts: script.facts } : m)));
          setBusy(false);
        }
      };
      later(next, WORD_MS);
    };

    if (script.tool) {
      later(() => {
        setTurns((t) => t.map((m) => (m.id === replyId && m.tool ? { ...m, tool: { ...m.tool, done: true } } : m)));
        later(stream, 260);
      }, TOOL_MS);
    } else {
      later(stream, 320);
    }
  }

  function stop() {
    clearTimers();
    setTurns((t) => t.map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m)));
    setBusy(false);
  }

  return (
    <>
      <PageHead
        title="Chat"
        subtitle="Ask for the thing you want — a priced endpoint, a workflow that guards a position, a job for agents to bid on."
      />

      <Sheet>
        <div className="flex h-[calc(100dvh-15rem)] min-h-[460px] flex-col">
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            }}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          >
            {turns.length === 0 ? (
              <Opening onPick={send} />
            ) : (
              <ol className="mx-auto max-w-[720px] space-y-6">
                {turns.map((t) => (
                  <li key={t.id}>{t.role === "you" ? <Ask turn={t} /> : <Reply turn={t} />}</li>
                ))}
              </ol>
            )}
          </div>

          <div className="border-t border-black/[0.07] p-3">
            <div className="mx-auto max-w-[720px]">
              {busy && (
                <div className="mb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={stop}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:border-black/20 hover:text-neutral-900"
                  >
                    <Square size={9} className="fill-current" /> Stop generating
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-black/[0.09] bg-white p-2.5 transition-colors focus-within:border-neutral-400">
                <textarea
                  ref={input}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(draft);
                    }
                  }}
                  rows={1}
                  placeholder="Price my summariser at 0.01 USDC…"
                  className="block w-full resize-none bg-transparent px-1.5 py-1 text-[13.5px] leading-relaxed outline-none placeholder:text-neutral-400"
                />
                <div className="mt-1.5 flex items-center gap-2 px-1">
                  <span className="text-[11.5px] text-neutral-400">
                    Enter to send · Shift+Enter for a new line
                  </span>
                  <button
                    type="button"
                    onClick={() => send(draft)}
                    disabled={!draft.trim() || busy}
                    aria-label="Send message"
                    className={cn(
                      "ml-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                      draft.trim() && !busy
                        ? "bg-neutral-900 text-white hover:bg-neutral-800"
                        : "bg-neutral-200 text-neutral-400"
                    )}
                  >
                    <CornerDownLeft size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Sheet>

      <p className="mt-2.5 text-[12px] text-neutral-400">
        Replies are scripted and run in this browser. No model is called and nothing is sent
        anywhere — this is the shape of the surface, not a live assistant.
      </p>
    </>
  );
}

function Opening({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-[560px] flex-col items-center justify-center py-10 text-center">
      <Mark size={34} />
      <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">
        What should Ripar build?
      </h2>
      <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-neutral-500">
        Describe it the way you would to a colleague. Every answer names the call it would make
        before it makes it, so nothing is priced or posted behind your back.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[12px] text-neutral-600 transition-colors hover:border-black/20 hover:text-neutral-900"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Ask({ turn }: { turn: Turn }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-black/[0.045] px-3.5 py-2 text-[13.5px] leading-relaxed text-neutral-800">
        {turn.text}
      </p>
    </div>
  );
}

function Reply({ turn }: { turn: Turn }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0">
        <Mark size={22} />
      </span>
      <div className="min-w-0 flex-1">
        {turn.tool && <ToolChip tool={turn.tool} stopped={turn.stopped} />}

        {turn.text && (
          <p className="mt-2.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-neutral-800">
            {turn.text}
            {turn.streaming && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[13px] w-[2px] translate-y-[2px] animate-pulse bg-accent"
              />
            )}
          </p>
        )}

        {turn.facts && (
          <dl className="mt-3 divide-y divide-black/[0.05] overflow-hidden rounded-xl border border-black/[0.08]">
            {turn.facts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
                <dt className="text-[12px] text-neutral-400">{f.label}</dt>
                <dd className="tnum text-[12.5px] text-neutral-800">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {turn.stopped && <p className="mt-2 text-[12px] text-neutral-400">Stopped.</p>}
      </div>
    </div>
  );
}

/** Status is the dot and its word — the chip never leans on colour alone. */
function ToolChip({ tool, stopped }: { tool: NonNullable<Turn["tool"]>; stopped?: boolean }) {
  const state = tool.done ? "done" : stopped ? "stopped" : "running";
  const tone = {
    running: { dot: "bg-amber-500 motion-safe:animate-pulse", label: "Running" },
    done: { dot: "bg-emerald-500", label: "Ran" },
    stopped: { dot: "bg-neutral-300", label: "Stopped" },
  }[state];

  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-neutral-50">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
        <span className="shrink-0 text-[11.5px] font-medium text-neutral-500">{tone.label}</span>
        <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-neutral-700">{tool.call}</code>
      </div>
      {tool.done && (
        <div className="border-t border-black/[0.05] px-2.5 py-1.5 font-mono text-[11.5px] text-emerald-700">
          → {tool.result}
        </div>
      )}
    </div>
  );
}
