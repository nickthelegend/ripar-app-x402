import { NextResponse } from "next/server";
import {
  agentCount,
  getEscrowTerms,
  getEscrows,
  getJob,
  getRegisteredAgent,
  isAlgorandAddress,
  resolveByAddress,
  resolveByDomain,
} from "@/lib/registry-chain";
import { disputeWindowClosesAt, legalActions, type ActionId } from "@/lib/registry-actions";
import {
  ComposeError,
  composeAcceptBid,
  composeAssignJob,
  composeCancelJob,
  composeFundJob,
  composeNewAgent,
  composePlaceBid,
  composeRefundEscrow,
  composeRotateAddress,
  composeReleaseEscrow,
  composeSetValidator,
  composeSubmitResult,
  composeValidationResponse,
  type ComposedCall,
} from "@/lib/registry-compose";

/**
 * Compose an UNSIGNED registry transaction.
 *
 * The one rule this route exists to enforce: it returns transaction bytes and
 * never a signature. There is no key here, no mnemonic parameter, and no code
 * path that could produce a signed transaction if one were supplied — the
 * response is base64 msgpack plus a plain-language account of what signing it
 * would do, and the wallet that holds the address decides.
 *
 * The second rule: it refuses to compose a call the chain would reject. Every
 * precondition is re-read here rather than trusted from the client, because the
 * board the user is looking at is a snapshot and an assert failure on chain
 * costs a fee and reports only a program counter.
 */

export const dynamic = "force-dynamic";

type Body = {
  action: ActionId | "new_agent" | "rotate_address";
  sender?: string;
  domain?: string;
  jobId?: number;
  agentId?: number;
  resultHash?: string;
  passed?: boolean;
  amountMicro?: number;
  newAddress?: string;
  noteHash?: string;
  bidAmountMicro?: number;
  postedBudgetMicro?: number;
};

const bad = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("Body must be JSON.");
  }

  const sender = (body.sender ?? "").trim();
  if (!sender) return bad("A sender address is required — it is the account that would sign.");
  if (!isAlgorandAddress(sender)) {
    return bad(
      "That is not a well-formed Algorand address. Fifty-eight base32 characters, the last four a SHA-512/256 checksum."
    );
  }

  try {
    const composed = await dispatch(body, sender);
    return NextResponse.json(composed, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ComposeError) return bad(e.message, 409);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}

async function dispatch(body: Body, sender: string): Promise<ComposedCall> {
  // Identity actions carry no job, and the job-id guard below would otherwise
  // reject them with "A job id of 1 or more is required" — an error about a
  // field the caller was right not to send.
  if (body.action === "rotate_address") {
    const agentId = Number(body.agentId);
    const newAddress = String(body.newAddress ?? "").trim();

    // Checked here so the caller reads a sentence instead of a bare assert. The
    // contract takes the CURRENT holder from Txn.sender, so signing from an
    // address that does not control the agent fails on chain with nothing that
    // says why.
    const controls = await resolveByAddress(sender);
    if (controls === 0) {
      throw new ComposeError(
        `${sender} controls no agent, so it cannot rotate one. Only the address that holds an identity today can move it.`,
      );
    }
    if (agentId && controls !== agentId) {
      throw new ComposeError(
        `${sender} controls agent #${controls}, not #${agentId}. The contract reads the holder from the signer, so this would rotate the wrong identity or fail outright.`,
      );
    }
    // Checked BEFORE the taken-address lookup. Rotating onto yourself trips that
    // lookup too — your own address obviously already controls your own agent —
    // and the caller then reads "already controls agent #1, one address holds at
    // most one identity", which is true, unhelpful, and not why this was
    // refused.
    if (newAddress === sender) {
      throw new ComposeError(
        `${sender} is the address signing this, so rotating agent #${agentId || controls} onto it would change nothing. ` +
          "Rotation moves an identity to a DIFFERENT address; give the one you want to hold it next.",
      );
    }

    const takenBy = await resolveByAddress(newAddress);
    if (takenBy > 0) {
      throw new ComposeError(
        `${newAddress} already controls agent #${takenBy}. One address holds at most one identity, so the contract would reject this.`,
      );
    }
    return composeRotateAddress({ sender, agentId: agentId || controls, newAddress });
  }

  if (body.action === "new_agent") {
    const domain = (body.domain ?? "").trim();
    if (!domain) throw new ComposeError("A domain is required.");

    // Both asserts, checked here so the user reads a sentence rather than a
    // program counter. The address check is the one that matters: `new_agent`
    // allows exactly one identity per address, and a second attempt fails with
    // a bare `assert failed` that names nothing.
    const [already, domainTaken, counter] = await Promise.all([
      resolveByAddress(sender),
      resolveByDomain(domain),
      agentCount(),
    ]);

    if (already > 0) {
      const existing = await getRegisteredAgent(already);
      throw new ComposeError(
        `${sender} is already agent #${already}${existing ? ` (${existing.domain})` : ""}. ` +
          "The contract allows one identity per address and rejects a second registration with a bare assert. " +
          "Use update_agent to move that agent to a new domain, or sign from a different address."
      );
    }
    if (domainTaken > 0) {
      throw new ComposeError(
        `The domain ${domain} is already registered to agent #${domainTaken}. ` +
          "The contract keeps one identity per domain, so this call would fail."
      );
    }

    return composeNewAgent({ sender, domain, expectedAgentId: counter + 1 });
  }

  /* ── everything else is a job action, so the job is read first ────────── */

  const jobId = Number(body.jobId);
  if (!Number.isInteger(jobId) || jobId < 1) throw new ComposeError("A job id of 1 or more is required.");

  const [job, terms] = await Promise.all([getJob(jobId), getEscrowTerms()]);
  if (!job) throw new ComposeError(`No job #${jobId} in ValidationRegistry ${terms.validationApp}.`);

  const escrows = await getEscrows();
  const escrowMicro = escrows.get(jobId) ?? 0;
  const now = Math.floor(Date.now() / 1000);

  const [assignee, validator] = await Promise.all([
    job.serverAgentId ? getRegisteredAgent(job.serverAgentId) : Promise.resolve(null),
    job.validatorAgentId ? getRegisteredAgent(job.validatorAgentId) : Promise.resolve(null),
  ]);

  const legal = legalActions({
    job,
    escrowMicro,
    disputeWindowSecs: terms.disputeWindowSecs,
    assigneeAddress: assignee?.address ?? null,
    validatorAddress: validator?.address ?? null,
    now,
  });

  const allowed = legal.find((a) => a.id === body.action);
  if (!allowed) {
    throw new ComposeError(
      `${body.action} is not legal on job #${jobId} while it is ${job.status}` +
        (escrowMicro > 0 ? ` holding ${escrowMicro} base units of escrow` : " holding no escrow") +
        `. What is legal: ${legal.length ? legal.map((a) => a.id).join(", ") : "nothing"}.`
    );
  }
  // The contract pins some calls to exactly one address. Composing for anyone
  // else produces a transaction that fails for a fee.
  if (allowed.whoAddress && allowed.whoAddress !== sender) {
    throw new ComposeError(
      `The contract accepts ${body.action} on job #${jobId} only from ${allowed.whoAddress} (${allowed.who}). ` +
        `${sender} would be rejected by an assert.`
    );
  }

  switch (body.action) {
    case "place_bid":
      return composePlaceBid({
        sender,
        jobId,
        agentId: Number(body.agentId),
        amountMicro: Number(body.amountMicro),
        // The spec behind a bid stays offchain; the chain carries its hash.
        noteHashHex: String(body.noteHash ?? "0x" + "00".repeat(32)),
      });

    case "accept_bid":
      return composeAcceptBid({
        sender,
        jobId,
        agentId: Number(body.agentId),
        bidAmountMicro: body.bidAmountMicro != null ? Number(body.bidAmountMicro) : undefined,
        postedBudgetMicro: body.postedBudgetMicro != null ? Number(body.postedBudgetMicro) : undefined,
      });

    case "assign_job":
      return composeAssignJob({ sender, jobId, serverAgentId: Number(body.agentId) });

    case "set_validator":
      return composeSetValidator({ sender, jobId, validatorAgentId: Number(body.agentId ?? 0) });

    case "cancel_job":
      return composeCancelJob({ sender, jobId });

    case "submit_result":
      return composeSubmitResult({
        sender,
        jobId,
        serverAgentId: job.serverAgentId,
        resultHashHex: body.resultHash ?? "",
        identityApp: terms.identityApp,
      });

    case "validation_response":
      if (typeof body.passed !== "boolean") {
        throw new ComposeError("`passed` must be true or false — the verdict is the whole argument.");
      }
      return composeValidationResponse({
        sender,
        jobId,
        passed: body.passed,
        serverAgentId: job.serverAgentId,
        validatorAgentId: job.validatorAgentId,
        identityApp: terms.identityApp,
        reputationApp: terms.reputationApp,
      });

    case "fund_job":
      return composeFundJob({
        sender,
        jobId,
        amountMicro: Number(body.amountMicro),
        assetId: terms.assetId,
        appAddress: terms.appAddress,
        escrowBeforeMicro: escrowMicro,
        budgetMicro: job.budgetMicro,
      });

    case "release_escrow":
      if (!assignee) {
        throw new ComposeError(
          `Job #${jobId} names agent #${job.serverAgentId} as its assignee, but the Identity Registry has no ag_ box for that id. ` +
            "The contract resolves the payee the same way and would fail."
        );
      }
      return composeReleaseEscrow({
        sender,
        jobId,
        serverAgentId: job.serverAgentId,
        assigneeAddress: assignee.address,
        assigneeDomain: assignee.domain,
        escrowMicro,
        assetId: terms.assetId,
        identityApp: terms.identityApp,
        client: job.client,
        windowClosesAt: disputeWindowClosesAt(job, terms.disputeWindowSecs),
        now,
      });

    case "refund_escrow":
      return composeRefundEscrow({
        sender,
        jobId,
        client: job.client,
        escrowMicro,
        assetId: terms.assetId,
        jobStatus: job.status,
      });

    default:
      throw new ComposeError(`Unknown action: ${String(body.action)}`);
  }
}
