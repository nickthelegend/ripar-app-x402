import { NextResponse } from "next/server";
import {
  REGISTRY,
  agentCount,
  getScores,
  listRegisteredAgents,
  testnetRound,
  type AgentScore,
} from "@/lib/registry-chain";

/**
 * The Identity Registry's own directory: every `ag_` box on app 769444119,
 * with whatever the Reputation Registry has recorded against each id.
 *
 * This is NOT the Agents view's list. That one is derived from settlement
 * history — an address that has been paid — and the two can disagree in both
 * directions. An agent can register and never earn; an address can earn and
 * never register. Saying which is which is the whole reason both exist.
 */

// A registry is mutable, and each box is its own request. Caching this would
// freeze the directory at deploy time and present it as current.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [agents, counter, round] = await Promise.all([
      listRegisteredAgents(),
      agentCount().catch(() => null),
      testnetRound().catch(() => null),
    ]);

    const scores = await getScores(agents.map((a) => a.agentId));

    return NextResponse.json(
      {
        source: "algod box storage, Algorand TestNet",
        identityApp: REGISTRY.identity,
        reputationApp: REGISTRY.reputation,
        round,
        /** The highest id ever ISSUED, not a live count. Ids are never reused,
         *  so this is also the id the next registration would take. */
        agentCount: counter,
        agents: agents.map((a) => ({
          ...a,
          score: (scores.get(a.agentId) ?? null) as AgentScore | null,
        })),
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    // No fallback list. An empty table and an unreachable node are completely
    // different facts and must never render the same.
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}
