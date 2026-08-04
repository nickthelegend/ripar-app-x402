// Where the deployed agent lives, and how this app reads its manifest.
//
// Kept in its own module rather than in lib/real-data.ts because that file is
// "use client": a route handler cannot import a client module, and the server
// route and the browser have to agree on exactly one agent.

/** Our own deployed agent. Overridable so a fork points at its own. */
export const AGENT_ORIGIN =
  process.env.NEXT_PUBLIC_RIPAR_AGENT_ORIGIN ?? "https://api.ripar.io";

/** Where an agent publishes what it serves. */
export const MANIFEST_PATH = "/.well-known/ripar.json";

/**
 * Same-origin route in this app that hands back that manifest. The browser must
 * use this rather than the agent directly — see app/api/agent/manifest/route.ts
 * for why fetching AGENT_ORIGIN from the page cannot work.
 */
export const MANIFEST_ROUTE = "/api/agent/manifest";
