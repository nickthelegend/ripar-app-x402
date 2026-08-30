/**
 * Whether the settlement rows on screen are all of them, and what to say if not.
 *
 * This is a pure function on purpose. The banner it drives could only be seen by
 * catching the indexer mid-failure, which is intermittent and — because block
 * reads are permanently cached — not reproducible on demand. A rendering that
 * cannot be triggered cannot be verified, and "it typechecks" is not the same
 * as "it says the right thing".
 *
 * So the decision lives here, where it can be asserted, and the view only
 * renders what it returns.
 */

export type Coverage =
  | { complete: true }
  | { complete: false; dropped: number; ofBlocks: number; message: string };

export function settlementCoverage(dropped: number, ofBlocks: number): Coverage {
  // Guard the nonsense cases rather than rendering them. A negative or
  // over-count means the caller is confused, and announcing "-1 of 12 blocks
  // could not be read" would be worse than saying nothing.
  if (!Number.isFinite(dropped) || !Number.isFinite(ofBlocks)) return { complete: true };
  if (dropped <= 0 || ofBlocks <= 0 || dropped > ofBlocks) return { complete: true };

  const blocks = dropped === 1 ? "block" : "blocks";
  return {
    complete: false,
    dropped,
    ofBlocks,
    message:
      `${dropped} of ${ofBlocks} ${blocks} in the window could not be read from the indexer, so ` +
      `settlements in those rounds are missing here. The totals below are of what was read, not of ` +
      `what is on chain.`,
  };
}
