// The simulated economy.
//
// No React, no canvas, no DOM. It keeps a roster of agents and a clock, and on
// every tick it decides whether anyone got paid. The renderer reads it; the
// panels subscribe to it; neither can change it.
//
// Timing is a Poisson process whose rate breathes on a couple of slow sines,
// with bursts when one agent goes viral for a few seconds and lulls when the
// network goes quiet. Nothing here fires on a fixed interval, because a metronome
// is the one thing that would give the illusion away.
//
// Everything is simulated. Nothing in this file has ever touched a chain.

import { handles, SERVICES } from "./names";
import { placeAgents } from "./layout";
import { between, exponential, gaussian, pick, rng, type Rng } from "./rng";
import type { Agent, EconomySnapshot, Settlement, SettlementState } from "./types";

const SEED = 0x5eed_1a20;
const CLUSTERS = 7;

/** Rolling window drawn by the timeline. */
const BUCKETS = 72;
const BUCKET_MS = 5_000;

/** Panels repaint on this cadence. Frames are 60/s; nobody can read 60 numbers/s. */
const COMMIT_MS = 200;
const FEED = 26;

/** Hours of history simulated before the first frame, so the field opens mature. */
const WARM_MS = 3.2 * 3600_000;
const WARM_STEP = 250;

/** Agents left dark at the end of warm-up, held back for First Light. */
const UNLIT_RESERVE = 46;

export type EconomyOptions = { agents?: number; seed?: number };

export class Economy {
  readonly agents: Agent[];
  private readonly r: Rng;

  private t = 0;
  private seq = 0;
  private waitMs = 0;

  private burstUntil = -1;
  private burstTarget = -1;
  private lullUntil = -1;
  private firstLightDue = 0;

  private revenue = 0;
  private txns = 0;
  private refunds = 0;
  private lit = 0;

  private readonly buckets = new Array<number>(BUCKETS).fill(0);
  private bucketAcc = 0;
  private bucketMs = 0;
  private warming = false;

  private feed: Settlement[] = [];
  private listeners = new Set<() => void>();
  private snap: EconomySnapshot;
  private commitAcc = 0;
  private version = 0;

  constructor({ agents = 200, seed = SEED }: EconomyOptions = {}) {
    this.r = rng(seed);
    const names = handles(agents, this.r);
    const places = placeAgents(agents, CLUSTERS, this.r);

    this.agents = names.map((handle, id) => {
      const p = places[id];
      // Log-uniform prices: most endpoints are fractions of a cent, a few are
      // worth real money, which is what gives the feed its dynamic range.
      const price = Math.exp(between(this.r, Math.log(0.0006), Math.log(0.075)));
      return {
        id,
        handle,
        service: pick(this.r, SERVICES),
        x: p.x,
        y: p.y,
        cluster: p.cluster,
        price: Math.round(price * 1e6) / 1e6,
        weight: Math.max(0.2, 1 + gaussian(this.r, 0, 0.5)),
        phase: this.r() * Math.PI * 2,
        // Most agents are near-perfect; a handful are quietly unreliable.
        flakiness: this.r() < 0.12 ? between(this.r, 0.04, 0.14) : between(this.r, 0, 0.012),
        calls: 0,
        earned: 0,
        refunds: 0,
        lastAt: -Infinity,
        firstLightAt: null,
      } satisfies Agent;
    });

    this.warm();
    this.firstLightDue = this.t + between(this.r, 4_000, 11_000);
    this.snap = this.build();
  }

  /* ── clock ─────────────────────────────────────────────────────────────── */

  /**
   * Advance the simulation. New settlements are appended to `out` rather than
   * returned, so the render loop can reuse one array and allocate nothing.
   */
  tick(dtMs: number, out: Settlement[]): void {
    // A backgrounded tab hands back an enormous delta on return. Advancing the
    // whole gap would fire hundreds of particles at once, so we skip it instead.
    const dt = Math.min(100, Math.max(0, dtMs));
    this.t += dt;
    this.advanceBuckets(dt);

    this.waitMs -= dt;
    let guard = 0;
    while (this.waitMs <= 0 && guard++ < 24) {
      const s = this.settle();
      if (s) out.push(s);
      this.waitMs += exponential(this.r, this.rate()) * 1000;
    }

    this.commitAcc += dt;
    if (this.commitAcc >= COMMIT_MS) {
      this.commitAcc = 0;
      this.snap = this.build();
      this.version++;
      for (const fn of this.listeners) fn();
    }
  }

  /** Settlements per second right now. */
  private rate(): number {
    const s = this.t / 1000;
    // Two slow sines that never share a period, so the network's mood never
    // repeats on any interval a viewer could learn.
    const base = 2.15 + 1.05 * Math.sin(s / 23.4) + 0.55 * Math.sin(s / 7.31 + 1.2);
    let r = Math.max(0.22, base);

    if (this.t < this.burstUntil) r *= 4.2;
    else if (this.burstUntil > 0 && this.t >= this.burstUntil) {
      this.burstUntil = -1;
      this.burstTarget = -1;
    }

    if (this.t < this.lullUntil) r *= 0.14;
    else if (this.lullUntil > 0 && this.t >= this.lullUntil) this.lullUntil = -1;

    // Roughly one burst a minute and one lull every couple of minutes.
    if (this.burstUntil < 0 && this.lullUntil < 0) {
      if (this.r() < 0.00022) {
        this.burstUntil = this.t + between(this.r, 1_800, 4_600);
        this.burstTarget = this.hot();
      } else if (this.r() < 0.00009) {
        this.lullUntil = this.t + between(this.r, 2_800, 6_500);
      }
    }
    return r;
  }

  /* ── events ────────────────────────────────────────────────────────────── */

  private settle(): Settlement | null {
    const to = this.receiver();
    if (to < 0) return null;
    let from = Math.floor(this.r() * this.agents.length);
    if (from === to) from = (from + 1) % this.agents.length;

    const a = this.agents[to];
    const firstLight = a.firstLightAt === null;

    // A handler that fails is refunded, never charged — the whole point of
    // atomic settlement. It still costs the network a round trip, so it counts
    // as an attempt and it still shows up on the field, as a payment that
    // never lands.
    const failed = this.r() < a.flakiness;
    const state: SettlementState = failed ? "refunded" : "settled";

    // 8% of calls are metered rather than fixed-price — x402's `upto` scheme.
    const metered = this.r() < 0.08;
    const amount = failed ? 0 : a.price * (metered ? between(this.r, 0.3, 1) : 1);

    a.calls++;
    a.weight += 0.35;
    a.lastAt = this.t;
    this.txns++;

    if (failed) {
      a.refunds++;
      this.refunds++;
    } else {
      a.earned += amount;
      this.revenue += amount;
      if (firstLight) {
        a.firstLightAt = this.t;
        this.lit++;
      }
    }

    this.bucketAcc++;

    const s: Settlement = {
      id: ++this.seq,
      from,
      to,
      amount,
      at: this.t,
      state,
      // A refunded first call is not a First Light — nothing was ever paid.
      firstLight: firstLight && !failed,
    };
    this.feed.unshift(s);
    if (this.feed.length > FEED) this.feed.length = FEED;
    return s;
  }

  /**
   * Who gets paid. Tournament selection on weight gives the power-law shape a
   * real marketplace has — a few hubs, a long tail — without rebuilding a
   * cumulative table on every draw.
   */
  private receiver(): number {
    if (this.warming) {
      // Hold a reserve of never-paid agents back so the live field has First
      // Lights left to give.
      if (this.lit >= this.agents.length - UNLIT_RESERVE) return this.pickLit();
      return this.tournament();
    }

    if (this.t >= this.firstLightDue) {
      const dark = this.pickUnlit();
      if (dark >= 0) {
        this.firstLightDue = this.t + between(this.r, 30_000, 72_000);
        return dark;
      }
      this.firstLightDue = this.t + 20_000;
    }
    if (this.burstTarget >= 0 && this.r() < 0.62) return this.burstTarget;
    return this.pickLit();
  }

  private tournament(): number {
    let best = Math.floor(this.r() * this.agents.length);
    for (let i = 0; i < 3; i++) {
      const c = Math.floor(this.r() * this.agents.length);
      if (this.agents[c].weight > this.agents[best].weight) best = c;
    }
    return best;
  }

  /** Tournament restricted to agents that have already earned at least once. */
  private pickLit(): number {
    let best = -1;
    for (let i = 0; i < 6; i++) {
      const c = Math.floor(this.r() * this.agents.length);
      if (this.agents[c].firstLightAt === null) continue;
      if (best < 0 || this.agents[c].weight > this.agents[best].weight) best = c;
    }
    return best >= 0 ? best : this.tournament();
  }

  private pickUnlit(): number {
    const dark: number[] = [];
    for (const a of this.agents) if (a.firstLightAt === null) dark.push(a.id);
    return dark.length ? dark[Math.floor(this.r() * dark.length)] : -1;
  }

  private hot(): number {
    let best = 0;
    for (let i = 0; i < 12; i++) {
      const c = Math.floor(this.r() * this.agents.length);
      if (this.agents[c].weight > this.agents[best].weight) best = c;
    }
    return best;
  }

  /* ── history ───────────────────────────────────────────────────────────── */

  private advanceBuckets(dt: number) {
    this.bucketMs += dt;
    while (this.bucketMs >= BUCKET_MS) {
      this.bucketMs -= BUCKET_MS;
      this.buckets.shift();
      this.buckets.push(this.bucketAcc);
      this.bucketAcc = 0;
    }
  }

  /* ── warm-up ───────────────────────────────────────────────────────────── */

  /**
   * Run the economy for a few hours before anyone is watching. Costs a couple
   * of milliseconds at construction and buys the one thing a live visualisation
   * cannot fake: a past. The field opens with real hubs, real history and a
   * full timeline instead of a polite empty state.
   */
  private warm() {
    this.warming = true;
    const end = WARM_MS;
    while (this.t < end) {
      this.t += WARM_STEP;
      this.advanceBuckets(WARM_STEP);
      this.waitMs -= WARM_STEP;
      let guard = 0;
      while (this.waitMs <= 0 && guard++ < 40) {
        this.settle();
        this.waitMs += exponential(this.r, this.rate()) * 1000;
      }
    }
    this.warming = false;
  }

  /* ── the read side ─────────────────────────────────────────────────────── */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  /** Simulation clock in ms, for ageing rows in the feed. */
  now = () => this.t;

  private build(): EconomySnapshot {
    let healthy = 0;
    for (const a of this.agents) {
      if (a.calls > 0 && a.refunds / a.calls <= 0.04) healthy++;
    }
    // The last minute of the rolling window, which is twelve five-second buckets.
    let lastMinute = 0;
    for (let i = BUCKETS - 12; i < BUCKETS; i++) lastMinute += this.buckets[i];

    return {
      version: this.version,
      revenue: this.revenue,
      txns: this.txns,
      refunds: this.refunds,
      healthy,
      agents: this.agents.length,
      lit: this.lit,
      settlementRate: this.txns ? (this.txns - this.refunds) / this.txns : 1,
      perMinute: lastMinute,
      recent: this.feed.slice(0, FEED),
      histogram: this.buckets.slice(),
      elapsedMs: this.t,
    };
  }
}

/** What the panels render before the client engine exists. */
export const EMPTY_SNAPSHOT: EconomySnapshot = {
  version: -1,
  revenue: 0,
  txns: 0,
  refunds: 0,
  healthy: 0,
  agents: 0,
  lit: 0,
  settlementRate: 1,
  perMinute: 0,
  recent: [],
  histogram: new Array<number>(BUCKETS).fill(0),
  elapsedMs: 0,
};

export const TIMELINE_SPAN_MS = BUCKETS * BUCKET_MS;
