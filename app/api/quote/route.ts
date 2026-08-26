import { NextResponse } from "next/server";

/**
 * The same request the browser makes, made from this origin instead.
 *
 * The demo on the homepage calls `https://api.ripar.io/api/summarize` directly
 * from the page first, because a quote you watched your own browser fetch is
 * worth more than one a server fetched for you. That call is currently blocked:
 * the deployed agent sends no `Access-Control-Allow-Origin` and no
 * `Access-Control-Expose-Headers`, so the preflight fails and the browser never
 * sees the response — and even if it did, `PAYMENT-REQUIRED` would be hidden.
 *
 * This route is the fallback, and it is a hop, not a substitute for the truth:
 * the same-origin policy binds the browser, not the server, so the request
 * below is byte-for-byte the one the page tried to make. Nothing is cached,
 * nothing is stubbed, and if the agent is down this returns that fact rather
 * than a quote. The component says which of the two paths answered.
 *
 * The right fix is three response headers on the agent, not this file. Until
 * they ship, the page states plainly that the call was proxied.
 */

const AGENT = process.env.NEXT_PUBLIC_RIPAR_AGENT_ORIGIN ?? "https://api.ripar.io";
const PATH = "/api/summarize";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // The body is whatever the page sent, forwarded unchanged, so the quote is a
  // quote for the request the reader actually typed.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = { text: "Algorand finalises in about three seconds." };
  }

  const url = `${AGENT}${PATH}`;
  const started = Date.now();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      // A hung agent must not hang this route with it.
      signal: AbortSignal.timeout(12_000),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        url,
        error: `Could not reach ${url} — ${(e as Error).message}`,
      },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }

  const elapsedMs = Date.now() - started;
  // x402 v2 carries the challenge in a response header. The body of a 402 from
  // this agent is `{}`, so a component that read only the body would have
  // nothing to show and no way to know it was missing something.
  const header =
    upstream.headers.get("payment-required") ?? upstream.headers.get("www-authenticate") ?? null;

  let decoded: unknown = null;
  let decodeError: string | null = null;
  if (header) {
    try {
      decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      // Some deployments send it as plain JSON rather than base64.
      try {
        decoded = JSON.parse(header);
      } catch {
        decodeError = "The header is neither base64 JSON nor plain JSON, so it is shown raw and not decoded.";
      }
    }
  }

  const text = await upstream.text().catch(() => "");

  return NextResponse.json(
    {
      ok: true,
      url,
      status: upstream.status,
      statusText: upstream.statusText,
      elapsedMs,
      /** Verbatim, so a reader can decode it themselves and get the same thing. */
      paymentRequiredHeader: header,
      paymentRequired: decoded,
      decodeError,
      // Reported rather than assumed: this is exactly why the browser attempt
      // fails, and the page says so instead of blaming the network.
      cors: {
        allowOrigin: upstream.headers.get("access-control-allow-origin"),
        exposeHeaders: upstream.headers.get("access-control-expose-headers"),
      },
      bodyPreview: text.slice(0, 400),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
