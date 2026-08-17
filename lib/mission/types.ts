// The vocabulary Mission Control is built on. Deliberately small: an economy is
// agents, the payments between them, and the light that leaves behind.

export type SettlementState = "settled" | "refunded";

export type Agent = {
  id: number;
  handle: string;
  service: string;
  /** Field position in unit space, roughly -1..1 on both axes. */
  x: number;
  y: number;
  cluster: number;
  /** Per-call price in USDC. Fixed per agent, the way an x402 endpoint is. */
  price: number;
  /** Preferential-attachment weight — busy agents get busier. */
  weight: number;
  /** Breathing offset, so 200 nodes never inhale in unison. */
  phase: number;
  /** How often this agent's handler fails. A few are visibly worse than the rest. */
  flakiness: number;
  calls: number;
  earned: number;
  refunds: number;
  lastAt: number;
  /** Null until the agent has ever been paid. The moment it isn't is First Light. */
  firstLightAt: number | null;
};

export type Settlement = {
  id: number;
  from: number;
  to: number;
  amount: number;
  /** Simulation clock, ms since the field came up. */
  at: number;
  state: SettlementState;
  firstLight: boolean;
};

/** What the glass panels read. Rebuilt on a slow tick, never per frame. */
export type EconomySnapshot = {
  version: number;
  revenue: number;
  txns: number;
  refunds: number;
  healthy: number;
  agents: number;
  lit: number;
  /** Settled as a share of all attempts, 0..1. */
  settlementRate: number;
  perMinute: number;
  recent: Settlement[];
  /** 72 buckets of settlement counts, oldest first, for the timeline. */
  histogram: number[];
  elapsedMs: number;
};
