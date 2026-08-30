// The MCP tool library the workflow palette draws from. Shaped like a real MCP
// manifest — id, description, input schema — so swapping in a live
// tools/list response later is a change of source, not of components.

export type McpCategory =
  | "filesystem"
  | "http"
  | "github"
  | "slack"
  | "postgres"
  | "search"
  | "llm"
  | "algorand";

export type McpInput = {
  name: string;
  type: "string" | "number" | "boolean" | "json";
  required: boolean;
  hint?: string;
};

export type McpTool = {
  /** Namespaced like a real MCP tool name, and the id a step stores. */
  id: string;
  name: string;
  category: McpCategory;
  description: string;
  inputs: McpInput[];
  /** USDC charged per call. Absent means the call is free to make. */
  price?: number;
  // Set only on tools that arrived from a server the user attached, so the
  // palette can group them apart from the built-in library.
  serverId?: string;
  serverLabel?: string;
};

/** What the palette hands over on a drag, and what the canvas reads on drop. */
export const DND_MCP_TOOL = "application/ripar-mcp-tool";

export const MCP_CATEGORIES: Record<McpCategory, { label: string; blurb: string; chip: string; swatch: string }> = {
  filesystem: { label: "Filesystem", blurb: "The run's scratch workspace",     chip: "bg-amber-50 text-amber-600",     swatch: "#d97706" },
  http:       { label: "HTTP",       blurb: "Plain and x402-paid requests",    chip: "bg-sky-50 text-sky-600",         swatch: "#0ea5e9" },
  github:     { label: "GitHub",     blurb: "Issues, pull requests, contents", chip: "bg-neutral-100 text-neutral-700", swatch: "#525252" },
  slack:      { label: "Slack",      blurb: "Channels and threads",            chip: "bg-violet-50 text-violet-600",   swatch: "#8b5cf6" },
  postgres:   { label: "Postgres",   blurb: "Read and write your database",    chip: "bg-blue-50 text-blue-600",       swatch: "#2563eb" },
  search:     { label: "Search",     blurb: "Web, pages and the Bazaar",       chip: "bg-teal-50 text-teal-600",       swatch: "#0d9488" },
  llm:        { label: "LLM",        blurb: "Metered model calls",             chip: "bg-fuchsia-50 text-fuchsia-600", swatch: "#c026d3" },
  algorand:   { label: "Algorand",   blurb: "Accounts, assets, app calls",     chip: "bg-emerald-50 text-emerald-600", swatch: "#10b981" },
};

/** Palette order — cheap and local first, metered last. */
export const MCP_CATEGORY_ORDER: McpCategory[] = [
  "filesystem",
  "http",
  "postgres",
  "github",
  "slack",
  "search",
  "llm",
  "algorand",
];

const s = (name: string, required = true, hint?: string): McpInput => ({ name, type: "string", required, hint });
const n = (name: string, required = true, hint?: string): McpInput => ({ name, type: "number", required, hint });
const j = (name: string, required = false, hint?: string): McpInput => ({ name, type: "json", required, hint });

export const MCP_TOOLS: McpTool[] = [
  // filesystem
  { id: "fs.read_file", name: "Read file", category: "filesystem", description: "Reads a file from the run's workspace as UTF-8 text.", inputs: [s("path", true, "workspace-relative")] },
  { id: "fs.write_file", name: "Write file", category: "filesystem", description: "Writes text to the workspace, creating parent folders.", inputs: [s("path"), s("content")] },
  { id: "fs.list_dir", name: "List directory", category: "filesystem", description: "Lists names, sizes and modified times under a path.", inputs: [s("path"), n("depth", false, "defaults to 1")] },

  // http
  { id: "http.fetch", name: "Fetch URL", category: "http", description: "GETs a URL and returns status, headers and body.", inputs: [s("url"), s("method", false, "defaults to GET"), j("headers")] },
  { id: "http.post_json", name: "POST JSON", category: "http", description: "Posts a JSON body and parses the JSON response.", inputs: [s("url"), j("body", true)] },
  { id: "http.x402_fetch", name: "Paid fetch (x402)", category: "http", description: "Fetches a 402-gated resource, settling the quote from the workspace wallet.", inputs: [s("url"), n("maxPrice", false, "abort above this")], price: 0.001 },

  // postgres
  { id: "pg.query", name: "Run query", category: "postgres", description: "Runs a parameterised read query and returns rows.", inputs: [s("sql"), j("params")] },
  { id: "pg.insert_rows", name: "Insert rows", category: "postgres", description: "Inserts a batch of rows and returns the inserted ids.", inputs: [s("table"), j("rows", true)] },
  { id: "pg.describe_table", name: "Describe table", category: "postgres", description: "Returns columns, types and indexes for a table.", inputs: [s("table")] },

  // github
  { id: "gh.list_issues", name: "List issues", category: "github", description: "Lists issues in a repository, newest first.", inputs: [s("repo", true, "owner/name"), s("state", false, "open · closed · all")] },
  { id: "gh.create_issue", name: "Create issue", category: "github", description: "Opens an issue with a title, body and labels.", inputs: [s("repo"), s("title"), s("body", false), j("labels")] },
  { id: "gh.open_pull_request", name: "Open pull request", category: "github", description: "Opens a pull request from a branch into the default branch.", inputs: [s("repo"), s("branch"), s("title")] },

  // slack
  { id: "slack.post_message", name: "Post message", category: "slack", description: "Posts a message to a channel as the workspace app.", inputs: [s("channel", true, "#finance"), s("text")] },
  { id: "slack.upload_snippet", name: "Upload snippet", category: "slack", description: "Uploads text as a file snippet into a channel.", inputs: [s("channel"), s("filename"), s("content")] },
  { id: "slack.list_channels", name: "List channels", category: "slack", description: "Lists channels the app has been invited to.", inputs: [] },

  // search
  { id: "search.web", name: "Web search", category: "search", description: "Ranked web results with titles, URLs and snippets.", inputs: [s("query"), n("limit", false, "defaults to 10")], price: 0.002 },
  { id: "search.crawl_page", name: "Crawl page", category: "search", description: "Renders a page and returns its readable text.", inputs: [s("url")], price: 0.001 },
  { id: "search.bazaar", name: "Find an endpoint", category: "search", description: "Searches the x402 Bazaar for an endpoint by capability.", inputs: [s("query"), n("maxPrice", false)] },

  // llm
  { id: "llm.summarize", name: "Summarise", category: "llm", description: "Condenses a payload to a target length.", inputs: [s("text"), n("maxWords", false, "defaults to 120")], price: 0.004 },
  { id: "llm.classify", name: "Classify", category: "llm", description: "Picks one of your labels and returns a confidence.", inputs: [s("text"), j("labels", true)], price: 0.003 },
  { id: "llm.extract_json", name: "Extract JSON", category: "llm", description: "Pulls structured fields out of free text against a schema.", inputs: [s("text"), j("schema", true)], price: 0.006 },

  // algorand
  { id: "algo.account_info", name: "Account info", category: "algorand", description: "Balance, assets and app local state for an address.", inputs: [s("address")] },
  { id: "algo.asset_holdings", name: "Asset holdings", category: "algorand", description: "Holdings of one asset id for an address.", inputs: [s("address"), n("assetId")] },
  { id: "algo.send_payment", name: "Send payment", category: "algorand", description: "Submits a payment. Costs network fees, not x402.", inputs: [s("to"), n("amount"), s("note", false)] },
  { id: "algo.app_call", name: "App call", category: "algorand", description: "Calls an ABI method on an application and returns the result.", inputs: [n("appId"), s("method"), j("args")] },
];

const BY_ID = new Map(MCP_TOOLS.map((t) => [t.id, t]));

export const builtInTool = (id: string | undefined) => (id ? BY_ID.get(id) : undefined);

/* ── server introspection ──────────────────────────────────────────────── */

export type McpManifest = { id: string; url: string; label: string; tools: McpTool[] };

const slug = (host: string) => host.replace(/^mcp\./, "").replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

const titleCase = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/**
 * A real MCP `tools/list` handshake.
 *
 * This used to be fabricated. It held hand-written catalogues for three well
 * known hosts, invented a plausible three-tool manifest for every OTHER host,
 * and slept 620ms first so the modal's loading state would look like a network
 * round trip. Any URL you typed "connected" and produced tools that did not
 * exist — the most convincing kind of fake, because it never failed.
 *
 * Now it performs the actual JSON-RPC call an MCP client makes and reports
 * whatever really happens. Attaching an arbitrary server from a browser will
 * often fail on CORS, and that is a true and useful answer: it tells you the
 * server has not allowed this origin, which is a real thing to go and fix. It
 * is not an excuse to invent a manifest.
 */
export async function introspect(rawUrl: string): Promise<McpManifest> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("That is not a URL. Try https://mcp.example.com/mcp");
  }
  if (url.protocol !== "https:") throw new Error("MCP servers must be attached over https.");

  const id = slug(url.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Servers speaking the Streamable HTTP transport reply as SSE.
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: controller.signal,
    });
  } catch (err) {
    // A cross-origin block and an unreachable host are different facts, but the
    // browser deliberately refuses to tell them apart. Say exactly that rather
    // than picking whichever one sounds better.
    throw new Error(
      `Could not reach ${url.hostname}. The browser reports no response, which is what both a CORS refusal ` +
        `and an unreachable host look like from here — it will not distinguish them. ` +
        (err instanceof Error && err.name === "AbortError" ? "It timed out after 12s." : "")
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`${url.hostname} answered ${res.status} to tools/list.`);

  const raw = await res.text();
  const payload = parseRpc(raw);
  if (!payload) throw new Error(`${url.hostname} answered, but not with JSON-RPC this client can read.`);
  if (payload.error) {
    throw new Error(`${url.hostname} refused tools/list: ${payload.error.message ?? "no reason given"}`);
  }

  const listed = payload.result?.tools;
  if (!Array.isArray(listed)) {
    throw new Error(`${url.hostname} returned no tools array, so there is nothing to attach.`);
  }

  const tools: McpTool[] = listed.map((entry) => {
    const t = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(t.name ?? "unknown"),
      name: String(t.title ?? t.name ?? "unknown"),
      description: String(t.description ?? "No description given by the server."),
      category: "http" as McpCategory,
    // Price is not part of tools/list. Leaving it undefined is correct — the
    // old code sometimes attached one, which meant a workflow could quote a
    // number the server never named.
      price: undefined,
      inputs: inputsFromSchema(t.inputSchema),
      serverId: id,
      serverLabel: titleCase(id.replace(/-/g, " ")),
    };
  });

  return { id, url: url.toString(), label: titleCase(id.replace(/-/g, " ")), tools };
}

/** Streamable HTTP may frame the reply as SSE; plain JSON is also valid. */
function parseRpc(raw: string): { result?: { tools?: unknown[] }; error?: { message?: string } } | null {
  const direct = tryJson(raw);
  if (direct) return direct;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const parsed = tryJson(line.slice(5).trim());
    if (parsed) return parsed;
  }
  return null;
}

function tryJson(v: string): { result?: { tools?: unknown[] }; error?: { message?: string } } | null {
  try {
    const p = JSON.parse(v);
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
}

/** Turn a JSON Schema into the input rows the palette renders. */
function inputsFromSchema(schema: unknown): McpInput[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as { properties?: Record<string, { description?: string }>; required?: string[] };
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {}).map(([name, spec]) => ({
    name,
    type: "json" as const,
    required: required.has(name),
    hint: spec?.description,
  }));
}
