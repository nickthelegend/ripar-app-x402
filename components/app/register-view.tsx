"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkAddress } from "@/lib/algorand-address";
import { useSettings } from "@/lib/settings";
import {
  checkRegistration,
  compose,
  whenIso,
  type AddressCheckResult,
  type ComposedCall,
} from "@/lib/registry-client";
import { PageHead, Sheet } from "./bits";
import { ComposeRefused, UnsignedCall } from "./unsigned-txn";

// The app id is read from the API response (`data.identityApp`) rather than
// declared here. This was `768_633_998` — a dead registry from two generations
// ago — while compose() targeted 769444119, so the page told the user they were
// registering into one app and built a transaction against another, and linked
// them to the dead one. Taking it from the response makes drift impossible.
const peraApp = (id: number) => `https://testnet.explorer.perawallet.app/application/${id}/`;
const peraAddress = (a: string) => `https://testnet.explorer.perawallet.app/address/${a}/`;

/**
 * Register an agent in the Identity Registry.
 *
 * Two things make this different from a normal form. First, the app cannot do
 * it for you: `new_agent` takes the address from `Txn.sender`, so whoever signs
 * IS the agent — which is what makes a registration self-attested and removes a
 * whole class of impersonation. Second, the contract allows exactly one
 * identity per address and rejects a second attempt with a bare `assert
 * failed`, so the check happens here, against the `ad_` box, before anything is
 * composed.
 */
export function RegisterView() {
  const { payout } = useSettings();
  const [address, setAddress] = useState(payout);
  const [domain, setDomain] = useState("");
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "done" | "failed"; data: AddressCheckResult | null; error: string | null }>({
    state: "idle",
    data: null,
    error: null,
  });
  const [call, setCall] = useState<ComposedCall | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const inFlight = useRef(false);

  const addressCheck = checkAddress(address);
  const trimmedDomain = domain.trim();

  // Re-checked whenever either field settles, because both are contract asserts
  // and finding out on chain costs a fee for an error that names nothing.
  const run = useCallback(async (addr: string, dom: string) => {
    if (!checkAddress(addr).ok && !dom) {
      setCheck({ state: "idle", data: null, error: null });
      return;
    }
    setCheck((c) => ({ ...c, state: "checking" }));
    try {
      const data = await checkRegistration({
        address: checkAddress(addr).ok ? addr : undefined,
        domain: dom || undefined,
      });
      setCheck({ state: "done", data, error: null });
    } catch (e) {
      setCheck({ state: "failed", data: null, error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void run(address, trimmedDomain), 400);
    return () => clearTimeout(t);
  }, [address, trimmedDomain, run]);

  const alreadyRegistered = (check.data?.addressAgentId ?? 0) > 0;
  const domainTaken = (check.data?.domainAgentId ?? 0) > 0;
  const ready = addressCheck.ok && trimmedDomain.length > 0 && !alreadyRegistered && !domainTaken;

  // Guarded on a ref, not on the state flag below it. setState schedules a
  // re-render, so clicks dispatched before React commits all read the old value
  // and every one proceeds — three fast clicks on this button put three
  // identical requests on the wire. The ref flips on the same tick.
  async function build() {
    if (inFlight.current) return;
    inFlight.current = true;
    setComposing(true);
    setCall(null);
    setRefused(null);
    try {
      setCall(await compose({ action: "new_agent", sender: address, domain: trimmedDomain }));
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      inFlight.current = false;
      setComposing(false);
    }
  }

  return (
    <>
      <PageHead
        title="Register an agent"
        subtitle="Claim an id in the ERC-8004 Identity Registry on Algorand TestNet. This builds the transaction; your wallet signs it. Ripar never holds a key."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Sheet>
            <div className="space-y-4 px-4 py-4">
              <div>
                <label htmlFor="reg-address" className="block text-[12.5px] font-medium text-neutral-800">
                  Address that will sign
                </label>
                <input
                  id="reg-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value.trim())}
                  spellCheck={false}
                  placeholder="58 base32 characters"
                  aria-invalid={address.length > 0 && !addressCheck.ok ? true : undefined}
                  className={cn(
                    "mt-1.5 w-full rounded-lg border bg-white px-3 py-2 font-mono text-[12.5px] outline-none transition-colors",
                    address.length > 0 && !addressCheck.ok
                      ? "border-rose-300"
                      : "border-black/10 focus:border-neutral-400"
                  )}
                />
                <p
                  className={cn(
                    "mt-1 text-[11.5px] leading-relaxed",
                    address.length > 0 && !addressCheck.ok ? "text-rose-600" : "text-neutral-400"
                  )}
                >
                  {address.length > 0 && !addressCheck.ok
                    ? addressCheck.message
                    : "The contract reads Txn.sender, not an argument — whichever wallet signs becomes the agent. This field only decides what gets composed."}
                </p>
              </div>

              <div>
                <label htmlFor="reg-domain" className="block text-[12.5px] font-medium text-neutral-800">
                  Domain
                </label>
                <input
                  id="reg-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  spellCheck={false}
                  placeholder="your-agent.example.com"
                  className={cn(
                    "mt-1.5 w-full rounded-lg border bg-white px-3 py-2 font-mono text-[12.5px] outline-none transition-colors",
                    domainTaken ? "border-rose-300" : "border-black/10 focus:border-neutral-400"
                  )}
                />
                <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-400">
                  Recorded, not verified. The registry stores the string; it does not fetch anything from it,
                  and nothing here publishes an agent card for you.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void build()}
                disabled={!ready || composing}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-medium text-white transition-colors",
                  ready && !composing ? "bg-neutral-900 hover:bg-neutral-800" : "cursor-not-allowed bg-neutral-300"
                )}
              >
                {composing && <Loader2 size={13} className="animate-spin" />}
                Build the unsigned transaction
              </button>
            </div>
          </Sheet>

          <PrecheckPanel
            state={check.state}
            error={check.error}
            data={check.data}
            addressOk={addressCheck.ok}
            domain={trimmedDomain}
          />
        </div>

        <div className="space-y-4">
          {refused && <ComposeRefused message={refused} />}
          {call ? (
            <UnsignedCall call={call} />
          ) : (
            !refused && (
              <Sheet>
                <div className="px-5 py-8">
                  <h3 className="text-[13.5px] font-semibold text-neutral-900">
                    What this will hand you, and what it will not
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
                    A base64 msgpack transaction and a sentence for every consequence of signing it. Paste it
                    into Pera, Defly, Lute or any signing service that takes an unsigned Algorand transaction.
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
                    It will never hand you a signature. There is no key in this app, no mnemonic field, and no
                    code path that produces a signed transaction — which is checkable rather than promised:{" "}
                    <span className="font-mono text-[12px]">lib/registry-compose.ts</span> imports no signing
                    function at all.
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
                    Signing costs one transaction fee. No asset moves and{" "}
                    {check.data ? (
                      <>
                        app{" "}
                        <a
                          href={peraApp(check.data.identityApp)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-accent"
                        >
                          {check.data.identityApp} <ArrowUpRight size={11} />
                        </a>
                      </>
                    ) : (
                      "the Identity Registry"
                    )}{" "}
                    takes custody of nothing.
                  </p>
                </div>
              </Sheet>
            )
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The pre-flight, shown whether or not it found a problem. A check that only
 * appears when it fails leaves the user unsure it ran.
 */
function PrecheckPanel({
  state,
  error,
  data,
  addressOk,
  domain,
}: {
  state: "idle" | "checking" | "done" | "failed";
  error: string | null;
  data: AddressCheckResult | null;
  addressOk: boolean;
  domain: string;
}) {
  if (state === "idle") {
    return (
      <Sheet>
        <p className="px-4 py-4 text-[12.5px] leading-relaxed text-neutral-400">
          Enter an address and the registry is checked before anything is composed — one box read against{" "}
          <span className="font-mono text-[12px]">ad_&lt;public key&gt;</span> and one against{" "}
          <span className="font-mono text-[12px]">dm_&lt;domain&gt;</span>.
        </p>
      </Sheet>
    );
  }

  if (state === "failed") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3.5">
        <p className="text-[12.5px] font-semibold text-rose-700">Could not read the Identity Registry</p>
        <p className="mt-1 font-mono text-[11.5px] leading-relaxed text-neutral-600">{error}</p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">
          Nothing is cached here, so this reports the failure rather than assuming the address is free.
        </p>
      </div>
    );
  }

  const checking = state === "checking";
  const registered = (data?.addressAgentId ?? 0) > 0;
  const taken = (data?.domainAgentId ?? 0) > 0;

  return (
    <Sheet>
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[12.5px] font-semibold text-neutral-900">Checked against the chain</h3>
          {checking && <Loader2 size={12} className="animate-spin text-neutral-400" />}
          {data?.expectedAgentId != null && !registered && (
            <span className="ml-auto text-[11.5px] text-neutral-400">
              would become agent #{data.expectedAgentId}
            </span>
          )}
        </div>

        {addressOk && (
          <Row
            ok={!registered}
            title={registered ? "This address is already an agent" : "This address is not registered"}
            body={
              registered && data?.addressAgent ? (
                <>
                  It is agent #{data.addressAgentId},{" "}
                  <span className="font-mono text-[11.5px]">{data.addressAgent.domain}</span>, registered{" "}
                  {whenIso(data.addressAgent.registeredAt)}. The contract asserts one identity per address, so a
                  second <span className="font-mono text-[11.5px]">new_agent</span> from it fails with a bare
                  assert that names nothing. Sign from a different address, or use{" "}
                  <span className="font-mono text-[11.5px]">update_agent</span> to move that id to a new domain.{" "}
                  <a
                    href={peraAddress(data.addressAgent.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-accent"
                  >
                    Check it <ArrowUpRight size={10} />
                  </a>
                </>
              ) : (
                <>
                  No <span className="font-mono text-[11.5px]">ad_</span> box holds its public key, so the
                  one-identity-per-address assert would pass.
                </>
              )
            }
          />
        )}

        {domain && (
          <Row
            ok={!taken}
            title={taken ? `${domain} is already registered` : `${domain} is free`}
            body={
              taken ? (
                <>
                  It belongs to agent #{data?.domainAgentId}. One identity per domain is also a contract assert.
                </>
              ) : (
                <>
                  No <span className="font-mono text-[11.5px]">dm_</span> box exists for it.
                </>
              )
            }
          />
        )}
      </div>
    </Sheet>
  );
}

function Row({ ok, title, body }: { ok: boolean; title: string; body: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
        )}
      >
        {ok ? <Check size={12} /> : <AlertTriangle size={12} />}
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-neutral-800">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-500">{body}</p>
      </div>
    </div>
  );
}
