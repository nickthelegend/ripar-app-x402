"use client";

import { createClient } from "@/lib/supabase/client";

// Bridge to the Kubernetes control plane (ripar-infra's ripar-api).
// Env-gated: set NEXT_PUBLIC_RIPAR_API_URL to the router's URL and runs
// execute on the org's own pods; unset, callers keep their local simulation.

export type ControlPlaneRun = {
  org: string;
  pod: string;
  status: string;
  durationMs: number;
  steps: string[];
  output: string;
};

export async function runViaControlPlane(input: string): Promise<ControlPlaneRun | null> {
  const base = process.env.NEXT_PUBLIC_RIPAR_API_URL;
  if (!base) return null;
  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const { data: org } = await supabase.from("orgs").select("slug").limit(1).maybeSingle();
    if (!org) return null;

    const res = await fetch(`${base.replace(/\/$/, "")}/orgs/${org.slug}/runs`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(35_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ControlPlaneRun;
  } catch {
    return null;
  }
}
