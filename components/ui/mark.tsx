// The Ripar mark — a fan of four blades opening from a single pivot.
// Single source for the navbar, the footer and app/icon.svg.
//
// Deliberately NOT a radial burst: it spans ~90° rather than 360°, the pivot
// sits off-centre instead of in the middle, the blade widths are uneven, and
// there is no dot at the centre. Radially symmetric marks with a centre dot
// are the single most crowded shape in AI branding right now, and this has to
// not read as one of them.
const BOUNDS = [8, 32, 56, 78, 98]; // blade edges in degrees, uneven on purpose
const RADII = [34, 36.5, 34, 30]; // varied so the outer edge is cut, not arced
const GAP = 2.6; // degrees of air between blades
const TONES = ["hi", "lt", "md", "dk"] as const;

const STOPS: [string, string, string][] = [
  ["hi", "#ffd9a3", "#ff8f42"],
  ["lt", "#ff9d4f", "#ff6620"],
  ["md", "#f4541b", "#c93400"],
  ["dk", "#b62c00", "#8a2000"],
];

/** Blade triangles, then fitted into the 48 box so the fan sits centred and
 *  stays inside the circle that social avatars get cropped to. */
const BLADES = (() => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const tris = RADII.map((r, i) => {
    const [a0, a1] = [BOUNDS[i] + GAP / 2, BOUNDS[i + 1] - GAP / 2];
    return [
      [0, 0],
      [r * Math.cos(rad(a0)), -r * Math.sin(rad(a0))],
      [r * Math.cos(rad(a1)), -r * Math.sin(rad(a1))],
    ] as [number, number][];
  });

  const xs = tris.flat().map((p) => p[0]);
  const ys = tris.flat().map((p) => p[1]);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - minX, Math.max(...ys) - minY];
  const s = 37 / Math.max(w, h);
  const ox = 24 - (minX + w / 2) * s;
  const oy = 24 - (minY + h / 2) * s;
  const fit = ([x, y]: [number, number]) =>
    `${+(x * s + ox).toFixed(2)} ${+(y * s + oy).toFixed(2)}`;

  return tris.map((t) => `M${fit(t[0])} L${fit(t[1])} L${fit(t[2])} Z`);
})();

export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  const p = "ripar-fan";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        {STOPS.map(([k, a, b]) => (
          <linearGradient key={k} id={`${p}-${k}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        ))}
      </defs>
      {BLADES.map((d, i) => (
        <path key={i} d={d} fill={`url(#${p}-${TONES[i]})`} />
      ))}
    </svg>
  );
}
