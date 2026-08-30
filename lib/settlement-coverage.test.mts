/**
 * The incomplete-settlements banner, asserted.
 *
 * The banner exists because a truncated list and a short list look identical,
 * and the dropped-block count used to go only to console.warn. But the fix was
 * itself unverifiable: catching it live needs the indexer to fail mid-read,
 * which is intermittent, and the block cache means a reload will not re-fetch.
 *
 * Extracting the decision makes it checkable. These assert the two facts that
 * matter — it stays silent when nothing was dropped, and it says exactly how
 * much was missed when something was.
 *
 *   npm run test:coverage
 */

import assert from "node:assert/strict";
import { settlementCoverage } from "./settlement-coverage.ts";

// Nothing dropped: say nothing. A banner on a complete list is noise, and worse,
// it teaches the reader to ignore the one that matters.
assert.equal(settlementCoverage(0, 12).complete, true);

// Something dropped: say how much, and say what the totals are of.
const partial = settlementCoverage(2, 12);
assert.equal(partial.complete, false);
assert.ok(partial.complete === false && partial.message.includes("2 of 12 blocks"));
assert.ok(partial.complete === false && partial.message.includes("not of what is on chain"));

// One block reads as singular. Small thing; "1 blocks" undercuts the sentence.
const one = settlementCoverage(1, 12);
assert.ok(one.complete === false && one.message.includes("1 of 12 block "));

// Every block dropped is still a real, sayable state.
assert.equal(settlementCoverage(12, 12).complete, false);

// Nonsense stays silent rather than rendering "-1 of 12" or "13 of 12".
assert.equal(settlementCoverage(-1, 12).complete, true);
assert.equal(settlementCoverage(13, 12).complete, true);
assert.equal(settlementCoverage(3, 0).complete, true);
assert.equal(settlementCoverage(NaN, 12).complete, true);

console.log("settlement-coverage: 9/9 assertions hold");
