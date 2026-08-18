/**
 * The write side — and the reason this app can be pointed at a wallet without
 * anyone auditing it for key handling.
 *
 * **There is no signing code here and there never will be.** No mnemonic
 * parameter, no `algosdk.signTransaction` import, no env var read for a secret.
 * A write returns the composed, UNSIGNED transaction as base64 msgpack plus a
 * plain-language description of what signing it would do. Whoever holds the key
 * — a human in Pera or Defly, a wallet extension, a signing service — makes
 * that decision, and this app never sees it.
 *
 * That is a constraint, not an unfinished feature. Splitting compose from sign
 * puts a person between choosing to spend and spending, and the base64 blob is
 * exactly what a wallet expects, so the split costs the user one paste.
 */

import algosdk from "algosdk";
import {
  REGISTRY,
  TESTNET_ALGOD,
  addressBoxName,
  agentBoxName,
  domainBoxName,
  escrowBoxName,
  formatUnits,
  jobBoxName,
  scoreBoxName,
  uint64Bytes,
} from "./registry-chain";

const {
  ABIMethod,
  ABIType,
  assignGroupID,
  encodeUnsignedTransaction,
  makeApplicationNoOpTxnFromObject,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
} = algosdk;

/**
 * A box the call must declare, and which app owns it.
 *
 * `appId` matters because box references are shared across a group by app id:
 * when the ValidationRegistry resolves an agent by inner call into the
 * IdentityRegistry, the IDENTITY app's `ag_` box has to be listed on the OUTER
 * transaction, or the inner call fails on an unavailable box with an error that
 * names neither the box nor the app.
 */
type BoxRef = { name: Uint8Array; appId?: number };

export type UnsignedTxn = {
  /** Always false. Present so a caller cannot mistake this for a submitted tx. */
  signed: false;
  index: number;
  kind: "appl" | "axfer";
  /** base64 msgpack, ready to hand to a wallet. */
  unsignedTxnBase64: string;
  /** The id this will have once signed. Signing does not change it. */
  txId: string;
  fee: number;
  boxes: string[];
  summary: string;
};

/**
 * The chain's verdict on a transaction nobody has signed.
 *
 * Composing a well-formed transaction is not the same as composing one that
 * works. The app used to hand over base64 and a list of what signing "would" do,
 * with no evidence for any of it: a box name off by one, a stale agent_count, a
 * sender who is not the owner — all compose cleanly and all fail on submit,
 * after the user has signed.
 *
 * algod's simulate endpoint runs the program with `allow-empty-signatures`, so
 * the answer is the real AVM's, not a guess about it.
 */
export type SimulationResult = {
  ok: boolean;
  /** The AVM's own message when it rejects, e.g. which assert failed. */
  failure: string | null;
  /** Opcode budget the call actually consumed, when it succeeded. */
  budgetConsumed: number | null;
  round: number | null;
};

export type ComposedCall = {
  signed: false;
  network: "testnet";
  appId: number;
  method: string;
  sender: string;
  /** Human-readable, so a signer can check the numbers without decoding msgpack. */
  summary: string;
  /** Every consequence of signing, one clause each. */
  effects: string[];
  args: Record<string, unknown>;
  /** base64 of the 32-byte group id, when there is more than one transaction. */
  groupId: string | null;
  /**
   * What algod says would happen if this were submitted, asked BEFORE anyone is
   * invited to sign it. Null only when the node could not be reached — an
   * unreachable node and a rejected transaction are different facts.
   */
  simulation: SimulationResult | null;
  transactions: UnsignedTxn[];
  totalFee: number;
  validRounds: { first: number; last: number };
  nextSteps: string[];
};

export class ComposeError extends Error {}

/* ── suggested params ──────────────────────────────────────────────────── */

type AlgodParams = {
  fee: number;
  "min-fee": number;
  "last-round": number;
  "genesis-id": string;
  "genesis-hash": string;
};

async function suggestedParams(): Promise<algosdk.SuggestedParams> {
  const res = await fetch(`${TESTNET_ALGOD}/v2/transactions/params`, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new ComposeError(`Could not fetch suggested params: ${res.status} ${res.statusText}`);
  }
  const p = (await res.json()) as AlgodParams;
  return {
    fee: p.fee,
    minFee: p["min-fee"],
    firstValid: p["last-round"],
    lastValid: p["last-round"] + 1000,
    genesisID: p["genesis-id"],
    genesisHash: new Uint8Array(Buffer.from(p["genesis-hash"], "base64")),
    flatFee: false,
  };
}

/* ── the generic app call ──────────────────────────────────────────────── */

type CallSpec = {
  sender: string;
  appId: number;
  signature: string;
  encodedArgs: Uint8Array[];
  boxes?: BoxRef[];
  /** Apps reached by inner call. Unlisted, the inner call is refused. */
  foreignApps?: number[];
  /** Assets an inner transaction moves. Unlisted, the transfer is refused. */
  foreignAssets?: number[];
  /** Accounts an inner transaction pays. Unlisted, the payment is refused. */
  accounts?: string[];
  /**
   * How many inner transactions the contract will submit.
   *
   * algopy gives every inner transaction a fee of 0 by design, so the OUTER
   * call funds the whole pool: one minimum fee for itself plus one per inner.
   * Left at 0, the network's suggested fee is used — right for a call that
   * submits none, and short by exactly the missing inners for one that does,
   * failing with "fee too small" and nothing that points at the cause.
   */
  innerTransactions?: number;
};

function buildAppCall(params: algosdk.SuggestedParams, spec: CallSpec): algosdk.Transaction {
  // The selector is the first four bytes of sha512/256 over the exact signature
  // string, so it is derived rather than assembled — one character off and the
  // contract's router rejects the call.
  const method = ABIMethod.fromSignature(spec.signature);
  const inners = spec.innerTransactions ?? 0;
  return makeApplicationNoOpTxnFromObject({
    sender: spec.sender,
    appIndex: spec.appId,
    appArgs: [method.getSelector(), ...spec.encodedArgs],
    boxes: (spec.boxes ?? []).map((b) => ({ appIndex: b.appId ?? spec.appId, name: b.name })),
    foreignApps: spec.foreignApps,
    foreignAssets: spec.foreignAssets,
    accounts: spec.accounts,
    suggestedParams: inners
      ? { ...params, flatFee: true, fee: Number(params.minFee) * (1 + inners) }
      : params,
  });
}

/** `jb_` + eight raw bytes is unreadable; show the prefix and the number. */
function describeBox(ref: BoxRef, ownAppId: number): string {
  const prefix = Buffer.from(ref.name.slice(0, 3)).toString("utf8");
  const tail = ref.name.slice(3);
  const body =
    tail.length === 8
      ? `${prefix}${new DataView(tail.buffer, tail.byteOffset, 8).getBigUint64(0, false)}`
      : `${prefix}${/^[\x20-\x7e]*$/.test(Buffer.from(tail).toString("utf8")) && prefix === "dm_" ? Buffer.from(tail).toString("utf8") : `0x${Buffer.from(tail).toString("hex")}`}`;
  // A foreign box is the interesting case — say whose it is.
  return ref.appId && ref.appId !== ownAppId ? `${body}@${ref.appId}` : body;
}

const SIGN_STEPS = [
  "Nothing has been signed or submitted. This app holds no key and cannot do either.",
  "Decode the base64 and check the numbers in the summary against it before you sign.",
  "Sign with the wallet that holds the sender address, then POST the signed bytes to https://testnet-api.algonode.cloud/v2/transactions.",
];

async function oneCall(
  spec: CallSpec,
  meta: { summary: string; effects: string[]; args: Record<string, unknown>; nextSteps?: string[] }
): Promise<ComposedCall> {
  const params = await suggestedParams();
  const txn = buildAppCall(params, spec);
  const boxes = (spec.boxes ?? []).map((b) => describeBox(b, spec.appId));
  const encoded = Buffer.from(encodeUnsignedTransaction(txn)).toString("base64");
  const simulation = await simulate([encoded]);

  return {
    signed: false,
    network: "testnet",
    appId: spec.appId,
    method: spec.signature,
    sender: spec.sender,
    summary: meta.summary,
    effects: meta.effects,
    args: meta.args,
    groupId: null,
    simulation,
    transactions: [
      {
        signed: false,
        index: 0,
        kind: "appl",
        unsignedTxnBase64: encoded,
        txId: txn.txID(),
        fee: Number(txn.fee),
        boxes,
        summary: meta.summary,
      },
    ],
    totalFee: Number(txn.fee),
    validRounds: { first: Number(params.firstValid), last: Number(params.lastValid) },
    nextSteps: meta.nextSteps ?? SIGN_STEPS,
  };
}

/* ── identity: register an agent ───────────────────────────────────────── */

/**
 * Compose `new_agent(string)uint64`.
 *
 * The address is NOT an argument — the contract takes it from `Txn.sender`, so
 * a registration is self-attested by construction and nobody can register on
 * anybody else's behalf. That is also why the app cannot do this for the user:
 * whoever signs is who gets registered.
 *
 * `expectedAgentId` is `agent_count + 1` read at compose time. It has to be
 * read, because `new_agent` writes `ag_<agent_count + 1>` and a box that does
 * not exist yet still has to be named on the call.
 */
export async function composeNewAgent(input: {
  sender: string;
  domain: string;
  expectedAgentId: number;
}): Promise<ComposedCall> {
  const domain = input.domain.trim();
  // All three are contract asserts. Failing here costs nothing; failing on
  // chain costs a fee and reports only which assert line tripped.
  if (!domain) throw new ComposeError("A domain is required — the contract asserts it is non-empty.");
  if (domain.length > 253) {
    throw new ComposeError(`A domain of ${domain.length} characters will not fit a DNS name.`);
  }

  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.identity,
      signature: "new_agent(string)uint64",
      encodedArgs: [ABIType.from("string").encode(domain)],
      boxes: [
        { name: agentBoxName(input.expectedAgentId) },
        { name: domainBoxName(domain) },
        { name: addressBoxName(input.sender) },
      ],
    },
    {
      summary:
        `Register ${input.sender} as an agent in IdentityRegistry ${REGISTRY.identity}, ` +
        `claiming the domain ${domain}. It would become agent #${input.expectedAgentId}.`,
      effects: [
        `Writes ag_${input.expectedAgentId} — the agent record: id, domain, your address, and the block's timestamp twice.`,
        `Writes dm_${domain} and ad_<your public key>, the two reverse indexes that let anyone resolve this agent by domain or by address without walking every id.`,
        "Binds the identity to the address that SIGNS this, because the contract reads Txn.sender rather than an argument. Sign it with a different wallet and that wallet is the agent.",
        `Costs one transaction fee and nothing else. No asset moves, and app ${REGISTRY.identity} takes no custody of anything.`,
        `Nothing is served at ${domain} on your behalf — the registry records the domain, it does not check it. Publishing an agent card there is a separate job.`,
      ],
      args: {
        domain,
        sender: input.sender,
        expectedAgentId: input.expectedAgentId,
        identityApp: REGISTRY.identity,
      },
      nextSteps: [
        `This becomes agent #${input.expectedAgentId} unless someone else registers first, in which case the ag_ box reference is stale and the call fails harmlessly — recompose and try again.`,
        ...SIGN_STEPS,
      ],
    }
  );
}

/* ── validation: the job board ─────────────────────────────────────────── */

export async function composeAssignJob(input: {
  sender: string;
  jobId: number;
  serverAgentId: number;
}): Promise<ComposedCall> {
  if (!Number.isInteger(input.serverAgentId) || input.serverAgentId < 1) {
    throw new ComposeError("An agent id of 1 or more is required; the contract rejects 0.");
  }
  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.validation,
      signature: "assign_job(uint64,uint64)bool",
      encodedArgs: [uint64Bytes(input.jobId), uint64Bytes(input.serverAgentId)],
      boxes: [{ name: jobBoxName(input.jobId) }],
    },
    {
      summary: `Assign job #${input.jobId} to agent #${input.serverAgentId} on ValidationRegistry ${REGISTRY.validation}.`,
      effects: [
        `Moves job #${input.jobId} from open to assigned, and records agent #${input.serverAgentId} as the only party that may submit a result.`,
        "Only the client may sign this, and only while the job is open — the contract asserts both.",
        "Moves no money. Assignment and funding are separate calls on purpose.",
      ],
      args: { jobId: input.jobId, serverAgentId: input.serverAgentId },
    }
  );
}

export async function composeSetValidator(input: {
  sender: string;
  jobId: number;
  validatorAgentId: number;
}): Promise<ComposedCall> {
  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.validation,
      signature: "set_validator(uint64,uint64)bool",
      encodedArgs: [uint64Bytes(input.jobId), uint64Bytes(input.validatorAgentId)],
      boxes: [{ name: jobBoxName(input.jobId) }],
    },
    {
      summary:
        input.validatorAgentId > 0
          ? `Name agent #${input.validatorAgentId} as the validator for job #${input.jobId}.`
          : `Clear the validator on job #${input.jobId}, so the client judges its own result.`,
      effects: [
        input.validatorAgentId > 0
          ? `Only agent #${input.validatorAgentId}'s registered address will be able to judge the result.`
          : "With no validator named, the contract accepts a verdict only from the client.",
        "Legal only while the job is open. Once an agent is assigned the validator is fixed — changing who marks the work after someone accepted it changes the terms.",
      ],
      args: { jobId: input.jobId, validatorAgentId: input.validatorAgentId },
    }
  );
}

export async function composeCancelJob(input: { sender: string; jobId: number }): Promise<ComposedCall> {
  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.validation,
      signature: "cancel_job(uint64)bool",
      encodedArgs: [uint64Bytes(input.jobId)],
      boxes: [{ name: jobBoxName(input.jobId) }],
    },
    {
      summary: `Cancel job #${input.jobId} on ValidationRegistry ${REGISTRY.validation}.`,
      effects: [
        "Sets the job to cancelled. Client only, and only while it is still open.",
        "Does not move escrow. If the job was funded, refund_escrow is the separate call that returns it — and it pays the client whoever signs.",
      ],
      args: { jobId: input.jobId },
    }
  );
}

export async function composeSubmitResult(input: {
  sender: string;
  jobId: number;
  serverAgentId: number;
  resultHashHex: string;
  identityApp: number;
}): Promise<ComposedCall> {
  const hex = input.resultHashHex.trim().replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new ComposeError(
      `result_hash must be a 32-byte sha256 digest as 64 hex characters; got ${hex.length} character${hex.length === 1 ? "" : "s"}.`
    );
  }
  const bytes = new Uint8Array(Buffer.from(hex, "hex"));

  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.validation,
      signature: "submit_result(uint64,byte[])bool",
      encodedArgs: [uint64Bytes(input.jobId), ABIType.from("byte[]").encode(bytes)],
      boxes: [
        { name: jobBoxName(input.jobId) },
        // Read by the IdentityRegistry during the inner call that checks the
        // sender IS the assignee. Box references are group-wide by app id.
        { name: agentBoxName(input.serverAgentId), appId: input.identityApp },
      ],
      foreignApps: [input.identityApp],
      // agent_address() by inner app call.
      innerTransactions: 1,
    },
    {
      summary: `Commit ${hex} as the result of job #${input.jobId}.`,
      effects: [
        `Moves job #${input.jobId} from assigned to submitted and records the hash. The work itself stays offchain — only its sha256 goes on the record.`,
        `The contract resolves agent #${input.serverAgentId} through IdentityRegistry ${input.identityApp} and refuses any sender that is not that address. A check in an SDK is not a check.`,
        "Moves no money.",
      ],
      args: { jobId: input.jobId, resultHash: hex, serverAgentId: input.serverAgentId },
    }
  );
}

export async function composeValidationResponse(input: {
  sender: string;
  jobId: number;
  passed: boolean;
  serverAgentId: number;
  validatorAgentId: number;
  identityApp: number;
  reputationApp: number;
}): Promise<ComposedCall> {
  const boxes: BoxRef[] = [
    { name: jobBoxName(input.jobId) },
    // record_validation writes this score box inside the reputation app.
    { name: scoreBoxName(input.serverAgentId), appId: input.reputationApp },
  ];
  // Only resolved when a validator was named; with none, the contract checks
  // the client directly and never reaches the IdentityRegistry.
  if (input.validatorAgentId > 0) {
    boxes.push({ name: agentBoxName(input.validatorAgentId), appId: input.identityApp });
  }

  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.validation,
      signature: "validation_response(uint64,bool)uint64",
      encodedArgs: [uint64Bytes(input.jobId), ABIType.from("bool").encode(input.passed)],
      boxes,
      foreignApps:
        input.validatorAgentId > 0
          ? [input.identityApp, input.reputationApp]
          : [input.reputationApp],
      // record_validation always; agent_address only when a validator is named.
      innerTransactions: input.validatorAgentId > 0 ? 2 : 1,
    },
    {
      summary: `Judge job #${input.jobId} as ${input.passed ? "PASSED" : "FAILED"}.`,
      effects: [
        input.passed
          ? `Sets job #${input.jobId} to validated. This is terminal — there is no path back out.`
          : `Sets job #${input.jobId} to disputed. This is terminal, and it stays on the record. Hiding failures would make the score meaningless.`,
        `Increments ${input.passed ? "validated" : "disputed"} on agent #${input.serverAgentId}'s score in ReputationRegistry ${input.reputationApp}, by inner call. Nothing else may write that field.`,
        input.validatorAgentId > 0
          ? `Only agent #${input.validatorAgentId}'s registered address may sign this; the contract resolves it through IdentityRegistry ${input.identityApp}.`
          : "No validator was named, so the contract accepts this only from the client.",
        "Moves no money by itself. On a pass, release_escrow is the separate call that pays; on a fail, refund_escrow returns it.",
      ],
      args: {
        jobId: input.jobId,
        passed: input.passed,
        serverAgentId: input.serverAgentId,
        validatorAgentId: input.validatorAgentId,
      },
    }
  );
}

/* ── escrow ────────────────────────────────────────────────────────────── */

/**
 * Compose the two-transaction group that moves a budget into escrow.
 *
 * The shape is the point. `fund_job` takes the transfer as a TRANSACTION IN ITS
 * OWN GROUP rather than as an amount argument, so the number it records is one
 * the AVM has already validated. That is why this returns two transactions, and
 * why they have to be signed and submitted together: a group id is computed
 * over all of its members, so signing a subset or reordering them does not do
 * part of the job, it fails.
 */
export async function composeFundJob(input: {
  sender: string;
  jobId: number;
  amountMicro: number;
  assetId: number;
  appAddress: string;
  escrowBeforeMicro: number;
  budgetMicro: number;
}): Promise<ComposedCall> {
  if (!Number.isInteger(input.amountMicro) || input.amountMicro <= 0) {
    throw new ComposeError("The amount must be a positive integer of base units; the contract rejects a zero transfer.");
  }
  if (!input.assetId) {
    throw new ComposeError(
      `ValidationRegistry ${REGISTRY.validation} reports no escrow asset, so it was never bootstrapped and nothing can be funded.`
    );
  }

  const params = await suggestedParams();
  const transfer = makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: input.sender,
    receiver: input.appAddress,
    amount: input.amountMicro,
    assetIndex: input.assetId,
    suggestedParams: params,
  });

  const boxes: BoxRef[] = [{ name: jobBoxName(input.jobId) }, { name: escrowBoxName(input.jobId) }];
  const call = buildAppCall(params, {
    sender: input.sender,
    appId: REGISTRY.validation,
    // The `axfer` argument IS the transfer above: an ARC-4 transaction argument
    // is matched by POSITION in the group, not encoded into appArgs, so the only
    // app arg is the job id.
    signature: "fund_job(axfer,uint64)uint64",
    encodedArgs: [uint64Bytes(input.jobId)],
    boxes,
  });

  assignGroupID([transfer, call]);
  const held = input.escrowBeforeMicro + input.amountMicro;
  const encodedGroup = [transfer, call].map((t) =>
    Buffer.from(encodeUnsignedTransaction(t)).toString("base64"),
  );
  const simulation = await simulate(encodedGroup);

  return {
    signed: false,
    network: "testnet",
    appId: REGISTRY.validation,
    method: "fund_job(axfer,uint64)uint64",
    sender: input.sender,
    summary:
      `Move ${formatUnits(input.amountMicro)} of asset ${input.assetId} into escrow for job #${input.jobId}. ` +
      `The job's budget is ${formatUnits(input.budgetMicro)} and ${formatUnits(input.escrowBeforeMicro)} is held now, so signing takes it to ${formatUnits(held)}.`,
    effects: [
      `The asset leaves ${input.sender} and is held by the contract's own account ${input.appAddress} — this is the one place Ripar takes custody.`,
      `Writes es_${input.jobId} with the total held. The contract reads the amount off transaction 0 of this group, not off an argument, so it cannot be told a number that did not move.`,
      "Comes back out one of two ways only: release_escrow pays the assignee on a passing verdict, refund_escrow returns it to you on a failing or cancelled one.",
      `The transfer fails unless ${input.sender} has opted into asset ${input.assetId} and holds at least ${formatUnits(input.amountMicro)} of it.`,
      "Client only, and only while the job is open or assigned.",
    ],
    args: {
      jobId: input.jobId,
      amountMicro: input.amountMicro,
      assetId: input.assetId,
      appAddress: input.appAddress,
      escrowBeforeMicro: input.escrowBeforeMicro,
      escrowAfterMicro: held,
      budgetMicro: input.budgetMicro,
      fullyFundsBudget: held >= input.budgetMicro,
    },
    groupId: Buffer.from(call.group!).toString("base64"),
    simulation,
    transactions: [
      {
        signed: false,
        index: 0,
        kind: "axfer",
        unsignedTxnBase64: Buffer.from(encodeUnsignedTransaction(transfer)).toString("base64"),
        txId: transfer.txID(),
        fee: Number(transfer.fee),
        boxes: [],
        summary: `Transfer ${formatUnits(input.amountMicro)} of asset ${input.assetId} from ${input.sender} to the app account ${input.appAddress}.`,
      },
      {
        signed: false,
        index: 1,
        kind: "appl",
        unsignedTxnBase64: Buffer.from(encodeUnsignedTransaction(call)).toString("base64"),
        txId: call.txID(),
        fee: Number(call.fee),
        boxes: boxes.map((b) => describeBox(b, REGISTRY.validation)),
        summary: `Call fund_job(axfer,uint64) on app ${REGISTRY.validation} for job #${input.jobId}, which reads the amount off transaction 0 and records it in the es_ box.`,
      },
    ],
    totalFee: Number(transfer.fee) + Number(call.fee),
    validRounds: { first: Number(params.firstValid), last: Number(params.lastValid) },
    nextSteps: [
      "Sign BOTH transactions, in this order — a group is invalid if any member is missing or moved.",
      "Submit the two signed blobs together, concatenated, in one POST.",
      ...SIGN_STEPS,
    ],
  };
}

export async function composeReleaseEscrow(input: {
  sender: string;
  jobId: number;
  serverAgentId: number;
  assigneeAddress: string;
  assigneeDomain: string;
  escrowMicro: number;
  assetId: number;
  identityApp: number;
  client: string;
  windowClosesAt: number;
  now: number;
}): Promise<ComposedCall> {
  const isClient = input.client === input.sender;
  const windowOpen = input.now <= input.windowClosesAt;
  if (!isClient && windowOpen) {
    throw new ComposeError(
      `Only the client may release before the dispute window closes at ${new Date(input.windowClosesAt * 1000).toISOString()}. ` +
        `The contract asserts this, so composing it for ${input.sender} would hand back a transaction that costs a fee and fails.`
    );
  }

  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.validation,
      signature: "release_escrow(uint64)uint64",
      encodedArgs: [uint64Bytes(input.jobId)],
      boxes: [
        { name: jobBoxName(input.jobId) },
        { name: escrowBoxName(input.jobId) },
        { name: agentBoxName(input.serverAgentId), appId: input.identityApp },
      ],
      foreignApps: [input.identityApp],
      foreignAssets: [input.assetId],
      accounts: [input.assigneeAddress],
      // agent_address() by inner app call, then the asset transfer.
      innerTransactions: 2,
    },
    {
      summary:
        `Release ${formatUnits(input.escrowMicro)} of asset ${input.assetId} from ValidationRegistry ${REGISTRY.validation} ` +
        `to ${input.assigneeAddress} — agent #${input.serverAgentId} (${input.assigneeDomain}), which did the work on job #${input.jobId}.`,
      effects: [
        `The escrow leaves the contract and lands with the assignee. ${input.sender} pays only the fee and receives nothing.`,
        `Deletes es_${input.jobId} BEFORE the transfer is submitted, which is what makes paying twice impossible — a second call finds nothing to send.`,
        isClient
          ? "You are the job's client, so the contract accepts this immediately."
          : `The dispute window closed at ${new Date(input.windowClosesAt * 1000).toISOString()}, so anyone may release — including you.`,
        `The payee is resolved through IdentityRegistry ${input.identityApp} at execution time, not taken from this call, so it cannot be redirected.`,
      ],
      args: {
        jobId: input.jobId,
        escrowMicro: input.escrowMicro,
        assetId: input.assetId,
        payee: input.assigneeAddress,
        serverAgentId: input.serverAgentId,
        senderIsClient: isClient,
        disputeWindowClosesAt: input.windowClosesAt,
      },
    }
  );
}

export async function composeRefundEscrow(input: {
  sender: string;
  jobId: number;
  client: string;
  escrowMicro: number;
  assetId: number;
  jobStatus: string;
}): Promise<ComposedCall> {
  return oneCall(
    {
      sender: input.sender,
      appId: REGISTRY.validation,
      signature: "refund_escrow(uint64)uint64",
      encodedArgs: [uint64Bytes(input.jobId)],
      boxes: [{ name: jobBoxName(input.jobId) }, { name: escrowBoxName(input.jobId) }],
      foreignAssets: [input.assetId],
      // The payee is the client, and in the general case that is not the sender.
      accounts: [input.client],
      // The asset transfer, and nothing else — a refund resolves no agent.
      innerTransactions: 1,
    },
    {
      summary:
        `Refund ${formatUnits(input.escrowMicro)} of asset ${input.assetId} from ValidationRegistry ${REGISTRY.validation} ` +
        `to ${input.client}, the client of job #${input.jobId}, because the job is ${input.jobStatus}.`,
      effects: [
        `The escrow returns to ${input.client}. The destination is read off the job, so it is the client whoever signs this — ${input.sender} pays only the fee.`,
        `Deletes es_${input.jobId} before the transfer is submitted, so it cannot be refunded twice.`,
        "Anyone may sign this: the contract puts no condition on the sender, because the money can only go one place.",
      ],
      args: {
        jobId: input.jobId,
        escrowMicro: input.escrowMicro,
        assetId: input.assetId,
        payee: input.client,
        senderIsClient: input.client === input.sender,
      },
    }
  );
}


/* ── pre-flight ────────────────────────────────────────────────────────── */

/**
 * Algod's failure messages carry a full Go struct dump of the transaction —
 * several kilobytes of zeroed fields around one clause that says what went
 * wrong. This keeps the clause.
 *
 * Anything unrecognised is passed through truncated rather than replaced with
 * something friendlier: a message we cannot parse is still the chain's answer,
 * and inventing a nicer one would be guessing at the cause.
 */
export function readableFailure(raw: string): string {
  const patterns = [
    /overspend \(account \S+?,[\s\S]*?tried to spend ([^)]+)\)/,
    /assert failed pc=\d+/,
    /logic eval error: ([^.]+)/,
    /box[^.,]*not found/i,
    /invalid : ([^\n]+)/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;
    if (re.source.startsWith("overspend")) {
      return `the sender cannot cover ${m[1]} — it holds no ALGO`;
    }
    return m[1] ?? m[0];
  }
  const firstClause = raw.split(/[:{]/)[0]?.trim();
  return firstClause && firstClause.length < 160 ? firstClause : `${raw.slice(0, 150)}…`;
}

/**
 * Ask algod what this transaction would do, without signing it.
 *
 * `allowEmptySignatures` is what makes this possible: the node runs the whole
 * call — logic, box access, inner transactions, budget — against current state,
 * with an unsigned transaction carrying an empty signature. It is the same
 * evaluation submit performs, minus the commit. Without that flag the node
 * rejects the group with "signedtxn has no sig" before it evaluates anything,
 * which looks like a contract failure and is not one.
 *
 * Returns null when the node cannot be reached, and never a false `ok`. A caller
 * has to be able to tell "the chain rejected this" from "we could not ask",
 * because only the first is a reason not to sign.
 */
async function simulate(unsignedTxnsBase64: string[]): Promise<SimulationResult | null> {
  try {
    const algod = new algosdk.Algodv2("", TESTNET_ALGOD, "");
    const txns = unsignedTxnsBase64.map(
      (b64) => new algosdk.SignedTransaction({ txn: algosdk.decodeUnsignedTransaction(Buffer.from(b64, "base64")) }),
    );
    const request = new algosdk.modelsv2.SimulateRequest({
      // The whole group goes in together. Simulating one member alone evaluates
      // a transaction that cannot exist on its own — fund_job reads its amount
      // off transaction 0 of the same group.
      txnGroups: [new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns })],
      allowEmptySignatures: true,
    });

    const out = await algod.simulateTransactions(request).do();
    const group = out.txnGroups?.[0];
    const failure = group?.failureMessage ? readableFailure(group.failureMessage) : null;
    return {
      ok: !failure,
      failure,
      budgetConsumed: group?.appBudgetConsumed != null ? Number(group.appBudgetConsumed) : null,
      round: out.lastRound != null ? Number(out.lastRound) : null,
    };
  } catch {
    return null;
  }
}
