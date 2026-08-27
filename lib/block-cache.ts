/**
 * One place that reads a block, and never reads the same one twice.
 *
 * A confirmed Algorand block is immutable. Two modules were each fetching the
 * same rounds, on every poll cycle, in parallel — 56 requests for about a dozen
 * distinct blocks, peaking at 28 in a single second. AlgoNode is a free public
 * endpoint and rate-limits that, so the dashboard logged 429s and rendered a
 * settlement list that was quietly short.
 *
 * Retrying a 429 recovers the data but not the console: the browser logs the
 * failed response whether or not we retry. The only way to a clean console is
 * to not trip the limit, which means not making the request at all. Hence a
 * cache rather than a bigger backoff.
 *
 * In-flight requests are shared too, so two callers asking for the same round
 * at the same moment produce one request, not two.
 */

// Keyed by indexer AND round. Round alone would collide across networks: block
// 40,000,000 exists on both MainNet and TestNet and they are different blocks,
// so a MainNet read could be served a cached TestNet body.
/** Deadline for one block read. Mirrors the one in real-data.ts; kept local
 * because real-data imports from this module and the reverse would be circular. */
const REQUEST_TIMEOUT_MS = 12_000;

const blocks = new Map<string, Promise<BlockResponse | null>>();

/**
 * Only the fields this app actually reads off an indexer transaction. The
 * indexer returns a far larger envelope, but typing it as Record<string, any>
 * gave up the one thing a type buys here: if the indexer renames a key — and
 * these are the kebab-case v2 names, which is exactly the kind of thing that
 * moves — the read goes quietly undefined instead of failing to compile.
 */
export type IndexerTxn = {
  id: string;
  note?: string;
  sender: string;
  "tx-type": string;
  "confirmed-round": number;
  "round-time"?: number;
  "asset-transfer-transaction"?: {
    "asset-id": number;
    amount?: number;
    receiver: string;
  };
};

export type BlockResponse = { transactions?: IndexerTxn[] };

/** Serialise across the whole app, with a small gap, so bursts cannot form. */
let queue: Promise<unknown> = Promise.resolve();
const GAP_MS = 120;

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const out = await run();
    await new Promise((r) => setTimeout(r, GAP_MS));
    return out;
  });
  // Keep the chain alive even when one link rejects, or every later read stalls.
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Fetch one block, once, ever.
 *
 * Returns null when the block genuinely could not be read. Callers must treat
 * null as missing data and say so — a silent null is how a rate-limited read
 * became a settlement figure that was too low with nothing to show for it.
 */
export function getBlock(indexer: string, round: number, signal?: AbortSignal): Promise<BlockResponse | null> {
  const key = `${indexer}#${round}`;
  // An already-aborted caller gets nothing, without starting or joining a read.
  if (signal?.aborted) return Promise.resolve(null);
  const hit = blocks.get(key);
  if (hit) return hit;

  const p = enqueue(async () => {
    try {
      // A deadline of its own. The caller's signal is deliberately NOT the only
      // one: this promise is cached and shared, so the first caller's abort
      // would otherwise cancel a read that later callers are still waiting on.
      const r = await fetch(`${indexer}/v2/blocks/${round}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!r.ok) {
        // Drain a body we will not read; an unread body holds its stream open.
        await r.body?.cancel().catch(() => {});
        throw new Error(`${r.status} ${r.statusText}`);
      }
      return (await r.json()) as BlockResponse;
    } catch (err) {
      // Do not cache a failure: the next poll should be allowed to try again.
      blocks.delete(key);
      if ((err as Error)?.name === "AbortError") return null;
      console.warn(`[ripar] block ${round} could not be read: ${(err as Error).message}`);
      return null;
    }
  });

  blocks.set(key, p);
  return p;
}
