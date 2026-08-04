// The Settlement Stream.
//
// One canvas, one requestAnimationFrame loop, zero React renders per frame. The
// renderer reads the economy and never writes to it: brightness, motion and
// ceremony all live here, because they are facts about light rather than facts
// about money.
//
// Every payment is a particle that leaves the payer, arcs, and either arrives
// — brightening the agent that earned it — or, if the handler failed, fades out
// in flight and is never delivered. That is not decoration. Under atomic
// settlement a failed call is a payment that genuinely never lands, and this is
// what that looks like.

import { mix, PALETTE, RGB, rgba } from "./palette";
import { rng } from "./rng";
import { glow, skyTexture } from "./sprites";
import type { Agent, Settlement } from "./types";

type Particle = {
  active: boolean;
  from: number;
  to: number;
  t: number;
  dur: number;
  amount: number;
  refunded: boolean;
  ceremonial: boolean;
  /** Perpendicular bow of the arc. Stable per pair, so routes are legible. */
  curve: number;
  /** Fraction of the trip a refunded payment gets before it dissipates. */
  cut: number;
};

type Ring = {
  active: boolean;
  x: number;
  y: number;
  t: number;
  dur: number;
  radius: number;
  ceremonial: boolean;
  colour: readonly number[];
};

type Edge = { a: number; b: number; s: number; curve: number };

export type Ceremony = { handle: string; service: string; x: number; y: number; phase: "rising" | "lit" };

const PARTICLES = 360;
const RINGS = 96;
const EDGE_CAP = 280;
/** Source resolution of the four glow sprites. Everything is scaled from these. */
const SPRITE = 64;

const INTRO_MS = 2000;
const CEREMONY_MS = 3400;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The arrival swell: up fast, down slow, and zero at both ends so nothing ever
 * snaps into existence. Peaks around a sixth of a second after the payment
 * lands, which is late enough to read as a reaction and early enough to still
 * feel caused by it.
 */
const pop = (t: number) => Math.sin(Math.PI * Math.pow(clamp01(t), 0.62));

/** How long an arrival keeps swelling before it is just afterglow. */
const FLASH_MS = 460;

export class StreamRenderer {
  /** 0→1 over the opening two seconds. The field does not snap on, it dawns. */
  intro = 0;
  reducedMotion = false;
  fontFamily = "ui-monospace, monospace";
  onCeremony: ((c: Ceremony | null) => void) | null = null;

  private w = 0;
  private h = 0;
  private cx = 0;
  private cy = 0;
  private rx = 0;
  private ry = 0;

  /** Resting positions, recomputed only on resize. */
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  /** Drawn positions: resting, plus parallax, plus each agent's own wander. */
  private readonly ox: Float32Array;
  private readonly oy: Float32Array;
  /** Slow afterglow, ~1.4s. */
  private readonly energy: Float32Array;
  /** Fast arrival swell, ~0.46s. Counts 0→1 and then stops. */
  private readonly flash: Float32Array;
  /** Atmospheric perspective — the far edges of the field sit further back. */
  private readonly depth: Float32Array;
  /** Nobody breathes at the same rate as anybody else. */
  private readonly breath: Float32Array;

  private readonly particles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly edges = new Map<number, Edge>();

  private sky: HTMLCanvasElement | null = null;
  private sprites: { gold: HTMLCanvasElement; hot: HTMLCanvasElement; dim: HTMLCanvasElement; frost: HTMLCanvasElement } | null = null;
  private drift = 0;

  private pointerX = 0;
  private pointerY = 0;
  private hover = -1;

  private ceremony: { agent: number; t: number; particle: Particle | null } | null = null;

  constructor(private readonly agents: Agent[]) {
    const n = agents.length;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.ox = new Float32Array(n);
    this.oy = new Float32Array(n);
    this.energy = new Float32Array(n);
    this.flash = new Float32Array(n).fill(1);
    this.depth = new Float32Array(n).fill(1);
    this.breath = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Derived from the agent's own phase, so periods spread across a whole
      // second and the field never inhales together.
      this.breath[i] = 1180 + (agents[i].phase / (Math.PI * 2)) * 1040;
    }
    for (let i = 0; i < PARTICLES; i++) {
      this.particles.push({
        active: false, from: 0, to: 0, t: 0, dur: 1, amount: 0,
        refunded: false, ceremonial: false, curve: 0, cut: 1,
      });
    }
    for (let i = 0; i < RINGS; i++) {
      this.rings.push({ active: false, x: 0, y: 0, t: 0, dur: 1, radius: 1, ceremonial: false, colour: RGB.gold });
    }
  }

  /* ── viewport ──────────────────────────────────────────────────────────── */

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cx = w / 2;
    this.cy = h / 2;
    this.rx = w * 0.455;
    this.ry = h * 0.44;
    for (let i = 0; i < this.agents.length; i++) {
      this.px[i] = this.cx + this.agents[i].x * this.rx;
      this.py[i] = this.cy + this.agents[i].y * this.ry;
      this.ox[i] = this.px[i];
      this.oy[i] = this.py[i];
      // Agents at the rim read as further away, which stops the field looking
      // like stickers on glass and starts it looking like a volume.
      const d = Math.min(1, Math.hypot(this.agents[i].x, this.agents[i].y / 0.68));
      this.depth[i] = 1 - d * 0.3;
    }
    // Regenerated from a fixed seed, so resizing never reshuffles the sky.
    this.sky = skyTexture(w + 32, h + 32, rng(0x51a2_b3c4));

    // Four sprites for the entire scene, stamped at whatever size each draw
    // needs. Building one per node per frame — which is what happens the moment
    // a sprite key includes a breathing radius or a blended colour — is the
    // difference between 60fps and 9.
    this.sprites ??= {
      gold: glow(SPRITE, RGB.gold, 0.16),
      hot: glow(SPRITE, RGB.goldHot, 0.34),
      dim: glow(SPRITE, RGB.dim, 0.16),
      frost: glow(SPRITE, RGB.frost, 0.42),
    };
  }

  setPointer(x: number, y: number) {
    this.pointerX = x;
    this.pointerY = y;
  }

  clearPointer() {
    this.pointerX = -1;
    this.pointerY = -1;
    this.hover = -1;
  }

  hovered(): Agent | null {
    return this.hover >= 0 ? this.agents[this.hover] : null;
  }

  hoveredPoint(): { x: number; y: number } | null {
    return this.hover >= 0 ? { x: this.ox[this.hover], y: this.oy[this.hover] } : null;
  }

  /* ── frame ─────────────────────────────────────────────────────────────── */

  frame(ctx: CanvasRenderingContext2D, dt: number, time: number, incoming: Settlement[]) {
    this.intro = clamp01(this.intro + dt / INTRO_MS);
    this.drift += dt;

    // Hold the settlements back until the field has actually arrived. Payments
    // raining onto an empty screen would waste the one entrance we get.
    if (this.intro > 0.42) for (const s of incoming) this.spawn(s);

    this.decay(dt);
    this.place(time);
    this.step(dt);
    this.track();

    const dim = this.ceremonyDim(dt);

    ctx.globalCompositeOperation = "source-over";
    this.drawSky(ctx);

    this.drawEdges(ctx, time);
    this.drawNodes(ctx, time, -1);
    this.drawParticles(ctx, null);
    this.drawRings(ctx, false);

    // The ceremony: everything that is not this one agent recedes, and the
    // payment it is waiting for keeps its light.
    if (dim > 0) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = rgba([7, 10, 16], dim * 0.72);
      ctx.fillRect(0, 0, this.w, this.h);
      const id = this.ceremony?.agent ?? -1;
      if (id >= 0) {
        this.drawNodes(ctx, time, id);
        this.drawParticles(ctx, this.ceremony?.particle ?? null);
        this.drawRings(ctx, true);
      }
    }

    ctx.globalCompositeOperation = "source-over";
    this.drawLabels(ctx, dim);
  }

  /* ── spawning and stepping ─────────────────────────────────────────────── */

  private spawn(s: Settlement) {
    const p = this.particles.find((q) => !q.active);
    if (!p) return;

    const dx = this.px[s.to] - this.px[s.from];
    const dy = this.py[s.to] - this.py[s.from];
    const dist = Math.hypot(dx, dy) || 1;

    // First Light is the only thing on this screen allowed to interrupt.
    const ceremonial = s.firstLight && !this.ceremony && this.intro > 0.95;

    p.active = true;
    p.from = s.from;
    p.to = s.to;
    p.t = 0;
    // Distance sets the base, and every payment then varies by up to ±15% so no
    // two ever cross the field in lockstep.
    const jitter = 0.85 + ((s.id * 2654435761) % 1000) / 1000 * 0.3;
    p.dur = (520 + dist * 1.35) * jitter * (ceremonial ? 2.6 : 1) * (this.reducedMotion ? 0.6 : 1);
    p.amount = s.amount || this.agents[s.to].price;
    p.refunded = s.state === "refunded";
    p.ceremonial = ceremonial;
    p.curve = this.curveFor(s.from, s.to);
    p.cut = p.refunded ? 0.42 + ((s.id % 23) / 23) * 0.28 : 1;

    if (ceremonial) {
      this.ceremony = { agent: s.to, t: 0, particle: p };
      this.onCeremony?.({
        handle: this.agents[s.to].handle,
        service: this.agents[s.to].service,
        x: this.ox[s.to],
        y: this.oy[s.to],
        phase: "rising",
      });
    }

    if (!p.refunded) {
      const key = this.edgeKey(s.from, s.to);
      const e = this.edges.get(key);
      if (e) e.s = Math.min(1, e.s + 0.32);
      else this.edges.set(key, { a: s.from, b: s.to, s: 0.32, curve: p.curve });
    }
  }

  /** Stable per pair, so the same two agents always trade along the same lane. */
  private curveFor(a: number, b: number): number {
    const h = Math.imul(a + 1, 0x9e37_79b1) ^ Math.imul(b + 1, 0x85eb_ca6b);
    return (((h >>> 8) % 1000) / 1000 - 0.5) * 0.46;
  }

  private edgeKey(a: number, b: number) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return lo * this.agents.length + hi;
  }

  private step(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.t += dt / p.dur;

      if (p.refunded && p.t >= p.cut) {
        // Never delivered, so never paid. It comes apart where it stopped.
        const [x, y] = this.at(p, p.cut);
        this.ring(x, y, 26, 620, RGB.dim, false);
        p.active = false;
        continue;
      }

      if (p.t >= 1) {
        p.active = false;
        this.energy[p.to] = 1;
        this.flash[p.to] = 0;
        const x = this.ox[p.to];
        const y = this.oy[p.to];
        if (p.ceremonial) {
          this.ring(x, y, 190, 2200, RGB.goldHot, true);
          this.ring(x, y, 120, 1700, RGB.gold, true);
          this.ring(x, y, 64, 1200, RGB.goldHot, true);
          if (this.ceremony) {
            this.ceremony.particle = null;
            this.onCeremony?.({
              handle: this.agents[p.to].handle,
              service: this.agents[p.to].service,
              x, y,
              phase: "lit",
            });
          }
        } else {
          this.ring(x, y, 18 + Math.min(24, p.amount * 460), 880, RGB.gold, false);
        }
      }
    }

    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) r.active = false;
    }

    const k = Math.exp(-dt / 9000);
    if (this.edges.size > EDGE_CAP) {
      let weakest = -1;
      let low = Infinity;
      for (const [key, e] of this.edges) if (e.s < low) { low = e.s; weakest = key; }
      if (weakest >= 0) this.edges.delete(weakest);
    }
    for (const [key, e] of this.edges) {
      e.s *= k;
      if (e.s < 0.012) this.edges.delete(key);
    }
  }

  private decay(dt: number) {
    const k = Math.exp(-dt / 1400);
    const step = dt / FLASH_MS;
    for (let i = 0; i < this.energy.length; i++) {
      if (this.energy[i] > 0.001) this.energy[i] *= k;
      if (this.flash[i] < 1) this.flash[i] = Math.min(1, this.flash[i] + step);
    }
  }

  /**
   * Where each agent is actually drawn this frame.
   *
   * Two things move it, both barely. The field slides a few pixels against the
   * pointer while the sky slides the other way, which is the entire reason the
   * scene has depth; and every agent wanders on its own pair of slow sines, so
   * nothing on screen is ever perfectly still. Neither is meant to be noticed —
   * they are meant to be missed when they are gone.
   */
  private place(time: number) {
    if (this.reducedMotion) {
      this.ox.set(this.px);
      this.oy.set(this.py);
      return;
    }
    // Opposite sign to the sky's shift in drawSky, which is what makes it read
    // as parallax rather than as everything sliding together.
    const gx = this.pointerX < 0 ? 0 : (this.pointerX / this.w - 0.5) * 5;
    const gy = this.pointerY < 0 ? 0 : (this.pointerY / this.h - 0.5) * 4;

    for (let i = 0; i < this.agents.length; i++) {
      const ph = this.agents[i].phase;
      const d = this.depth[i];
      // Nearer agents parallax further, the way they would through a window.
      this.ox[i] = this.px[i] + gx * d + Math.sin(time * 0.00021 + ph * 2.3) * 1.7;
      this.oy[i] = this.py[i] + gy * d + Math.cos(time * 0.00017 + ph * 1.7) * 1.5;
    }
  }

  private ring(x: number, y: number, radius: number, dur: number, colour: readonly number[], ceremonial: boolean) {
    const r = this.rings.find((q) => !q.active);
    if (!r) return;
    r.active = true;
    r.x = x;
    r.y = y;
    r.t = 0;
    r.dur = dur;
    r.radius = radius;
    r.colour = colour;
    r.ceremonial = ceremonial;
  }

  /** Position along the arc at `t`. */
  private at(p: Particle, t: number): [number, number] {
    const ax = this.ox[p.from];
    const ay = this.oy[p.from];
    const bx = this.ox[p.to];
    const by = this.oy[p.to];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const qx = mx - (by - ay) * p.curve;
    const qy = my + (bx - ax) * p.curve;
    const e = easeInOut(clamp01(t));
    const u = 1 - e;
    return [
      u * u * ax + 2 * u * e * qx + e * e * bx,
      u * u * ay + 2 * u * e * qy + e * e * by,
    ];
  }

  private ceremonyDim(dt: number): number {
    if (!this.ceremony) return 0;
    this.ceremony.t += dt;
    const t = this.ceremony.t;
    if (t >= CEREMONY_MS) {
      this.ceremony = null;
      this.onCeremony?.(null);
      return 0;
    }
    // Up quickly, hold, then release slowly enough that you notice the world
    // coming back.
    if (t < 420) return easeOut(t / 420);
    if (t > CEREMONY_MS - 1000) return 1 - easeOut((t - (CEREMONY_MS - 1000)) / 1000);
    return 1;
  }

  private track() {
    if (this.pointerX < 0) {
      this.hover = -1;
      return;
    }
    let best = -1;
    let bestD = 26 * 26;
    for (let i = 0; i < this.agents.length; i++) {
      const dx = this.ox[i] - this.pointerX;
      const dy = this.oy[i] - this.pointerY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.hover = best;
  }

  /* ── drawing ───────────────────────────────────────────────────────────── */

  private drawSky(ctx: CanvasRenderingContext2D) {
    if (!this.sky) return;
    // The texture is opaque, so it clears the frame as it draws. Only the two
    // seconds of the intro need a separate fill underneath it to fade against.
    if (this.intro < 1) {
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    const slow = this.reducedMotion ? 0 : 1;
    // The sky answers the pointer a beat behind, which is the whole trick to
    // making a flat canvas feel like it has depth.
    const ox = (this.pointerX < 0 ? 0 : (this.pointerX / this.w - 0.5) * -14) * slow
      + Math.sin(this.drift / 24_000) * 6 * slow;
    const oy = (this.pointerY < 0 ? 0 : (this.pointerY / this.h - 0.5) * -10) * slow
      + Math.cos(this.drift / 31_000) * 5 * slow;
    ctx.globalAlpha = clamp01(this.intro * 1.6);
    ctx.drawImage(this.sky, -16 + ox, -16 + oy);
    ctx.globalAlpha = 1;
  }

  private nodeReveal(i: number): number {
    if (this.reducedMotion) return clamp01(this.intro * 2);
    const dx = (this.px[i] - this.cx) / (this.rx || 1);
    const dy = (this.py[i] - this.cy) / (this.ry || 1);
    const d = Math.min(1, Math.hypot(dx, dy));
    return clamp01((this.intro - d * 0.42) / 0.42);
  }

  private radiusOf(i: number, time: number): number {
    const a = this.agents[i];
    const breath = this.reducedMotion ? 1 : 1 + 0.06 * Math.sin(time / this.breath[i] + a.phase);
    // Standing is lifetime volume, so the hubs are visibly hubs before anything
    // moves. Depth shrinks the far ones very slightly.
    const standing = (2.1 + Math.log10(1 + a.calls) * 1.3) * (0.86 + this.depth[i] * 0.14);
    return standing * breath * (1 + this.energy[i] * 0.3 + pop(this.flash[i]) * 0.42);
  }

  private drawEdges(ctx: CanvasRenderingContext2D, _time: number) {
    if (this.edges.size === 0) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const e of this.edges.values()) {
      const near = this.hover === e.a || this.hover === e.b;
      // Quiet on purpose. Trade routes are context, not content — the moment
      // they are legible enough to read individually they start competing with
      // the payments moving along them.
      const alpha = (0.016 + e.s * 0.055) * (near ? 6 : 1) * this.intro;
      // Below this an edge is a stroke nobody can see, and there can be hundreds.
      if (alpha < 0.016) continue;
      const ax = this.ox[e.a];
      const ay = this.oy[e.a];
      const bx = this.ox[e.b];
      const by = this.oy[e.b];
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx - (by - ay) * e.curve, my + (bx - ax) * e.curve, bx, by);
      ctx.strokeStyle = rgba(near ? RGB.gold : mix(RGB.dim, RGB.gold, e.s * 0.6), alpha);
      ctx.lineWidth = near ? 1.1 : 0.7;
      ctx.stroke();
    }
  }

  /** Stamp one of the four sprites at an arbitrary size and opacity. */
  private stamp(ctx: CanvasRenderingContext2D, s: HTMLCanvasElement, x: number, y: number, r: number, alpha: number) {
    if (alpha <= 0.004 || r <= 0.2) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  }

  /** `only` draws a single agent — used to lift the ceremony out of the dark. */
  private drawNodes(ctx: CanvasRenderingContext2D, time: number, only: number) {
    const S = this.sprites;
    if (!S) return;
    ctx.globalCompositeOperation = "lighter";
    const start = only >= 0 ? only : 0;
    const end = only >= 0 ? only + 1 : this.agents.length;

    for (let i = start; i < end; i++) {
      const reveal = this.nodeReveal(i);
      if (reveal <= 0.001) continue;
      const a = this.agents[i];
      const e = this.energy[i];
      const f = pop(this.flash[i]);
      const lit = a.firstLightAt !== null;
      const hot = this.hover === i;
      const x = this.ox[i];
      const y = this.oy[i];

      const rad = this.radiusOf(i, time) * (hot ? 1.32 : 1);
      // Unlit agents are present but cold: deployed, waiting, never yet paid.
      const brightness = (lit ? 0.24 + e * 0.7 : 0.075) * reveal * this.depth[i] * (hot ? 1.6 : 1);

      // A wide halo on a resting node is almost entirely transparent pixels, and
      // there are two hundred of them. Only nodes that are actually doing
      // something pay for the big one; the rest get a tighter glow at higher
      // alpha, which looks the same and costs a quarter of the fill.
      const busy = e > 0.02 || hot;
      this.stamp(
        ctx,
        lit ? S.gold : S.dim,
        x, y,
        busy ? Math.max(9, rad * 7) : Math.max(6, rad * 3),
        brightness * (busy ? 0.34 : 0.6)
      );
      this.stamp(ctx, lit ? S.hot : S.frost, x, y, Math.max(3, rad * 2.1), brightness * 1.02);
      // The moment of payment: one bloom that swells and goes. It is the only
      // thing on the field brighter than the particles, and only for half a
      // second, which is what makes an arrival feel like it happened *to* you.
      if (f > 0.01) this.stamp(ctx, S.hot, x, y, rad * (2.4 + f * 4.4), f * 0.42 * reveal);
    }
    ctx.globalAlpha = 1;
  }

  /** `only` restricts to one particle, for the ceremony pass. */
  private drawParticles(ctx: CanvasRenderingContext2D, only: Particle | null) {
    const S = this.sprites;
    if (!S) return;
    ctx.globalCompositeOperation = "lighter";
    const list = only ? [only] : this.particles;

    for (const p of list) {
      if (!p.active || (!only && p.ceremonial)) continue;
      const t = clamp01(p.t);
      const fade = p.refunded ? clamp01(1 - (p.t / p.cut) * 0.55) : 1;
      const big = p.ceremonial ? 2.2 : 1;
      // Size carries the amount, so a large payment is visibly a large payment.
      const size = (4.4 + Math.min(7, Math.log10(1 + p.amount / 0.0004) * 3.4)) * big;
      const body = p.refunded ? S.dim : S.gold;
      const core = p.refunded ? S.dim : S.hot;

      // A short tapered wake. Three stamps read as motion; more just costs frames.
      for (let k = 3; k >= 1; k--) {
        const tt = t - k * 0.05;
        if (tt <= 0) continue;
        const [wx, wy] = this.at(p, tt);
        this.stamp(ctx, body, wx, wy, size * (1 - k * 0.14) * 2.3, 0.075 * (4 - k) * fade * big);
      }

      const [x, y] = this.at(p, t);
      this.stamp(ctx, body, x, y, size * 3.1, 0.34 * fade);
      this.stamp(ctx, core, x, y, size * 1.15, 0.85 * fade * easeOut(0.25 + t * 0.75));
    }
    ctx.globalAlpha = 1;
  }

  private drawRings(ctx: CanvasRenderingContext2D, ceremonial: boolean) {
    ctx.globalCompositeOperation = "lighter";
    for (const r of this.rings) {
      if (!r.active || r.ceremonial !== ceremonial) continue;
      // Quintic out: almost all of the travel happens in the first third, so the
      // ripple leaves fast and then hangs, which is how a real one behaves.
      const t = easeOutQuint(r.t);
      // Squared falloff keeps it from lingering as a hard circle at the end.
      const alpha = Math.pow(1 - r.t, 2) * (r.ceremonial ? 0.5 : 0.26);
      if (alpha <= 0.004) continue;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2 + r.radius * t, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(r.colour, alpha);
      // Thins as it expands, like the wave losing energy to its own circumference.
      ctx.lineWidth = (r.ceremonial ? 1.5 : 0.9) * (1 - r.t * 0.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Names are expensive attention. Only the busiest few and whatever the pointer
   * is on get one, which keeps the field a picture rather than a list.
   */
  private drawLabels(ctx: CanvasRenderingContext2D, dim: number) {
    if (this.intro < 0.7) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.textBaseline = "middle";

    const top: number[] = [];
    for (let i = 0; i < this.agents.length; i++) {
      if (this.energy[i] < 0.28 || i === this.hover) continue;
      top.push(i);
    }
    top.sort((a, b) => this.energy[b] - this.energy[a]);

    const fade = (1 - dim) * clamp01((this.intro - 0.7) / 0.3);
    for (const i of top.slice(0, 5)) {
      this.label(ctx, i, this.energy[i] * 0.5 * fade, false);
    }
    if (this.hover >= 0) this.label(ctx, this.hover, 1, true);
  }

  private label(ctx: CanvasRenderingContext2D, i: number, alpha: number, strong: boolean) {
    if (alpha <= 0.02) return;
    const a = this.agents[i];
    const x = this.ox[i] + 13;
    const y = this.oy[i];
    ctx.font = `${strong ? 500 : 400} 11px ${this.fontFamily}`;
    ctx.fillStyle = rgba(strong ? RGB.frost : RGB.gold, alpha);
    ctx.fillText(a.handle, x, y);
    if (strong) {
      ctx.font = `400 10px ${this.fontFamily}`;
      ctx.fillStyle = rgba(RGB.dim, 0.95);
      ctx.fillText(a.service, x, y + 13);
    }
  }
}
