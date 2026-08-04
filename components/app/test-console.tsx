"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  API_HOST, SAMPLE_CALLERS, USDC_ASSET_ID, X402_NETWORK, baseUnits, sampleIoFor, usd,
  type Endpoint,
} from "@/lib/app-data";
import { useSettings } from "@/lib/settings";
import { CopyButton } from "./bits";

/**
 * Drives the same two-step exchange a paying caller makes: an unpaid request
 * that comes back 402 with the quote, then the retry carrying X-PAYMENT.
 * The exchange is simulated in the browser — nothing is sent and no USDC moves —
 * but every body is the shape the wire actually carries.
 */
export function TestConsole({
  endpoint,
  open,
  onClose,
}: {
  endpoint: Endpoint | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={endpoint ? `Test ${endpoint.name}` : "Test"}
      description="Send an unpaid request to read the quote, then retry it paid. Simulated in this browser — no request leaves the page and no USDC moves."
      className="max-w-3xl"
    >
      {endpoint && <Console key={endpoint.id} e={endpoint} />}
    </Modal>
  );
}

type Tone = "amber" | "emerald" | "rose";

type Exchange = {
  id: number;
  label: string;
  status: string;
  tone: Tone;
  ms: number;
  charged: number | null;
  request: string;
  response: string;
};

const TONE: Record<Tone, { dot: string; text: string }> = {
  amber: { dot: "bg-amber-500", text: "text-amber-700" },
  emerald: { dot: "bg-emerald-500", text: "text-emerald-700" },
  rose: { dot: "bg-rose-500", text: "text-rose-700" },
};

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** btoa only takes code points below 256, and a body can carry anything — so
 *  encode the UTF-8 bytes rather than the string. */
function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const wrap = (s: string, at = 64) => (s.length <= at ? s : `${s.slice(0, at)}…`);

function req(path: string, headers: string[], body: string) {
  return [`POST ${path} HTTP/1.1`, `host: ${API_HOST}`, ...headers, "", body].join("\n");
}
function res(status: string, headers: string[], body: string) {
  return [`HTTP/1.1 ${status}`, ...headers, "", body].join("\n");
}

/** p50 with a little jitter, so two runs do not read as a cached number. */
const jitter = (p50: number) => Math.max(18, Math.round((p50 || 40) * (0.85 + Math.random() * 0.3)));

function Console({ e }: { e: Endpoint }) {
  const { payout } = useSettings();
  const io = sampleIoFor(e.slug);
  const [body, setBody] = useState(() => json(io.request));
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "quote" | "pay">(null);
  const [log, setLog] = useState<Exchange[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  /** Every round trip hands the buttons back, even if building the exchange
   *  throws — a spinner that never stops is worse than an empty console. */
  const respond = (ms: number, build: () => void) => {
    timers.current.push(
      setTimeout(() => {
        try {
          build();
        } finally {
          setBusy(null);
        }
      }, ms)
    );
  };

  const path = `/a/${e.slug}`;
  const resource = `https://${API_HOST}${path}`;
  const caller = SAMPLE_CALLERS[0];
  const amount = baseUnits(e.price);
  const quoted = log.some((x) => x.tone === "amber");

  function parsedBody(): string | null {
    try {
      return json(JSON.parse(body));
    } catch (err) {
      setBodyError(err instanceof Error ? err.message : "That is not valid JSON.");
      return null;
    }
  }

  function sendUnpaid() {
    const pretty = parsedBody();
    if (pretty === null) return;
    setBodyError(null);
    setBusy("quote");

    respond(620, () => {
      const request = req(path, ["content-type: application/json", "accept: application/json"], pretty);
      const ms = jitter(e.status === "live" ? 40 : 25);

      // A route with nothing behind it never gets as far as quoting.
      if (e.status === "draft" || e.status === "paused") {
        const why = e.status === "draft" ? "no handler is deployed for this route" : "this endpoint is paused";
        setLog([{
          id: 1, label: "Unpaid request", status: "503 Service Unavailable", tone: "rose", ms, charged: null, request,
          response: res("503 Service Unavailable", ["content-type: application/json", "retry-after: 120"], json({ error: why, resource })),
        }]);
        return;
      }

      setLog([{
        id: 1, label: "Unpaid request", status: "402 Payment Required", tone: "amber", ms, charged: null, request,
        response: res("402 Payment Required", ["content-type: application/json"], json({
          x402Version: 1,
          error: "X-PAYMENT header is required",
          accepts: [{
            scheme: "exact",
            network: X402_NETWORK,
            maxAmountRequired: amount,
            resource,
            description: e.summary,
            mimeType: "application/json",
            payTo: payout,
            maxTimeoutSeconds: 60,
            asset: USDC_ASSET_ID,
            extra: { name: "USDC", decimals: 6 },
          }],
        })),
      }]);
    });
  }

  function sendPaid() {
    const pretty = parsedBody();
    if (pretty === null) return;
    setBodyError(null);
    setBusy("pay");

    respond(940, () => {
      const payment = b64(json({
        x402Version: 1,
        scheme: "exact",
        network: X402_NETWORK,
        payload: {
          signedTransaction: "gqNzaWfEQIYuMK9mF0hBxk3Nn2Qd8v7bTQ==",
          from: caller,
          to: payout,
          asset: USDC_ASSET_ID,
          amount,
        },
      }));
      const request = req(
        path,
        ["content-type: application/json", "accept: application/json", `x-payment: ${wrap(payment, 72)}`],
        pretty
      );

      // A handler that fails is never settled — the caller keeps the USDC.
      if (e.status === "error") {
        setLog((prev) => [...prev, {
          id: prev.length + 1, label: "Paid retry", status: "502 Bad Gateway", tone: "rose", ms: jitter(e.p50), charged: null, request,
          response: res("502 Bad Gateway", [
            "content-type: application/json",
            `x-payment-response: ${wrap(b64(json({ success: false, reason: "handler failed — payment not settled" })), 72)}`,
          ], json({ error: "upstream handler returned 502", settled: false, charged: "0", requestId: "req_7e02f" })),
        }]);
        return;
      }

      const round = 48_210_557;
      setLog((prev) => [...prev, {
        id: prev.length + 1, label: "Paid retry", status: "200 OK", tone: "emerald", ms: jitter(e.p50), charged: e.price, request,
        response: res("200 OK", [
          "content-type: application/json",
          `x-payment-response: ${wrap(b64(json({ success: true, network: X402_NETWORK, txId: "7A2F9C1BE4D0", payer: caller, amount, asset: USDC_ASSET_ID, confirmedRound: round })), 72)}`,
        ], json(io.result)),
      }]);
    });
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLog([]);
    setBusy(null);
    setBodyError(null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/[0.09] p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-700">POST</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-neutral-600">{resource}</span>
          <span className="tnum text-[12px] text-neutral-500">{e.price.toFixed(3)} USDC / call</span>
        </div>

        <label className="mt-3 block">
          <span className="text-[12.5px] font-medium text-neutral-700">Request body</span>
          <textarea
            value={body}
            onChange={(ev) => { setBody(ev.target.value); setBodyError(null); }}
            rows={5}
            spellCheck={false}
            aria-invalid={!!bodyError}
            className={cn(
              "tnum mt-1.5 w-full resize-y rounded-lg border bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed outline-none transition-colors",
              bodyError ? "border-rose-300 focus:border-rose-400" : "border-black/10 focus:border-neutral-400"
            )}
          />
        </label>
        {bodyError && <p role="alert" className="mt-1 text-[12px] text-rose-600">Body is not valid JSON — {bodyError}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={sendUnpaid}
            disabled={busy !== null}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors",
              busy ? "cursor-not-allowed bg-neutral-300" : "bg-neutral-900 hover:bg-neutral-800"
            )}
          >
            {busy === "quote" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {busy === "quote" ? "Waiting for the quote…" : "Send unpaid request"}
          </button>

          {quoted && (
            <button
              type="button"
              onClick={sendPaid}
              disabled={busy !== null}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                busy ? "cursor-not-allowed border-black/10 text-neutral-400" : "border-black/10 text-neutral-700 hover:border-black/20 hover:text-neutral-900"
              )}
            >
              {busy === "pay" ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />}
              {busy === "pay" ? "Signing and settling…" : "Sign and retry with X-PAYMENT"}
            </button>
          )}

          {log.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <RotateCcw size={12} /> Clear console
            </button>
          )}
        </div>
      </div>

      {log.length === 0 && busy === null && (
        <div className="rounded-xl border border-dashed border-black/12 px-5 py-8 text-center">
          <p className="text-[13.5px] font-medium text-neutral-800">Nothing sent yet</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-neutral-500">
            The first request goes out unpaid on purpose — that is how a caller discovers the price.
          </p>
        </div>
      )}

      {busy === "quote" && log.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-black/12 px-4 py-8 text-[12.5px] text-neutral-500">
          <Loader2 size={14} className="animate-spin text-neutral-400" />
          Sending an unpaid request…
        </div>
      )}

      <div className="space-y-3">
        {log.map((x) => (
          <div key={x.id} className="overflow-hidden rounded-xl border border-black/[0.09]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-black/[0.07] bg-white px-3.5 py-2.5">
              <span className="text-[12.5px] font-semibold text-neutral-900">{x.label}</span>
              <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium", TONE[x.tone].text)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", TONE[x.tone].dot)} />
                {x.status}
              </span>
              <span className="tnum ml-auto text-[12px] text-neutral-500">{x.ms} ms</span>
              <span className="tnum text-[12px] text-neutral-500">
                {x.charged === null ? "not charged" : `${usd(x.charged, 3)} USDC settled`}
              </span>
            </div>
            <div className="grid gap-px bg-black/[0.06] sm:grid-cols-2">
              <Pane title="Request" text={x.request} />
              <Pane title="Response" text={x.response} />
            </div>
          </div>
        ))}
      </div>

      {log.some((x) => x.tone === "emerald") && (
        <p className="text-[12px] leading-relaxed text-neutral-500">
          <span className="font-mono text-[11.5px]">x-payment-response</span> is base64 JSON carrying the
          settlement — transaction id, payer and confirmed round — so a caller can verify what it paid for
          without trusting the response body.
        </p>
      )}
    </div>
  );
}

function Pane({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-white">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h4>
        <CopyButton text={text} what={title.toLowerCase()} className="ml-auto" />
      </div>
      <pre className="max-h-[260px] overflow-auto px-3 pb-3 pt-2 font-mono text-[11.5px] leading-[1.6] text-neutral-700">
        {text}
      </pre>
    </div>
  );
}
