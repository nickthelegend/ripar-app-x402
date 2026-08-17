// Mission Control runs on its own palette: an observatory, not the light
// workspace the rest of the app lives in.
//
// Ink is a blue-black dome. Value is warm gold — the oldest, quietest signal
// for money there is, and the reason this reads as an instrument rather than a
// trading floor. Mint is reserved for health, frost for type. Nothing else gets
// a colour, because the only thing on screen that should feel expensive is the
// light moving across it.

export const PALETTE = {
  ink: "#070A10",
  ink2: "#0B0F18",
  dome: "#121A2B",
  gold: "#E8B65A",
  goldHot: "#FFF1D4",
  mint: "#9EE6C8",
  frost: "#E8EDF7",
  dim: "#6B7A93",
} as const;

export const RGB = {
  gold: [232, 182, 90],
  goldHot: [255, 241, 212],
  mint: [158, 230, 200],
  frost: [232, 237, 247],
  dim: [107, 122, 147],
  dome: [18, 26, 43],
} as const;

export const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Blend two RGB triples. Used for the settle→arrival colour ramp. */
export const mix = (a: readonly number[], b: readonly number[], t: number): number[] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
