/**
 * The three Ripar registries, read straight off Algorand TestNet.
 *
 * This is a different data source from `lib/real-data.ts`, and the distinction
 * is the whole point of the surfaces built on it. `real-data.ts` defines an
 * agent by BEHAVIOUR — an address that has received x402 settlements. This file
 * defines one by REGISTRATION — an `ag_` box in the Identity Registry. An agent
 * can be in one and not the other, and neither list is a superset of the other.
 *
 * Server-only, deliberately. Every function here runs in a route handler so the
 * browser never has to ship algosdk, and so a box read that fails fails in one
 * place with a message naming the host.
 *
 * NOTHING IS CACHED AND NOTHING IS SEEDED. A read that fails throws; the routes
 * turn that into a 502 the view reports verbatim. A registry surface that
 * degrades quietly into a plausible empty list is worse than one that says it
 * could not reach algod.
 */

import algosdk from "algosdk";

const { ABIType, decodeAddress, encodeAddress, getApplicationAddress, isValidAddress } = algosdk;

/* ── where the chain is ────────────────────────────────────────────────── */

export const TESTNET_ALGOD = "https://testnet-api.algonode.cloud";
export const TESTNET_INDEXER = "https://testnet-idx.algonode.cloud";

/**
 * The deployed registries. These are the same app ids the explorer reads and
 * the same ones `ripar-skills` ships — one number, repeated nowhere it can
 * drift, because a page quoting a stale app id shows an empty registry that
 * looks exactly like a real one.
 */
// Env-overridable, with the live TestNet values as defaults. These were bare
// literals, which made a MainNet cutover a code change in three repos rather
// than a configuration change — and app ids are network-scoped, so 769444119
// on MainNet is a stranger's contract, not this one.
const appId = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const REGISTRY = {
  identity: appId(process.env.NEXT_PUBLIC_IDENTITY_APP, 769_444_119),
  reputation: appId(process.env.NEXT_PUBLIC_REPUTATION_APP, 769_444_120),
  validation: appId(process.env.NEXT_PUBLIC_VALIDATION_APP, 769_444_121),
} as const;

/** Box name prefixes, exactly as the contracts write them. */
export const BOX_PREFIX = {
  agent: "ag_",
  domain: "dm_",
  address: "ad_",
  score: "sc_",
  job: "jb_",
  /** `es_` + uint64 job id. The VALUE is a bare uint64 of base units. */
  escrow: "es_",
  /** `bd_` + uint64 job id + uint64 agent id — 19 bytes. Two ids, not one, so a
   *  job carries one box per bidder and they do not overwrite each other. */
  bid: "bd_",
} as const;

/**
 * What escrow is denominated in.
 *
 * The ID is read from the ValidationRegistry's own `escrow_asset` global at
 * request time, so this app cannot invite anyone to fund an escrow in the wrong
 * asset. The NAME used to be the constant below, and that was the hole: a real
 * id beside a fabricated ticker. The registries are bootstrapped to a token
 * minted for this project, so labelling every amount "USDC" described a
 * different asset than the one being counted — and nothing notices, because the
 * numbers are correct and only the word beside them is wrong.
 *
 * `assetUnitName()` asks the ASA what it calls itself. The constant survives
 * only as the label of last resort when that read fails, and says so.
 */
export const ESCROW_ASSET_FALLBACK_NAME = "asset";
export const ESCROW_DECIMALS = 6;

/** The ticker an ASA declares for itself. Never guessed from decimals. */
export async function assetUnitName(assetId: number): Promise<string> {
  if (!assetId) return ESCROW_ASSET_FALLBACK_NAME;
  try {
    const a = await get<{ params?: { "unit-name"?: string } }>(`${TESTNET_ALGOD}/v2/assets/${assetId}`);
    return a.params?.["unit-name"] || `asset ${assetId}`;
  } catch {
    // A label we could not verify is worse than an honest id.
    return `asset ${assetId}`;
  }
}

export const peraApp = (appId: number) => `https://testnet.explorer.perawallet.app/application/${appId}/`;
export const peraAddress = (a: string) => `https://testnet.explorer.perawallet.app/address/${a}/`;
export const loraApp = (appId: number) => `https://lora.algokit.io/testnet/application/${appId}`;

/* ── transport ─────────────────────────────────────────────────────────── */

export class ChainReadError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ChainReadError";
  }
}

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new ChainReadError(`Could not reach ${hostOf(url)}: ${(e as Error).message}`, url);
  }
  if (!res.ok) {
    // algod puts the reason in the body; the status line alone says nothing
    // about which of several things went wrong.
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = ` — ${body.message}`;
    } catch {
      /* not JSON; the status line is all there is */
    }
    throw new ChainReadError(`${res.status} ${res.statusText}`.trim() + detail, url, res.status);
  }
  return (await res.json()) as T;
}

/** A 404 on a box read means "no such record", which is an answer, not a fault. */
async function getOrNull<T>(url: string): Promise<T | null> {
  try {
    return await get<T>(url);
  } catch (e) {
    if (e instanceof ChainReadError && e.status === 404) return null;
    throw e;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/* ── bytes ─────────────────────────────────────────────────────────────── */

const b64ToBytes = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));
const bytesToB64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const toHex = (b: ArrayLike<number>) =>
  Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");

export function uint64Bytes(value: number | bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), false);
  return out;
}

function withPrefix(prefix: string, tail: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(prefix);
  const out = new Uint8Array(head.length + tail.length);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}

export const agentBoxName = (id: number | bigint) => withPrefix(BOX_PREFIX.agent, uint64Bytes(id));
export const scoreBoxName = (id: number | bigint) => withPrefix(BOX_PREFIX.score, uint64Bytes(id));
export const jobBoxName = (id: number | bigint) => withPrefix(BOX_PREFIX.job, uint64Bytes(id));
export const escrowBoxName = (id: number | bigint) => withPrefix(BOX_PREFIX.escrow, uint64Bytes(id));

/** Verified against the chain: bd_ + job 3 + agent 2 is
 *  62645f00000000000000030000000000000002 — 19 bytes, both ids big-endian. */
export const bidBoxName = (jobId: number | bigint, agentId: number | bigint) =>
  withPrefix(BOX_PREFIX.bid, new Uint8Array([...uint64Bytes(jobId), ...uint64Bytes(agentId)]));

/** `dm_` + the domain's raw UTF-8. NO ARC-4 length prefix — one would address
 *  a box that does not exist. */
export const domainBoxName = (domain: string) =>
  withPrefix(BOX_PREFIX.domain, new TextEncoder().encode(domain));

/** `ad_` + the 32-byte PUBLIC KEY, not the 58-character base32 text. */
export const addressBoxName = (address: string) =>
  withPrefix(BOX_PREFIX.address, decodeAddress(address).publicKey);

export const isAlgorandAddress = (v: string) => isValidAddress(v);

/* ── ARC-4 struct layouts ──────────────────────────────────────────────────
 *
 * A box value is an ARC-4 encoded struct, not a flat concatenation of fields:
 * a `string` or `byte[]` member lives in a tail addressed by a 2-byte head
 * offset, so hand-counted slicing reads a domain out of the middle of an
 * address the first time a field moves. Every type string below is transcribed
 * from the `structs` block of the matching ARC-56 spec, field order included,
 * and handed to `ABIType.from` so algosdk resolves the offsets.
 */

const AGENT_INFO = "(uint64,string,address,uint64,uint64)";
const SCORE = "(uint64,uint64,uint64,uint64,uint64,uint64,uint64)";
const JOB = "(uint64,address,uint64,uint64,uint64,byte[],byte[],uint64,uint64,uint64)";

const n = (v: unknown) => Number(v as bigint);
const addr = (v: unknown) =>
  typeof v === "string" ? v : v instanceof Uint8Array ? encodeAddress(v) : String(v);
const raw = (v: unknown) =>
  v instanceof Uint8Array ? v : Array.isArray(v) ? new Uint8Array(v as number[]) : new Uint8Array();

export type RegisteredAgent = {
  agentId: number;
  /** Where the agent card is expected to live. Recorded, never probed here. */
  domain: string;
  /** The account that controls the record and receives x402 payments. */
  address: string;
  registeredAt: number;
  updatedAt: number;
};

export type AgentScore = {
  agentId: number;
  /** Distinct settled payments. Not a star rating — no human types this. */
  jobsPaid: number;
  volumeMicro: number;
  volumeUsdc: number;
  validated: number;
  disputed: number;
  firstAt: number;
  lastAt: number;
};

export const JOB_STATUS = ["open", "assigned", "submitted", "validated", "disputed", "cancelled"] as const;
export type JobStatusName = (typeof JOB_STATUS)[number] | "unknown";

export const jobStatusName = (code: number): JobStatusName => JOB_STATUS[code] ?? "unknown";

export type RegistryJob = {
  jobId: number;
  client: string;
  serverAgentId: number;
  validatorAgentId: number;
  budgetMicro: number;
  budgetUsdc: number;
  /** sha256 hex. The spec itself stays offchain. */
  specHash: string;
  resultHash: string | null;
  statusCode: number;
  status: JobStatusName;
  createdAt: number;
  updatedAt: number;
};

function decodeAgent(value: Uint8Array): RegisteredAgent {
  const t = ABIType.from(AGENT_INFO).decode(value) as unknown[];
  return {
    agentId: n(t[0]),
    domain: String(t[1]),
    address: addr(t[2]),
    registeredAt: n(t[3]),
    updatedAt: n(t[4]),
  };
}

function decodeScore(value: Uint8Array): AgentScore {
  const t = ABIType.from(SCORE).decode(value) as unknown[];
  const volumeMicro = n(t[2]);
  return {
    agentId: n(t[0]),
    jobsPaid: n(t[1]),
    volumeMicro,
    volumeUsdc: volumeMicro / 10 ** ESCROW_DECIMALS,
    validated: n(t[3]),
    disputed: n(t[4]),
    firstAt: n(t[5]),
    lastAt: n(t[6]),
  };
}

function decodeJob(value: Uint8Array): RegistryJob {
  const t = ABIType.from(JOB).decode(value) as unknown[];
  const statusCode = n(t[7]);
  const budgetMicro = n(t[4]);
  const result = raw(t[6]);
  return {
    jobId: n(t[0]),
    client: addr(t[1]),
    serverAgentId: n(t[2]),
    validatorAgentId: n(t[3]),
    budgetMicro,
    budgetUsdc: budgetMicro / 10 ** ESCROW_DECIMALS,
    specHash: toHex(raw(t[5])),
    resultHash: result.length ? toHex(result) : null,
    statusCode,
    status: jobStatusName(statusCode),
    createdAt: n(t[8]),
    updatedAt: n(t[9]),
  };
}

/** `dm_`/`ad_`/`es_` all hold a bare uint64, so one decoder covers all three. */
const decodeUint64 = (value: Uint8Array) => Number(ABIType.from("uint64").decode(value) as bigint);

/* ── box plumbing ──────────────────────────────────────────────────────── */

type BoxList = { boxes?: Array<{ name?: string }>; "next-token"?: string };

/**
 * Box names for one app, filtered to a prefix.
 *
 * Paginated with `limit` + `next`, never `max`: algod answers `max=` with an
 * HTTP 400 "Result limit exceeded" the moment an app holds more boxes than the
 * number given, so a registry that outgrows one page would make every listing
 * fail opaquely instead of returning what it has.
 */
async function listBoxNames(appId: number, prefix: string): Promise<Uint8Array[]> {
  const wanted = new TextEncoder().encode(prefix);
  const prefixParam = encodeURIComponent(`b64:${bytesToB64(wanted)}`);
  const names: Uint8Array[] = [];
  let next: string | undefined;

  for (let page = 0; page < 25; page += 1) {
    const body = await get<BoxList>(
      `${TESTNET_ALGOD}/v2/applications/${appId}/boxes?limit=500&prefix=${prefixParam}` +
        (next ? `&next=${encodeURIComponent(next)}` : "")
    );
    for (const b of body.boxes ?? []) {
      if (!b.name) continue;
      const name = b64ToBytes(b.name);
      // Guard against a node that ignores `prefix=`.
      if (wanted.every((byte, i) => name[i] === byte)) names.push(name);
    }
    next = body["next-token"];
    if (!next || (body.boxes ?? []).length === 0) return names;
  }
  throw new ChainReadError(
    `Box listing for app ${appId} did not finish; refusing to return a partial list that would read as a complete one`,
    `${TESTNET_ALGOD}/v2/applications/${appId}/boxes`
  );
}

async function readBox(appId: number, name: Uint8Array): Promise<Uint8Array | null> {
  const box = await getOrNull<{ value?: string }>(
    `${TESTNET_ALGOD}/v2/applications/${appId}/box?name=b64:${encodeURIComponent(bytesToB64(name))}`
  );
  return box?.value ? b64ToBytes(box.value) : null;
}

/** Eight in flight: algod has no batch read, and firing all of them at once
 *  earns a 429 from a public node. */
async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (let i = cursor++; i < items.length; i = cursor++) out[i] = await fn(items[i]);
  };
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, worker));
  return out;
}

const idFrom = (name: Uint8Array, prefix: string) => {
  const tail = name.slice(prefix.length);
  return Number(new DataView(tail.buffer, tail.byteOffset, 8).getBigUint64(0, false));
};

const present = <T,>(v: T | null): v is T => v != null;

/* ── global state ──────────────────────────────────────────────────────── */

type AppInfo = {
  params?: {
    creator?: string;
    "global-state"?: Array<{ key: string; value: { uint?: number } }>;
  };
};

/** Several globals from ONE request — reading them singly refetches the whole
 *  application record, approval program included, once per key. */
async function globals(appId: number, keys: string[]): Promise<Record<string, number>> {
  const info = await get<AppInfo>(`${TESTNET_ALGOD}/v2/applications/${appId}`);
  const state = info.params?.["global-state"] ?? [];
  const out: Record<string, number> = {};
  for (const key of keys) {
    const encoded = Buffer.from(key, "utf8").toString("base64");
    out[key] = Number(state.find((e) => e.key === encoded)?.value?.uint ?? 0);
  }
  return out;
}

export async function testnetRound(): Promise<number> {
  const status = await get<{ "last-round": number }>(`${TESTNET_ALGOD}/v2/status`);
  return status["last-round"];
}

/* ── identity ──────────────────────────────────────────────────────────── */

/** Every `ag_` box, lowest id first. */
export async function listRegisteredAgents(): Promise<RegisteredAgent[]> {
  const names = (await listBoxNames(REGISTRY.identity, BOX_PREFIX.agent)).filter(
    (nm) => nm.length === BOX_PREFIX.agent.length + 8
  );
  const values = await mapLimit(names, (nm) => readBox(REGISTRY.identity, nm));
  return values
    .filter(present)
    .map(decodeAgent)
    .sort((a, b) => a.agentId - b.agentId);
}

export async function getRegisteredAgent(agentId: number): Promise<RegisteredAgent | null> {
  if (!Number.isInteger(agentId) || agentId < 1) return null;
  const value = await readBox(REGISTRY.identity, agentBoxName(agentId));
  return value ? decodeAgent(value) : null;
}

/** The id registered against an address, or 0. The contract's own sentinel. */
export async function resolveByAddress(address: string): Promise<number> {
  if (!isValidAddress(address)) return 0;
  const value = await readBox(REGISTRY.identity, addressBoxName(address));
  return value ? decodeUint64(value) : 0;
}

export async function resolveByDomain(domain: string): Promise<number> {
  const value = await readBox(REGISTRY.identity, domainBoxName(domain));
  return value ? decodeUint64(value) : 0;
}

/** `agent_count` — the highest id ever ISSUED, which is also the id the next
 *  `new_agent` will take. Not a live count: ids are never reused. */
export async function agentCount(): Promise<number> {
  return (await globals(REGISTRY.identity, ["agent_count"])).agent_count;
}

/* ── reputation ────────────────────────────────────────────────────────── */

/** null, not zero: an agent with no `sc_` box has never been paid, which is a
 *  different fact from one whose record says nothing happened. */
export async function getScore(agentId: number): Promise<AgentScore | null> {
  const value = await readBox(REGISTRY.reputation, scoreBoxName(agentId));
  return value ? decodeScore(value) : null;
}

export async function getScores(agentIds: number[]): Promise<Map<number, AgentScore>> {
  const rows = await mapLimit(agentIds, async (id) => [id, await getScore(id)] as const);
  return new Map(rows.filter((r): r is [number, AgentScore] => r[1] != null));
}

/* ── validation ────────────────────────────────────────────────────────── */

export async function listJobs(): Promise<RegistryJob[]> {
  const names = (await listBoxNames(REGISTRY.validation, BOX_PREFIX.job)).filter(
    (nm) => nm.length === BOX_PREFIX.job.length + 8
  );
  const values = await mapLimit(names, (nm) => readBox(REGISTRY.validation, nm));
  return values
    .filter(present)
    .map(decodeJob)
    .sort((a, b) => b.jobId - a.jobId);
}

export async function getJob(jobId: number): Promise<RegistryJob | null> {
  if (!Number.isInteger(jobId) || jobId < 1) return null;
  const value = await readBox(REGISTRY.validation, jobBoxName(jobId));
  return value ? decodeJob(value) : null;
}

/**
 * Every funded job, as job id -> base units.
 *
 * Exhaustive by construction: an `es_` box exists only while money is held, so
 * the boxes that come back ARE the funded set, and every job not in this map is
 * unfunded. `release_escrow` and `refund_escrow` delete the box before they
 * send, so a paid-out job and a never-funded one look identical here — which is
 * the truth, since neither holds anything now.
 */
export async function getEscrows(): Promise<Map<number, number>> {
  const names = (await listBoxNames(REGISTRY.validation, BOX_PREFIX.escrow)).filter(
    (nm) => nm.length === BOX_PREFIX.escrow.length + 8
  );
  const rows = await mapLimit(names, async (nm) => {
    const value = await readBox(REGISTRY.validation, nm);
    return value ? ([idFrom(nm, BOX_PREFIX.escrow), decodeUint64(value)] as const) : null;
  });
  return new Map(rows.filter(present));
}

export type EscrowTerms = {
  validationApp: number;
  /** Where a funding transfer has to go. Derived from the app id, so it is not
   *  a number anyone can substitute. */
  appAddress: string;
  /** 0 means the registry was never bootstrapped and nothing can be funded. */
  assetId: number;
  assetName: string;
  disputeWindowSecs: number;
  identityApp: number;
  reputationApp: number;
  jobCount: number;
};

export async function getEscrowTerms(): Promise<EscrowTerms> {
  const state = await globals(REGISTRY.validation, [
    "escrow_asset",
    "dispute_window",
    "identity_app",
    "reputation_app",
    "job_count",
  ]);
  return {
    validationApp: REGISTRY.validation,
    appAddress: getApplicationAddress(REGISTRY.validation).toString(),
    assetId: state.escrow_asset,
    assetName: await assetUnitName(state.escrow_asset),
    disputeWindowSecs: state.dispute_window,
    identityApp: state.identity_app,
    reputationApp: state.reputation_app,
    jobCount: state.job_count,
  };
}

export const microToUnits = (micro: number) => micro / 10 ** ESCROW_DECIMALS;

export function formatUnits(micro: number): string {
  return microToUnits(micro).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: ESCROW_DECIMALS,
  });
}
