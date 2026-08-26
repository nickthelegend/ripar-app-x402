"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, Square } from "lucide-react";
import { Mark } from "@/components/ui/mark";
import { cn } from "@/lib/utils";
import { PageHead, Sheet } from "./bits";
import { usePrefersReducedMotion } from "@/lib/mission/use-animation-frame";

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

/** Each of these produces a real request against the deployed agent. */
const SUGGESTIONS = [
  "What does the summarise endpoint cost?",
  "Show me the live 402 challenge",
  "Who does payment actually go to?",
  "How long is a quote valid for?",
];

const AGENT_ENDPOINT =
  process.env.NEXT_PUBLIC_AGENT_ENDPOINT ?? "api.ripar.io/api/summarize";


const WORD_MS = 30;

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
  // `busy` drives the UI, but it cannot gate the handler: setBusy schedules a
  // re-render, so several clicks dispatched before React commits all read the
  // old value and every one of them proceeds. Three fast clicks on send put two
  // real requests on the wire and left the transcript with neither tool line,
  // because the overlapping handlers wrote over each other's state. The ref
  // flips synchronously, so the second click sees it on the same tick.
  const inFlight = useRef(false);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);
  // Auto-scroll only while the reader is already at the bottom, so reading back
  // through the conversation isn't yanked away mid-sentence.
  const stick = useRef(true);
  // The transcript is the answer, not the animation. Someone who has asked
  // the OS for less motion should get the reply, not a word-by-word reveal of
  // it — every other animated surface here already honours this.
  const reducedMotion = usePrefersReducedMotion();

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

  /**
   * Ask the deployed agent for a real quote.
   *
   * This used to pick a canned script and type out a hardcoded reply that
   * looked like a tool call — `Ran ripar.endpoint.update(...) → ok` — while no
   * request left the browser. Every number in the answer was written by hand,
   * and an input the scripts did not match still produced a confident-looking
   * result. That is the one thing a reviewer checks for, and it made the whole
   * surface unreadable as evidence.
   *
   * Now the tool line is the request that actually goes out, the result line is
   * what actually came back, and every figure below is decoded from the real
   * PAYMENT-REQUIRED header. If the agent is unreachable the failure is shown
   * as a failure, not smoothed into a success.
   */
  async function send(text: string) {
    const body = text.trim();
    if (!body || inFlight.current) return;
    inFlight.current = true;

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
        tool: {
          call: `POST ${AGENT_ENDPOINT}  — no payment attached`,
          result: "asking…",
          done: false,
        },
        streaming: true,
      },
    ]);

    const started = Date.now();
    let reply: string;
    let facts: Fact[] | undefined;
    let result: string;

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const data = await res.json();

      if (!data.ok || !data.paymentRequiredHeader) {
        result = `${data.status ?? res.status} · no challenge returned`;
        reply =
          data.error ??
          "The endpoint answered, but not with a payment challenge. Nothing was charged and nothing was signed.";
      } else {
        const q = JSON.parse(atob(data.paymentRequiredHeader));
        const accept = q.accepts?.[0] ?? {};
        const units = Number(accept.maxAmountRequired ?? accept.amount ?? 0);
        const price = units / 1_000_000;

        result = `${data.status} · ${data.elapsedMs}ms · ${data.paymentRequiredHeader.length}B header`;
        reply =
          `That endpoint is x402-gated. It answered ${data.status} in ${data.elapsedMs}ms and stated its terms in a ` +
          `PAYMENT-REQUIRED header declaring x402 version ${q.x402Version ?? 2}. It wants ${price} USDC — ` +
          `${units} base units divided by the asset's six decimals — settled on Algorand under the ${accept.scheme ?? "exact"} ` +
          `scheme, and it will hold that quote for ${accept.maxTimeoutSeconds ?? "?"} seconds. Attach X-PAYMENT and retry ` +
          `and the USDC goes straight to the address below. Nothing was paid to fetch this.`;
        facts = [
          { label: "Price", value: `${price} USDC (${units} base units)` },
          { label: "Asset", value: String(accept.asset ?? "—") },
          { label: "Pays to", value: String(accept.payTo ?? "—") },
          { label: "Settle within", value: `${accept.maxTimeoutSeconds ?? "?"}s` },
        ];
      }
    } catch (err) {
      result = `failed after ${Date.now() - started}ms`;
      reply =
        "Could not reach the agent to ask for a quote. That is a transport failure, not a refusal — " +
        "nothing was signed, nothing was charged, and no state changed. " +
        (err instanceof Error ? err.message : "");
    }

    setTurns((t) =>
      t.map((m) => (m.id === replyId && m.tool ? { ...m, tool: { ...m.tool, result, done: true } } : m))
    );

    if (reducedMotion) {
      setTurns((t) =>
        t.map((m) => (m.id === replyId ? { ...m, text: reply, streaming: false, facts } : m))
      );
      inFlight.current = false;
      setBusy(false);
      return;
    }

    const words = reply.split(" ");
    const stream = () => {
      let spoken = 0;
      const next = () => {
        spoken += 1;
        setTurns((t) => t.map((m) => (m.id === replyId ? { ...m, text: words.slice(0, spoken).join(" ") } : m)));
        if (spoken < words.length) {
          later(next, WORD_MS);
        } else {
          setTurns((t) => t.map((m) => (m.id === replyId ? { ...m, streaming: false, facts } : m)));
          inFlight.current = false;
          setBusy(false);
        }
      };
      later(next, WORD_MS);
    };
    later(stream, 200);

  }

  // The Overview hero hands its text over as `seed`. It used to only prefill the
  // composer, so the flow the page calls "in one click" actually took two: type
  // and send on Overview, land on Chat, then send again. Someone who does not
  // notice the second step concludes the button is broken.
  //
  // Sent once, guarded on the ref so it cannot double-fire alongside a manual
  // send, and cleared so switching back to Chat later does not replay it.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    const text = (seed ?? "").trim();
    if (!text) return;
    // Deferred rather than called in the effect body: send() sets state on its
    // first line, and doing that straight from an effect cascades renders.
    //
    // NOT routed through `later`. That list is cleared on unmount, and React's
    // dev double-invoke mounts, tears down and remounts — which cancelled the
    // send while `seeded` stayed latched, so the remount skipped it and the
    // one-click flow silently became two clicks again. The flag is set inside
    // the callback instead: cancelled before it fires means it never happened,
    // so the remount is free to try again.
    const id = window.setTimeout(() => {
      seeded.current = true;
      void send(text);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  function stop() {
    clearTimers();
    setTurns((t) => t.map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m)));
    // Release the send guard too — without this, stopping a reply would leave
    // inFlight stuck true and the composer permanently dead.
    inFlight.current = false;
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
        Every answer here is a real request. The line above each reply is the call that
        actually went out, and the figures are decoded from the challenge that came back —
        nothing is scripted and no number is written by hand.
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
