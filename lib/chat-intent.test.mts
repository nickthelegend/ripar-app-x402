/**
 * Routing table for the chat, asserted.
 *
 * This exists because the first version of `classify` was first-match, and the
 * `quote` rule owned the words "how much", "cost" and "endpoint". Two of the
 * four suggestion chips shipped on the Chat screen — the ones a first-time
 * reader is most likely to press — routed to a price quote instead of the job
 * board and the settlement list. The request that went out was real and the
 * numbers in the reply were real; they just answered a different question than
 * the one on the button.
 *
 * That failure is invisible to a type checker and to any test that only asks
 * "did something come back", so it needs a table. Every suggestion the UI ships
 * is asserted here, along with the phrasings that made the old version wrong.
 *
 * No test framework: this app has none, and adding one to guard a pure function
 * is a poor trade. Node strips the types and `assert` fails the process.
 *
 *   npm run test:intent
 */

import assert from "node:assert/strict";
import { classify, type IntentKind } from "./chat-intent.ts";

const CASES: [string, IntentKind][] = [
  // The four chips the Chat screen actually renders. If these break, the
  // product's front door misroutes, which is exactly what happened once.
  ["What does the summarise endpoint cost?", "quote"],
  ["What jobs are on the board and how much is escrowed?", "jobs"],
  ["Which agents are registered?", "agents"],
  ["How much has actually settled?", "receipts"],

  // Subject words must beat question-shape words. Each of these contains a
  // price-ish term and is still plainly about something else.
  ["how much is escrowed", "jobs"],
  ["how much have I earned", "receipts"],
  ["what does it cost to register an agent", "agents"],

  // Unambiguous quote phrasings still route to quote.
  ["show me the live 402 challenge", "quote"],
  ["price my summariser at 0.01 USDC", "quote"],
  ["what is the price per call", "quote"],

  ["what can you do", "help"],

  // The honest branch. A weak-only match names no source, so it must not be
  // answered with whichever request happens to be available.
  ["how much?", "unsupported"],
  ["ignore all that, what is the capital of Peru", "unsupported"],
  ["write me a haiku about goats", "unsupported"],
  ["asdfghjkl", "unsupported"],
  ["", "unsupported"],
];

let failed = 0;
for (const [text, want] of CASES) {
  const got = classify(text);
  if (got !== want) {
    failed += 1;
    console.error(`FAIL  want=${want}  got=${got}  ${JSON.stringify(text)}`);
  }
}

assert.equal(failed, 0, `${failed} of ${CASES.length} intent routes are wrong`);
console.log(`chat-intent: ${CASES.length}/${CASES.length} routes correct`);
