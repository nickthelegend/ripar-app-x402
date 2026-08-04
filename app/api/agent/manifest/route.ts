import { NextResponse } from "next/server";
import { AGENT_ORIGIN, MANIFEST_PATH } from "@/lib/agent-origin";

/**
 * Serves the deployed agent's manifest from this app's own origin.
 *
 * The agent publishes it at api.ripar.io and sends no Access-Control-Allow-Origin
 * header, so a browser on app.ripar.io is not allowed to read the response —
 * the Endpoints view fetched it directly and was permanently empty for every
 * real visitor while working fine on localhost, where nothing crosses origins.
 *
 * The same-origin policy binds the browser, not the server: this hop runs in
 * Node, so no CORS header is needed on the agent's side, and the page only ever
 * talks to its own origin.
 */

// The manifest is the agent describing itself right now. A build-time snapshot
// would be a stale price list, which is the thing this view exists not to show.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = `${AGENT_ORIGIN}${MANIFEST_PATH}`;

  try {
    const upstream = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      // A hung agent must not hang this route with it.
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `${AGENT_ORIGIN} answered ${upstream.status} ${upstream.statusText}` },
        { status: 502, headers: { "cache-control": "no-store" } }
      );
    }

    // Parsed rather than streamed through, so a non-JSON body (an HTML error
    // page from a proxy, say) fails here instead of downstream as a render.
    const manifest = await upstream.json();
    return NextResponse.json(manifest, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read ${url} — ${(e as Error).message}` },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}
