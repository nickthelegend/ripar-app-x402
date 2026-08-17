// Agent handles. Two halves and a service, drawn from the seeded generator, so
// the roster reads like a directory of real endpoints instead of agent-041.

const HEAD = [
  "atlas", "quill", "vega", "cinder", "harbor", "lumen", "orchid", "tessel",
  "nimbus", "ferrous", "cobalt", "marrow", "pallas", "verity", "drift", "ember",
  "saffron", "kestrel", "obsidian", "halcyon", "meridian", "cadence", "borealis",
  "ravel", "thistle", "umber", "zenith", "lattice", "plume", "gossamer",
  "basalt", "cirrus", "delphi", "fathom", "garnet", "helio", "isolde", "juniper",
] as const;

const TAIL = [
  "index", "oracle", "vision", "ledger", "relay", "forge", "sieve", "probe",
  "scribe", "lens", "mesh", "vault", "signal", "census", "compass", "foundry",
  "beacon", "digest", "warden", "courier", "almanac", "gauge", "sentinel", "loom",
] as const;

export const SERVICES = [
  "risk scoring", "geocoding", "document OCR", "text embedding", "translation",
  "price feed", "sentiment", "contract audit", "image caption", "web extract",
  "summarize", "rerank", "speech to text", "entity resolve", "route optimize",
  "fraud check", "tabular parse", "code review", "citation lookup", "moderation",
] as const;

/** Distinct handles, generated in order so the same seed yields the same roster. */
export function handles(count: number, r: () => number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 200) {
    const name = `${HEAD[Math.floor(r() * HEAD.length)]}-${TAIL[Math.floor(r() * TAIL.length)]}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  // The pools cross to more combinations than we ask for, but never gamble on it.
  while (out.length < count) out.push(`agent-${out.length.toString(36)}`);
  return out;
}
