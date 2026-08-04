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

type Seed = { label: string; category: McpCategory; tools: [string, string, string, number?][] };

// Mocked manifests. Nothing is fetched — see the note the connect modal shows.
const SEEDS: Record<string, Seed> = {
  "mcp.linear.app": {
    label: "Linear",
    category: "github",
    tools: [
      ["linear.list_issues", "List issues", "Issues in a team, filtered by state and assignee."],
      ["linear.create_issue", "Create issue", "Files an issue with a title, description and estimate."],
      ["linear.move_issue", "Move issue", "Moves an issue to another state or cycle."],
      ["linear.add_comment", "Add comment", "Comments on an issue as the connected user."],
    ],
  },
  "mcp.notion.com": {
    label: "Notion",
    category: "search",
    tools: [
      ["notion.search", "Search workspace", "Full-text search across pages and databases."],
      ["notion.read_page", "Read page", "Returns a page's blocks as markdown."],
      ["notion.append_block", "Append block", "Appends a block to the end of a page."],
      ["notion.create_page", "Create page", "Creates a page inside a parent database."],
    ],
  },
  "mcp.stripe.com": {
    label: "Stripe",
    category: "http",
    tools: [
      ["stripe.list_invoices", "List invoices", "Invoices for a customer, newest first."],
      ["stripe.create_payment_link", "Create payment link", "Creates a shareable payment link for a price."],
      ["stripe.refund_charge", "Refund charge", "Refunds a charge in full or in part."],
    ],
  },
};

const slug = (host: string) => host.replace(/^mcp\./, "").replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

const titleCase = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/**
 * Stands in for an MCP `tools/list` handshake. The flow around it is real —
 * this returns what a server would say it exposes; the modal does the rest.
 */
export function introspect(rawUrl: string): Promise<McpManifest> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      return reject(new Error("That is not a URL. Try https://mcp.example.com/sse"));
    }
    if (url.protocol !== "https:") return reject(new Error("MCP servers must be attached over https."));

    const id = slug(url.hostname);
    const seed = SEEDS[url.hostname];
    // A server nobody seeded still answers — with the three tools every MCP
    // implementation carries — so the flow is exercisable against any host.
    const spec: Seed = seed ?? {
      label: titleCase(id.replace(/-/g, " ")),
      category: "http",
      tools: [
        [`${id}.list_resources`, "List resources", "Resources this server exposes to the model."],
        [`${id}.read_resource`, "Read resource", "Reads one resource by uri."],
        [`${id}.call_tool`, "Call tool", "Invokes a named tool with a JSON argument object."],
      ],
    };

    const tools: McpTool[] = spec.tools.map(([toolId, name, description, price]) => ({
      id: toolId,
      name,
      description,
      category: spec.category,
      price,
      inputs: [j("arguments", true, "JSON matching the tool's input schema")],
      serverId: id,
      serverLabel: spec.label,
    }));

    // Handshakes are not instant, and the modal has a loading state to show.
    setTimeout(() => resolve({ id, url: url.toString(), label: spec.label, tools }), 620);
  });
}
