// Number formatting for an instrument panel.
//
// Every figure on this screen changes while you are looking at it, so widths are
// held steady with tabular numerals and fixed precision. A total that jitters
// sideways as it counts is the fastest way to make live data feel cheap.

const fixed = (n: number, d: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Running totals: cents matter, and the width must not move. */
export const usd = (n: number) => `$${fixed(n, 2)}`;

/** Single settlements, which are routinely fractions of a cent. */
export function usdMicro(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${fixed(n, 2)}`;
}

export function compact(n: number): string {
  if (n < 1_000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 2 : 1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export const percent = (n: number, d = 2) => `${fixed(n * 100, d)}%`;

/** Age of a settlement, in the shortest form that is still unambiguous. */
export function age(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/** Clock reading for the top rail, derived from the simulation's own elapsed time. */
export function stamp(elapsedMs: number): string {
  const total = Math.floor(elapsedMs / 1000);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
