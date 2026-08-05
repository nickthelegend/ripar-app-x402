import { NextResponse } from "next/server";
import {
  REGISTRY,
  getEscrowTerms,
  getEscrows,
  listJobs,
  listRegisteredAgents,
  testnetRound,
} from "@/lib/registry-chain";
import { disputeWindowClosesAt, legalActions, nothingLegalReason } from "@/lib/registry-actions";

/**
 * The onchain job board, with the two money facts kept apart.
 *
 * A BUDGET is a number the client wrote into the job struct. An ESCROW is what
 * app 768634000 is actually holding, in its own `es_` box. Posting a job moves
 * nothing, so a job showing a budget of 1.0 and an escrow of 0 is unfunded —
 * and that is the single most useful thing to know before doing the work.
 * Collapsing the two would let this board report an intention as a guarantee.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [jobs, terms] = await Promise.all([listJobs(), getEscrowTerms()]);
    const [escrows, agents, round] = await Promise.all([
      getEscrows(),
      listRegisteredAgents().catch(() => []),
      testnetRound().catch(() => null),
    ]);

    const byId = new Map(agents.map((a) => [a.agentId, a]));
    // One clock for the whole response. Reading it per job would let two rows
    // in the same payload disagree about whether a dispute window has closed.
    const now = Math.floor(Date.now() / 1000);

    const rows = jobs.map((job) => {
      const escrowMicro = escrows.get(job.jobId) ?? 0;
      const assignee = job.serverAgentId ? (byId.get(job.serverAgentId) ?? null) : null;
      const validator = job.validatorAgentId ? (byId.get(job.validatorAgentId) ?? null) : null;
      const actions = legalActions({
        job,
        escrowMicro,
        disputeWindowSecs: terms.disputeWindowSecs,
        assigneeAddress: assignee?.address ?? null,
        validatorAddress: validator?.address ?? null,
        now,
      });

      return {
        ...job,
        escrowMicro,
        escrowUnits: escrowMicro / 1e6,
        funded: escrowMicro > 0,
        fullyFunded: escrowMicro >= job.budgetMicro,
        /** Budget not backed by money. Floors at 0 — fund_job adds to whatever
         *  is held, so over-funding is possible and is not a negative shortfall. */
        unfundedMicro: Math.max(job.budgetMicro - escrowMicro, 0),
        assignee,
        validator,
        actions,
        nothingLegal: actions.length === 0 ? nothingLegalReason(job.status, escrowMicro > 0) : null,
        disputeWindowClosesAt:
          job.status === "validated" ? disputeWindowClosesAt(job, terms.disputeWindowSecs) : null,
      };
    });

    const escrowedMicro = [...escrows.values()].reduce((sum, v) => sum + v, 0);

    return NextResponse.json(
      {
        source: "algod box storage, Algorand TestNet",
        validationApp: REGISTRY.validation,
        round,
        now,
        terms,
        totals: {
          jobs: rows.length,
          fundedJobs: escrows.size,
          escrowedMicro,
          /** Every job except the cancelled ones, which are not owed anything. */
          budgetStatedMicro: rows
            .filter((j) => j.status !== "cancelled")
            .reduce((sum, j) => sum + j.budgetMicro, 0),
        },
        jobs: rows,
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
