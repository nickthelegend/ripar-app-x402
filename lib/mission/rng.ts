// Seeded randomness for the whole Mission Control surface.
//
// Every agent, position and price is derived from one seed, so the field looks
// identical on the server and in the browser and the intro never re-shuffles on
// hydration. Only the settlement timeline is allowed to be genuinely random —
// that is the part that is supposed to feel alive.

export type Rng = () => number;

/** mulberry32 — same generator lib/receipts.ts uses, kept for consistency. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);

export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

/** Box–Muller. Clustered layouts and price spreads both want a bell, not a box. */
export function gaussian(r: Rng, mean = 0, sd = 1): number {
  const u = Math.max(1e-9, r());
  const v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Waiting time until the next event in a Poisson process of the given rate. */
export const exponential = (r: Rng, ratePerSecond: number) =>
  -Math.log(Math.max(1e-9, r())) / Math.max(1e-6, ratePerSecond);
