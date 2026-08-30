/**
 * What the chat is actually asked, and what it can actually do about it.
 *
 * Chat used to ignore its input. Every message — "price my summariser", "what
 * is the capital of Peru" — ran the same POST at the same endpoint and narrated
 * the same 402 back, under a footer promising "nothing is scripted". The
 * numbers in that reply were real, which is what made it worse: a confident,
 * correctly-sourced answer to a question nobody asked reads as a working
 * assistant right up until you type one off-script sentence, and then every
 * other honest claim on the page becomes suspect too.
 *
 * So the routing is the fix, and the honest branch is the important half. Each
 * intent below performs a DIFFERENT real request and answers from what came
 * back. Anything this workspace cannot do falls to `unsupported`, which says so
 * and names what it can — rather than reaching for the one action it has and
 * dressing the result up as an answer.
 *
 * There is no model behind this and the copy does not pretend there is. It is a
 * router over four live data sources, which is a smaller claim than "assistant"
 * and one that survives being tested.
 */

export type Fact = { label: string; value: string };

export type IntentReply = {
  /** The request line shown above the answer. Null when nothing went out. */
  call: string | null;
  /** What came back, for the same line. */
  result: string;
  reply: string;
  facts?: Fact[];
};

export type IntentKind = "quote" | "jobs" | "agents" | "receipts" | "help" | "unsupported";

/**
 * Settlements do not have an API route — they are read from the indexer by the
 * workspace poller and shared through context, so the receipts branch is handed
 * the rows the rest of the shell is already showing rather than fetching a
 * second, possibly disagreeing copy.
 */
export type SettlementGetter = () => SettlementContext | undefined;

/**
 * Poll a getter until it yields, or give up. The context updates on the shell's
 * render cycle, so a snapshot taken when the message was sent can be undefined
 * while the very next frame has the data.
 */
async function waitFor(
  get: SettlementGetter | undefined,
  timeoutMs: number
): Promise<SettlementContext | undefined> {
  if (!get) return undefined;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() >= deadline) return undefined;
    await new Promise((r) => setTimeout(r, 250));
  }
}

export type SettlementContext = {
  runs: { amountUsdc: number; from: string; to: string; round: number }[];
  mine: { calls: number; earnedUsdc: number };
  round: number | null;
};

const AGENT_ENDPOINT =
  process.env.NEXT_PUBLIC_AGENT_ENDPOINT ?? "api.ripar.io/api/summarize";

/**
 * Keyword routing, deliberately. An intent classifier that guesses would put us
 * straight back where we started: confidently answering the wrong question. A
 * word list is legible, and everything it fails to match lands in `unsupported`
 * where the honest answer lives, so a miss costs a redirect rather than a lie.
 *
 * SCORED, not first-match. First-match had the `quote` rule owning "how much",
 * "cost" and "endpoint" — and because it was tested first, it swallowed
 * questions that were plainly about something else. Both of these routed to a
 * price quote:
 *
 *     "What jobs are on the board and how much is escrowed?"
 *     "How much has actually settled?"
 *
 * That is the original bug wearing a different hat: a real request, correctly
 * executed, answering a question nobody asked. The fix is to weight the words
 * by how much they actually identify a SUBJECT. "escrowed", "settled" and
 * "registered" name what is being asked about; "how much" only names the shape
 * of the question and is worth far less. Ties fall to `unsupported`, because
 * guessing between two subjects is the failure this file exists to avoid.
 */
type Rule = { kind: IntentKind; strong?: RegExp; weak?: RegExp };

const RULES: Rule[] = [
  {
    kind: "quote",
    // Only words that can ONLY be about pricing a call are strong here.
    strong: /\b(402|challenge|payment[- ]required|summaris|summariz|paid call|per call|price my|pricing)\b/i,
    weak: /\b(price|cost|charge|quote|how much|endpoint|pay for)\b/i,
  },
  {
    kind: "jobs",
    strong: /\b(job|jobs|escrow|escrowed|bid|bids|dispute|disputed|refund|validated|job board)\b/i,
    weak: /\b(board|budget|work|posted)\b/i,
  },
  {
    kind: "agents",
    strong: /\b(agent|agents|directory|registr\w*|identity registry|domain)\b/i,
    weak: /\b(who is|listed)\b/i,
  },
  {
    kind: "receipts",
    strong: /\b(receipt|receipts|settled|settlement|settlements|earned|earning|earnings|revenue|income)\b/i,
    weak: /\b(settle|transfer|paid me|so far)\b/i,
  },
  {
    kind: "help",
    strong: /\b(what can you do|capabilities|who are you|what do you do)\b/i,
    weak: /\b(help|commands|how do i start)\b/i,
  },
];

const STRONG = 3;
const WEAK = 1;

/** Distinct matches, so repeating one word cannot outvote a real subject. */
function hits(re: RegExp | undefined, text: string): number {
  if (!re) return 0;
  const all = text.match(new RegExp(re.source, "gi"));
  return all ? new Set(all.map((m) => m.toLowerCase())).size : 0;
}

export function classify(text: string): IntentKind {
  let best: IntentKind = "unsupported";
  let bestScore = 0;
  let tied = false;

  for (const r of RULES) {
    const score = hits(r.strong, text) * STRONG + hits(r.weak, text) * WEAK;
    if (score === 0) continue;
    if (score > bestScore) {
      best = r.kind;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  // A weak-only match is not enough to claim a subject. "how much?" on its own
  // names no source, and answering it with a price quote would be a guess.
  if (bestScore <= WEAK) return "unsupported";
  return tied ? "unsupported" : best;
}

const usdc = (micro: number) => `${(micro / 1_000_000).toFixed(micro % 10_000 === 0 ? 2 : 3)} USDC`;

/** Every branch returns what a real request answered, or says none was made. */
export async function runIntent(
  kind: IntentKind,
  text: string,
  getSettlements?: SettlementGetter
): Promise<IntentReply> {
  switch (kind) {
    case "quote":
      return quote(text);
    case "jobs":
      return jobs();
    case "agents":
      return agents();
    case "receipts":
      return receipts(getSettlements);
    case "help":
      return help();
    default:
      return unsupported(text);
  }
}

async function quote(text: string): Promise<IntentReply> {
  const started = Date.now();
  const res = await fetch("/api/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();

  if (!data.ok || !data.paymentRequiredHeader) {
    return {
      call: `POST ${AGENT_ENDPOINT}  — no payment attached`,
      result: `${data.status ?? res.status} · no challenge returned`,
      reply:
        data.error ??
        "The endpoint answered, but not with a payment challenge. Nothing was charged and nothing was signed.",
    };
  }

  const q = JSON.parse(atob(data.paymentRequiredHeader));
  const accept = q.accepts?.[0] ?? {};
  const units = Number(accept.maxAmountRequired ?? accept.amount ?? 0);
  const price = units / 1_000_000;

  return {
    call: `POST ${AGENT_ENDPOINT}  — no payment attached`,
    result: `${data.status} · ${data.elapsedMs ?? Date.now() - started}ms · ${data.paymentRequiredHeader.length}B header`,
    reply:
      `That endpoint is x402-gated. It answered ${data.status} and stated its terms in a PAYMENT-REQUIRED ` +
      `header declaring x402 version ${q.x402Version ?? 2}. It wants ${price} USDC — ${units} base units over the ` +
      `asset's six decimals — settled on Algorand under the ${accept.scheme ?? "exact"} scheme, and it holds that ` +
      `quote for ${accept.maxTimeoutSeconds ?? "?"} seconds. Attach X-PAYMENT and retry and the USDC goes straight ` +
      `to the address below. Reading the price cost nothing.`,
    facts: [
      { label: "Price", value: `${price} USDC (${units} base units)` },
      { label: "Asset", value: String(accept.asset ?? "—") },
      { label: "Pays to", value: String(accept.payTo ?? "—") },
      { label: "Settle within", value: `${accept.maxTimeoutSeconds ?? "?"}s` },
    ],
  };
}

async function jobs(): Promise<IntentReply> {
  const res = await fetch("/api/registry/jobs");
  const d = await res.json();
  const list: Array<Record<string, unknown>> = d.jobs ?? [];
  const escrowed = list.reduce((n, j) => n + Number(j.escrowMicro ?? 0), 0);
  const byStatus = new Map<string, number>();
  for (const j of list) {
    const s = String(j.status ?? "unknown");
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  const spread = [...byStatus.entries()].map(([s, n]) => `${n} ${s}`).join(", ");

  return {
    call: `GET /api/registry/jobs  — jb_ and es_ boxes on app ${d.validationApp ?? "?"}`,
    result: `${res.status} · ${list.length} jobs · round ${d.round ?? "?"}`,
    reply:
      `The Validation Registry holds ${list.length} job${list.length === 1 ? "" : "s"} right now — ${spread}. ` +
      `Escrow actually held against them is ${usdc(escrowed)}, which is a different number from what the jobs ` +
      `say they are worth: a budget is a stated intention, escrow is money already moved into the contract's own ` +
      `account. Each of these is a jb_ box decoded from its ARC-4 struct, read at round ${d.round ?? "?"}.`,
    facts: [
      { label: "Jobs", value: String(list.length) },
      { label: "Escrowed", value: usdc(escrowed) },
      { label: "Validation app", value: String(d.validationApp ?? "—") },
      { label: "Read at round", value: String(d.round ?? "—") },
    ],
  };
}

async function agents(): Promise<IntentReply> {
  const res = await fetch("/api/registry/agents");
  const d = await res.json();
  const list: Array<Record<string, unknown>> = d.agents ?? [];
  const names = list.map((a) => `#${a.agentId} ${a.domain}`).join(", ");

  return {
    call: `GET /api/registry/agents  — ag_ boxes on app ${d.identityApp ?? "?"}`,
    result: `${res.status} · ${list.length} agents · round ${d.round ?? "?"}`,
    reply:
      `The Identity Registry has ${list.length} registered agent${list.length === 1 ? "" : "s"}: ${names}. ` +
      `Registration is self-attested — it proves someone signed for that id and domain, not that anyone has ever ` +
      `paid them. The domain is recorded as a string and nothing is fetched from it. For who has actually been ` +
      `paid, that is a different list, derived from settlements rather than from claims.`,
    facts: [
      { label: "Registered", value: String(list.length) },
      { label: "Identity app", value: String(d.identityApp ?? "—") },
      { label: "Reputation app", value: String(d.reputationApp ?? "—") },
      { label: "Read at round", value: String(d.round ?? "—") },
    ],
  };
}

async function receipts(get?: SettlementGetter): Promise<IntentReply> {
  /**
   * Wait for the poller rather than giving up on it.
   *
   * Settlements are read from the indexer by the workspace poller, which takes
   * a few seconds from a cold load — and asking this question is one of the
   * first things a reader does, so the honest "not loaded yet" answer was what
   * they usually got. Correct, and useless.
   *
   * Polling the shared context is the right fix rather than fetching a second
   * copy here: the network to read is derived from the agent's manifest by the
   * provider, so an independent fetch would have to re-derive it and could
   * disagree with the Receipts table about which chain it read.
   */
  const ctx = await waitFor(get, 20_000);
  if (!ctx) {
    return {
      call: null,
      result: "settlements unavailable",
      reply:
        "The settlement rows still had not loaded after twenty seconds, so there is nothing to report — which " +
        "is a different fact from zero settlements, and must not be shown as one. The indexer is most likely " +
        "unreachable from here; Receipts will be empty for the same reason.",
    };
  }

  const runs = ctx.runs;
  const total = runs.reduce((n, r) => n + r.amountUsdc, 0);
  const payers = new Set(runs.map((r) => r.from)).size;

  return {
    call: "indexer · settled USDC transfers, as read by the workspace poller",
    result: `${runs.length} settlements · round ${ctx.round ?? "?"}`,
    reply:
      `There ${runs.length === 1 ? "is" : "are"} ${runs.length} settled x402 ` +
      `transfer${runs.length === 1 ? "" : "s"} in view, totalling ${total.toFixed(3)} USDC across ${payers} ` +
      `distinct payer${payers === 1 ? "" : "s"}. Of those, ${ctx.mine.calls} paid this workspace's own address, ` +
      `worth ${ctx.mine.earnedUsdc.toFixed(3)} USDC. These are chain records rather than an account balance — ` +
      `payment goes straight from the caller to the payee and Ripar is never in the path, so nothing here moves ` +
      `unless somebody actually pays.`,
    facts: [
      { label: "Settlements in view", value: String(runs.length) },
      { label: "Total", value: `${total.toFixed(3)} USDC` },
      { label: "Distinct payers", value: String(payers) },
      { label: "Paid to this address", value: `${ctx.mine.calls} · ${ctx.mine.earnedUsdc.toFixed(3)} USDC` },
    ],
  };
}

function help(): IntentReply {
  return {
    call: null,
    result: "answered locally — no request made",
    reply:
      "This is a router over four live sources, not a general assistant, so it is worth saying plainly what it " +
      "can do. Ask what an endpoint costs and it issues a real unpaid call and reads the price out of the 402 " +
      "that comes back. Ask about jobs and it decodes the Validation Registry's jb_ and es_ boxes. Ask about " +
      "agents and it decodes the Identity Registry's ag_ boxes. Ask about settlements and it reads the indexer. " +
      "Anything else it will tell you it cannot do, which is the whole reason the first four are worth trusting.",
    facts: [
      { label: "Price a call", value: "real 402, live price" },
      { label: "Jobs", value: "jb_ / es_ boxes" },
      { label: "Agents", value: "ag_ boxes" },
      { label: "Settlements", value: "indexer transfers" },
    ],
  };
}

function unsupported(text: string): IntentReply {
  const asked = text.trim().replace(/\s+/g, " ").slice(0, 80);
  return {
    call: null,
    result: "no request made",
    reply:
      `I can't answer that one — "${asked}${text.trim().length > 80 ? "…" : ""}" isn't something this workspace ` +
      `can look up, and there is no language model behind this box to fall back on. Rather than run the one ` +
      `request it does have and hand you a confident answer to a different question, here is what it genuinely ` +
      `does: price a paid endpoint from a live 402, read jobs and escrow out of the Validation Registry, read ` +
      `registered agents out of the Identity Registry, and read settled USDC transfers from the indexer.`,
    facts: undefined,
  };
}
