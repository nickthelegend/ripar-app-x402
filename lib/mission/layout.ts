// Where the agents sit.
//
// A grid would be legible and dead. A pure random scatter would be alive and
// illegible. This is the middle: a handful of loose constellations placed on a
// golden-angle ring, each agent dropped around its cluster on a bell curve,
// then relaxed apart so no two nodes ever fuse into one blob.
//
// Runs once, at construction, from the seeded generator.

import { gaussian, type Rng } from "./rng";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export type Placed = { x: number; y: number; cluster: number };

export function placeAgents(count: number, clusters: number, r: Rng): Placed[] {
  const centres = Array.from({ length: clusters }, (_, i) => {
    const angle = i * GOLDEN * 2.4 + r() * 0.35;
    // Rings rather than one disc — the field reads as depth instead of soup.
    const radius = 0.22 + (i / Math.max(1, clusters - 1)) * 0.62 + gaussian(r, 0, 0.05);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72 };
  });

  const spread = 0.1 + 0.5 / Math.sqrt(clusters);
  const pts: Placed[] = Array.from({ length: count }, (_, i) => {
    const cluster = i % clusters;
    const c = centres[cluster];
    return {
      x: c.x + gaussian(r, 0, spread),
      y: c.y + gaussian(r, 0, spread * 0.72),
      cluster,
    };
  });

  relax(pts, 0.052, 46);

  // Pull the whole field back inside the viewport after relaxation pushed at it.
  let max = 0;
  for (const p of pts) max = Math.max(max, Math.abs(p.x), Math.abs(p.y) / 0.68);
  const k = max > 1 ? 0.98 / max : 1;
  for (const p of pts) {
    p.x *= k;
    p.y *= k;
  }
  return pts;
}

/** Pairwise repulsion below a minimum distance. O(n²) once at init is fine. */
function relax(pts: Placed[], min: number, iterations: number) {
  const min2 = min * min;
  for (let step = 0; step < iterations; step++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        // Vertical space is scarcer than horizontal, so measure in that shape.
        const dx = a.x - b.x;
        const dy = (a.y - b.y) / 0.68;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        const px = dx * push;
        const py = dy * push * 0.68;
        a.x += px;
        a.y += py;
        b.x -= px;
        b.y -= py;
      }
    }
  }
}
