// Pre-rendered light.
//
// Canvas has two ways to draw a glow. `shadowBlur` is one of them and it is a
// per-draw blur that will not hold 60fps with a few hundred nodes. The other is
// to render one radial gradient into an offscreen canvas at startup and then
// stamp it with drawImage under `lighter` compositing, which is a texture blit
// and effectively free. Everything luminous on this screen is that second thing.

import { PALETTE, rgba } from "./palette";
import { between, type Rng } from "./rng";

const cache = new Map<string, HTMLCanvasElement>();

function surface(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

/**
 * A soft dot: bright core, gaussian-ish falloff, fully transparent at the rim.
 * `core` widens the hot centre — high values read as a hard point of light,
 * low values as an atmospheric haze.
 */
export function glow(radius: number, colour: readonly number[], core = 0.22): HTMLCanvasElement {
  const key = `${radius}|${colour.join(",")}|${core}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = Math.max(4, Math.ceil(radius * 2));
  const c = surface(size);
  const ctx = c.getContext("2d")!;
  const mid = size / 2;
  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  g.addColorStop(0, rgba(colour, 1));
  g.addColorStop(core, rgba(colour, 0.55));
  g.addColorStop(core + (1 - core) * 0.45, rgba(colour, 0.12));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  cache.set(key, c);
  return c;
}

/** Drop the sprite cache when the device pixel ratio changes under us. */
export const clearSprites = () => cache.clear();

/**
 * The backdrop: the ink base, a few enormous soft clouds for depth, a scatter of
 * stars, and the vignette that sinks the corners.
 *
 * All four are baked into one opaque texture at resize, so the entire backdrop
 * costs a single drawImage per frame. Drawn live they would be three
 * full-screen fills — one of them a radial gradient, the most expensive fill
 * there is — before a single agent had been drawn.
 */
export function skyTexture(w: number, h: number, r: Rng): HTMLCanvasElement {
  const c = surface(1);
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 5; i++) {
    const cx = between(r, -0.1, 1.1) * w;
    const cy = between(r, -0.1, 1.1) * h;
    const rad = between(r, 0.28, 0.62) * Math.max(w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    // Barely-there blue haze. If you can point at it, it is too strong.
    g.addColorStop(0, `rgba(28,42,70,${between(r, 0.1, 0.2).toFixed(3)})`);
    g.addColorStop(1, "rgba(28,42,70,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const stars = Math.round((w * h) / 5200);
  for (let i = 0; i < stars; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = r() < 0.9 ? between(r, 0.4, 0.9) : between(r, 0.9, 1.7);
    const a = between(r, 0.12, 0.55);
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210,224,248,${a.toFixed(3)})`;
    ctx.fill();
  }

  // The parallax only ever shifts this texture by a dozen pixels, so a vignette
  // centred here stays centred on screen.
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.78);
  v.addColorStop(0, "rgba(7,10,16,0)");
  v.addColorStop(1, "rgba(7,10,16,0.82)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);

  return c;
}
