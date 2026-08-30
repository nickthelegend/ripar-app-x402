"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, Square } from "lucide-react";
import { Mark } from "@/components/ui/mark";
import { cn } from "@/lib/utils";
import { PageHead, Sheet } from "./bits";
import { usePrefersReducedMotion } from "@/lib/mission/use-animation-frame";
import { classify, runIntent, type IntentKind, type SettlementContext } from "@/lib/chat-intent";
import { useWorkspace } from "@/lib/real-data";

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
 * Four suggestions that route four DIFFERENT ways, on purpose. The old set was
 * four rephrasings of "what does it cost", which is how a box that only ever
 * did one thing managed to look like it did several.
 */
const SUGGESTIONS = [
  "What does the summarise endpoint cost?",
  "What jobs are on the board and how much is escrowed?",
  "Which agents are registered?",
  "How much has actually settled?",
];

/**
 * The request each intent is about to make, named before it is made. `null`
 * marks the branches that answer without asking anything — they must not draw
 * a request line at all.
 */
const PENDING_CALL: Record<IntentKind, string | null> = {
  quote: `POST ${process.env.NEXT_PUBLIC_AGENT_ENDPOINT ?? "api.ripar.io/api/summarize"}  — no payment attached`,
  jobs: "GET /api/registry/jobs  — jb_ and es_ boxes",
  agents: "GET /api/registry/agents  — ag_ boxes",
  receipts: "indexer · settled USDC transfers",
  help: null,
  unsupported: null,
};

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

  // Settlements have no API route — the workspace poller reads them from the
  // indexer and shares one copy. The chat answers from those same rows so it
  // can never disagree with the Receipts table sitting one click away.
  const workspace = useWorkspace();
  // A ref, not the value: `send` closes over whatever was true when the message
  // was sent, and on a cold load that is "still loading". The getter lets the
  // receipts branch read the CURRENT value while it waits.
  const settlementRef = useRef<SettlementContext | undefined>(undefined);
  settlementRef.current = workspace.data
    ? { runs: workspace.data.runs, mine: workspace.data.mine, round: workspace.data.chain.round }
    : undefined;

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
   * Route the message, then answer from whatever that route actually returned.
   *
   * Two rewrites got us here. First this typed out a canned script while no
   * request left the browser. That was replaced by a real request — but the
   * SAME real request for every message, so "what is the capital of Peru"
   * still came back as a confident reading of a payment header. Real numbers
   * answering the wrong question is the more dangerous of the two failures,
   * because it survives exactly the spot-check that catches the first.
   *
   * Now `classify` picks the branch before anything is drawn, each branch hits
   * a different live source, and the branches that cannot help say so instead
   * of falling back to the one request this box knows how to make.
   */
  async function send(text: string) {
    const body = text.trim();
    if (!body || inFlight.current) return;
    inFlight.current = true;

    const askId = ++counter;
    const replyId = ++counter;

    // Classify BEFORE anything is drawn, so the pending tool line names the
    // request this message will actually cause. It used to read
    // "POST …/summarize" for every message, which meant the transcript had
    // already committed to the wrong action before the answer existed.
    const kind = classify(body);
    const pendingCall = PENDING_CALL[kind];

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
        tool: pendingCall ? { call: pendingCall, result: "asking…", done: false } : undefined,
        streaming: true,
      },
    ]);

    const started = Date.now();
    let reply: string;
    let facts: Fact[] | undefined;
    let result: string;
    let toolCall: string | null = pendingCall;

    try {
      const out = await runIntent(kind, body, () => settlementRef.current);
      result = out.result;
      reply = out.reply;
      facts = out.facts;
      // A branch that made no request must not keep the placeholder tool line
      // claiming one went out — that was the original lie in miniature.
      if (out.call === null) toolCall = null;
      else toolCall = out.call;
    } catch (err) {
      result = `failed after ${Date.now() - started}ms`;
      reply =
        "Could not reach the source that answer needed. That is a transport failure, not a refusal — " +
        "nothing was signed, nothing was charged, and no state changed. " +
        (err instanceof Error ? err.message : "");
    }

    setTurns((t) =>
      t.map((m) =>
        m.id === replyId
          ? {
              ...m,
              // `toolCall === null` means the branch answered without asking
              // anything. Dropping the line entirely is the honest render:
              // leaving a greyed-out request there implies one was attempted.
              tool: toolCall ? { call: toolCall, result, done: true } : undefined,
            }
          : m
      )
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
        This is a router over four live sources, not a language model: pricing a paid call,
        the job board, the agent registry and settled transfers. Where a reply carries a
        request line, that is the call that actually went out and the figures under it are
        decoded from what came back. Ask it anything outside those four and it will say so
        rather than answer.
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
