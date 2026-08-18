"use client";

import { ShieldCheck } from "lucide-react";
import type { ComposedCall } from "@/lib/registry-client";
import { cn } from "@/lib/utils";
import { CodeBlock, CopyButton } from "./bits";

/**
 * What a composed transaction looks like before anybody signs it.
 *
 * The plain-language block comes first and the base64 second, deliberately. A
 * signer who reads only the top of this panel should still know exactly what
 * signing moves, who it moves it to, and what it costs — the msgpack is the
 * thing they paste into a wallet, not the thing they are expected to audit.
 */
export function UnsignedCall({ call }: { call: ComposedCall }) {
  const group = call.transactions.length > 1;

  return (
    <div className="rounded-xl border border-black/[0.09] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.07] px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">
          <ShieldCheck size={12} />
          Unsigned
        </span>
        <span className="font-mono text-[12px] text-neutral-500">{call.method}</span>
        <span className="ml-auto text-[11.5px] text-neutral-400">
          app {call.appId} · fee {(call.totalFee / 1e6).toFixed(4)} ALGO
        </span>
      </div>

      {/* The chain's own verdict, asked before anyone is invited to sign.
          Composing a well-formed transaction is not the same as composing one
          that works: a stale agent_count, an off-by-one box name or a sender who
          is not the owner all compose cleanly and fail on submit — after the
          signature. A null simulation means the node could not be asked, which
          is not the same as a rejection and does not claim to be. */}
      {call.simulation && (
        <div
          className={cn(
            "flex items-start gap-2 border-b px-4 py-2.5 text-[12.5px]",
            call.simulation.ok
              ? "border-black/[0.07] bg-emerald-50/60 text-emerald-800"
              : "border-black/[0.07] bg-rose-50/70 text-rose-800",
          )}
        >
          <span className="mt-[1px] font-semibold">
            {call.simulation.ok ? "Simulated ✓" : "Would fail"}
          </span>
          <span className="leading-relaxed">
            {call.simulation.ok ? (
              <>
                algod ran this against round {call.simulation.round?.toLocaleString()} and it
                succeeded
                {call.simulation.budgetConsumed != null
                  ? `, using ${call.simulation.budgetConsumed} of its opcode budget`
                  : ""}
                . Signing is the only step left.
              </>
            ) : (
              <>{call.simulation.failure} — signing this would spend the fee and change nothing.</>
            )}
          </span>
        </div>
      )}
      {!call.simulation && (
        <div className="border-b border-black/[0.07] bg-amber-50/60 px-4 py-2.5 text-[12.5px] text-amber-900">
          <span className="font-semibold">Not simulated</span> — the node could not be reached, so
          this has not been checked against the chain. That is not the same as it being wrong.
        </div>
      )}

      <div className="space-y-5 px-4 py-4">
        <div>
          <h4 className="text-[12.5px] font-semibold text-neutral-900">What signing this would do</h4>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-700">{call.summary}</p>
          <ul className="mt-2.5 space-y-1.5">
            {call.effects.map((e) => (
              <li key={e} className="flex gap-2 text-[12.5px] leading-relaxed text-neutral-500">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neutral-300" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3 border-t border-black/[0.06] pt-4 sm:grid-cols-2">
          <Fact label="Signs as" value={call.sender} mono />
          <Fact
            label="Valid for rounds"
            value={`${call.validRounds.first.toLocaleString("en-US")} – ${call.validRounds.last.toLocaleString("en-US")}`}
          />
          {group && call.groupId && <Fact label="Group id" value={call.groupId} mono />}
          <Fact
            label="Boxes referenced"
            value={call.transactions.flatMap((t) => t.boxes).join(", ") || "none"}
            mono
          />
        </div>

        {call.transactions.map((t) => (
          <CodeBlock
            key={t.txId}
            title={
              group
                ? `Transaction ${t.index + 1} of ${call.transactions.length} — ${t.kind}`
                : `Unsigned transaction — ${t.kind}`
            }
            filename={`${t.txId.slice(0, 10)}…`}
            body={t.unsignedTxnBase64}
            maxHeight="180px"
            note={
              <>
                {t.summary} The id above is what this transaction will have once signed — signing does not
                change it, so you can look it up after submitting.
              </>
            }
          />
        ))}

        <div className="rounded-lg border border-black/[0.07] bg-neutral-50 px-3.5 py-3">
          <h4 className="text-[12.5px] font-semibold text-neutral-900">Next steps</h4>
          <ol className="mt-1.5 space-y-1">
            {call.nextSteps.map((s, i) => (
              <li key={s} className="flex gap-2 text-[12.5px] leading-relaxed text-neutral-600">
                <span className="tnum shrink-0 text-neutral-400">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CopyButton
              text={call.transactions.map((t) => t.unsignedTxnBase64).join("\n")}
              label={group ? "Copy both" : "Copy base64"}
              what="unsigned transaction"
            />
            <span className="text-[11.5px] text-neutral-400">
              Ripar holds no key. Nothing here has been signed or submitted.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-400">{label}</div>
      <div className={`mt-0.5 break-all text-[12.5px] text-neutral-700 ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/** A compose that was refused, with the contract's reason in the user's words. */
export function ComposeRefused({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3.5">
      <p className="text-[12.5px] font-semibold text-rose-700">Not composed</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-700">{message}</p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">
        Nothing was built. Handing back a transaction the chain will reject costs a fee and reports only which
        assert tripped, so the check happens here instead.
      </p>
    </div>
  );
}
