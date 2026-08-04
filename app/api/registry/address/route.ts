import { NextResponse } from "next/server";
import {
  REGISTRY,
  agentCount,
  getRegisteredAgent,
  isAlgorandAddress,
  resolveByAddress,
  resolveByDomain,
} from "@/lib/registry-chain";

/**
 * "Is this address already an agent, and is this domain taken?"
 *
 * Asked before composing `new_agent`, because the contract asserts both and an
 * assert is all a failed call reports — `assert failed` with a program counter,
 * no mention of which of the two conditions tripped. Checking here costs a box
 * read; finding out on chain costs a fee and tells the user nothing.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const address = (params.get("address") ?? "").trim();
  const domain = (params.get("domain") ?? "").trim();

  if (!address && !domain) {
    return NextResponse.json(
      { error: "Pass ?address= or ?domain= (or both)." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const validAddress = address ? isAlgorandAddress(address) : null;

  try {
    const [addressAgentId, domainAgentId, nextId] = await Promise.all([
      address && validAddress ? resolveByAddress(address) : Promise.resolve(0),
      domain ? resolveByDomain(domain) : Promise.resolve(0),
      agentCount().catch(() => null),
    ]);

    const [addressAgent, domainAgent] = await Promise.all([
      addressAgentId ? getRegisteredAgent(addressAgentId) : Promise.resolve(null),
      domainAgentId ? getRegisteredAgent(domainAgentId) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      {
        identityApp: REGISTRY.identity,
        address: address || null,
        // Null when no address was passed; false when one was and it is not a
        // well-formed Algorand address, checksum included.
        addressValid: validAddress,
        /** 0 is the contract's own "not registered" sentinel. */
        addressAgentId,
        addressAgent,
        domain: domain || null,
        domainAgentId,
        domainAgent,
        /** `agent_count + 1` — the id `new_agent` would write next, and the
         *  `ag_` box the call has to name before it exists. */
        expectedAgentId: nextId == null ? null : nextId + 1,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}
