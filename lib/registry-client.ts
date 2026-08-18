"use client";

import { useCallback, useEffect, useState } from "react";
import type { LegalAction } from "./registry-actions";
import type { AgentScore, EscrowTerms, RegisteredAgent, RegistryJob } from "./registry-chain";

/**
 * The browser half of the registry surfaces.
 *
 * Reads go through this app's own routes rather than straight to algod. Not for
 * CORS — AlgoNode allows the browser — but because decoding an ARC-4 box means
 * shipping algosdk, and because one server round-trip replaces a box listing
 * plus a read per box. The routes cache nothing, so this is still a live read.
 */

export type Loadable<T> = { data: T | null; status: "loading" | "ready" | "error"; error: string | null };

export type DirectoryAgent = RegisteredAgent & { score: AgentScore | null };

export type Directory = {
  identityApp: number;
  reputationApp: number;
  round: number | null;
  agentCount: number | null;
  agents: DirectoryAgent[];
};

export type BoardJob = RegistryJob & {
  escrowMicro: number;
  escrowUnits: number;
  funded: boolean;
  fullyFunded: boolean;
  unfundedMicro: number;
  assignee: RegisteredAgent | null;
  validator: RegisteredAgent | null;
  actions: LegalAction[];
  nothingLegal: string | null;
  disputeWindowClosesAt: number | null;
};

export type Board = {
  validationApp: number;
  round: number | null;
  now: number;
  terms: EscrowTerms;
  totals: { jobs: number; fundedJobs: number; escrowedMicro: number; budgetStatedMicro: number };
  jobs: BoardJob[];
};

export type AddressCheckResult = {
  identityApp: number;
  address: string | null;
  addressValid: boolean | null;
  addressAgentId: number;
  addressAgent: RegisteredAgent | null;
  domain: string | null;
  domainAgentId: number;
  domainAgent: RegisteredAgent | null;
  expectedAgentId: number | null;
};

export type UnsignedTxn = {
  signed: false;
  index: number;
  kind: "appl" | "axfer";
  unsignedTxnBase64: string;
  txId: string;
  fee: number;
  boxes: string[];
  summary: string;
};

/** Mirrors SimulationResult in lib/registry-compose — algod's verdict on a
 *  transaction nobody has signed yet. Null means the node could not be asked,
 *  which the panel must show differently from a rejection. */
export type SimulationResult = {
  ok: boolean;
  failure: string | null;
  budgetConsumed: number | null;
  round: number | null;
};

export type ComposedCall = {
  simulation: SimulationResult | null;
  /** base64 of the 32-byte replay lease. */
  lease?: string;
  signed: false;
  network: "testnet";
  appId: number;
  method: string;
  sender: string;
  summary: string;
  effects: string[];
  args: Record<string, unknown>;
  groupId: string | null;
  transactions: UnsignedTxn[];
  totalFee: number;
  validRounds: { first: number; last: number };
  nextSteps: string[];
};

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  if (!body) throw new Error("The route answered with something that is not JSON.");
  return body;
}

/** One poller shape for both registry views: load, poll, drop cleanly. */
function usePolled<T>(url: string, everyMs = 30_000): Loadable<T> & { reload: () => void } {
  const [state, setState] = useState<Loadable<T>>({ data: null, status: "loading", error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const ac = new AbortController();

    const load = async () => {
      try {
        const data = await readJson<T>(url, { signal: ac.signal });
        if (!stopped) setState({ data, status: "ready", error: null });
      } catch (e) {
        if (stopped || (e as Error).name === "AbortError") return;
        // The previous answer is dropped rather than left on screen labelled
        // live. Stale registry rows are the failure mode worth avoiding.
        setState({ data: null, status: "error", error: (e as Error).message });
      }
      if (!stopped) timer = setTimeout(load, everyMs);
    };

    void load();
    return () => {
      stopped = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, [url, everyMs, nonce]);

  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export const useDirectory = () => usePolled<Directory>("/api/registry/agents");
export const useBoard = () => usePolled<Board>("/api/registry/jobs");

/** Checks an address and a domain against the registry before composing. */
export async function checkRegistration(input: {
  address?: string;
  domain?: string;
}): Promise<AddressCheckResult> {
  const qs = new URLSearchParams();
  if (input.address) qs.set("address", input.address);
  if (input.domain) qs.set("domain", input.domain);
  return readJson<AddressCheckResult>(`/api/registry/address?${qs.toString()}`);
}

/** Composes an unsigned transaction. Never returns anything signed — there is
 *  no key in this app to sign with. */
export async function compose(body: Record<string, unknown>): Promise<ComposedCall> {
  return readJson<ComposedCall>("/api/registry/compose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const unitsFmt = (micro: number, decimals = 2) =>
  (micro / 1e6).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: 6 });

export const whenIso = (unixSeconds: number) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
