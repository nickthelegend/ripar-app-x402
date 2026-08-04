/**
 * Which registry call is legal next, and who the contract will accept it from.
 *
 * Every clause below is an `assert` in the deployed contracts, not a
 * convention: only the client may assign, fund, name a validator or cancel;
 * only the assignee's registered address may submit; only the named validator
 * may judge, or the client when none was named; escrow is released on a passing
 * verdict and refunded on a failing or cancelled one, and either way only while
 * an `es_` box still exists.
 *
 * Pure and dependency-free so both halves of the app can use it — the view
 * renders these rows, and the compose route refuses anything not in this list
 * rather than handing back a transaction the chain will reject for a fee.
 */

import type { JobStatusName, RegistryJob } from "./registry-chain";

export type ActionId =
  | "assign_job"
  | "set_validator"
  | "fund_job"
  | "cancel_job"
  | "submit_result"
  | "validation_response"
  | "release_escrow"
  | "refund_escrow";

export type LegalAction = {
  id: ActionId;
  /** The ABI signature, verbatim, so a reader can check it against the app. */
  signature: string;
  label: string;
  /** Who the contract will accept this from, in plain language. */
  who: string;
  /** The address, when the contract pins it to exactly one. */
  whoAddress: string | null;
  what: string;
  /** True when this call moves the escrow asset rather than only a record. */
  movesMoney: boolean;
};

export const ACTION_SIGNATURES: Record<ActionId, string> = {
  assign_job: "assign_job(uint64,uint64)bool",
  set_validator: "set_validator(uint64,uint64)bool",
  fund_job: "fund_job(axfer,uint64)uint64",
  cancel_job: "cancel_job(uint64)bool",
  submit_result: "submit_result(uint64,byte[])bool",
  validation_response: "validation_response(uint64,bool)uint64",
  release_escrow: "release_escrow(uint64)uint64",
  refund_escrow: "refund_escrow(uint64)uint64",
};

export type JobContext = {
  job: RegistryJob;
  escrowMicro: number;
  disputeWindowSecs: number;
  /** Controlling address of the assignee, when the Identity Registry has one. */
  assigneeAddress: string | null;
  /** Controlling address of the named validator, when there is one. */
  validatorAddress: string | null;
  /** Unix seconds. Passed in rather than read, so a render and a compose that
   *  disagree by a second cannot disagree about legality. */
  now: number;
};

/**
 * The dispute window closes `dispute_window` seconds after the VERDICT, and the
 * verdict is the last thing that touched a validated job — so `updated_at` is
 * the verdict time. After it, `release_escrow` accepts anyone: a validator who
 * never returns would otherwise freeze the worker's money for good, and a lock
 * with no key is not escrow.
 */
export function disputeWindowClosesAt(job: RegistryJob, disputeWindowSecs: number): number {
  return job.updatedAt + disputeWindowSecs;
}

export function legalActions(ctx: JobContext): LegalAction[] {
  const { job, escrowMicro, assigneeAddress, validatorAddress } = ctx;
  const funded = escrowMicro > 0;
  const out: LegalAction[] = [];

  const clientOnly = (id: ActionId, label: string, what: string, movesMoney = false) =>
    out.push({
      id,
      signature: ACTION_SIGNATURES[id],
      label,
      who: "The client, and nobody else",
      whoAddress: job.client,
      what,
      movesMoney,
    });

  switch (job.status) {
    case "open":
      clientOnly("assign_job", "Assign an agent", "Names the agent that may submit a result. Only legal while the job is open.");
      clientOnly("set_validator", "Name the validator", "Fixes who judges the result. Legal only while open — changing it after assignment changes the terms the assignee accepted.");
      clientOnly("fund_job", "Fund the escrow", "Moves the budget into the contract's custody, as a transfer sitting next to the call in one group.", true);
      clientOnly("cancel_job", "Cancel", "Withdraws the job. An assigned job cannot be cancelled.");
      break;

    case "assigned":
      out.push({
        id: "submit_result",
        signature: ACTION_SIGNATURES.submit_result,
        label: "Submit the result hash",
        who: assigneeAddress
          ? `Agent #${job.serverAgentId}, resolved through the Identity Registry`
          : `Agent #${job.serverAgentId} — but the Identity Registry has no ag_ box for that id, so the contract's own resolution would fail too`,
        whoAddress: assigneeAddress,
        what: "Commits a 32-byte sha256 of the delivered work. The payload stays offchain; only its hash goes on the record.",
        movesMoney: false,
      });
      clientOnly("fund_job", "Fund the escrow", "Still legal while assigned — funding is accepted right up until a result is submitted.", true);
      break;

    case "submitted":
      out.push(
        job.validatorAgentId > 0
          ? {
              id: "validation_response",
              signature: ACTION_SIGNATURES.validation_response,
              label: "Judge the result",
              who: `Agent #${job.validatorAgentId}, the named validator`,
              whoAddress: validatorAddress,
              what: "Passing sends the job to validated; failing sends it to disputed. Either way the verdict is written to the assignee's score and is terminal.",
              movesMoney: false,
            }
          : {
              id: "validation_response",
              signature: ACTION_SIGNATURES.validation_response,
              label: "Judge the result",
              who: "The client — no validator was named, so it judges its own job",
              whoAddress: job.client,
              what: "Passing sends the job to validated; failing sends it to disputed. Either way the verdict is written to the assignee's score and is terminal.",
              movesMoney: false,
            }
      );
      break;

    case "validated":
      if (funded) {
        const closes = disputeWindowClosesAt(job, ctx.disputeWindowSecs);
        const open = ctx.now <= closes;
        out.push({
          id: "release_escrow",
          signature: ACTION_SIGNATURES.release_escrow,
          label: "Release the escrow",
          who: open
            ? "The client now; anyone once the dispute window closes"
            : "Anyone — the dispute window has closed",
          whoAddress: open ? job.client : null,
          what: `Pays the whole escrow to agent #${job.serverAgentId}. The contract deletes the es_ box before it sends, which is what makes paying twice impossible.`,
          movesMoney: true,
        });
      }
      break;

    case "disputed":
    case "cancelled":
      if (funded) {
        out.push({
          id: "refund_escrow",
          signature: ACTION_SIGNATURES.refund_escrow,
          label: "Refund the escrow",
          who: "Anyone — the contract puts no condition on the sender",
          whoAddress: null,
          what: "Returns the escrow to the client. The destination is read off the job, not from the sender, so triggering a refund can never redirect one.",
          movesMoney: true,
        });
      }
      break;

    default:
      break;
  }

  return out;
}

/** One line for a job with nothing legal left, so a row is never blank. */
export function nothingLegalReason(status: JobStatusName, funded: boolean): string {
  switch (status) {
    case "validated":
      return funded
        ? ""
        : "Terminal, and no es_ box exists — either the job was never funded, or the escrow has already been paid out.";
    case "disputed":
      return funded ? "" : "Terminal. No es_ box exists, so there is nothing to refund.";
    case "cancelled":
      return funded ? "" : "Withdrawn before assignment, holding nothing.";
    case "unknown":
      return "This status code is not one the deployed contract defines. Shown raw rather than guessed at.";
    default:
      return "";
  }
}
