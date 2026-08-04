import type { DeployTargetId } from "@/lib/deploy-targets";

// Vector marks for the deploy targets, drawn here rather than fetched: an app
// that phones out to five logo CDNs leaks which host a customer deploys to, and
// a blocked request would leave the picker unlabelled. Each is decorative — the
// target's name is always rendered beside it.

type MarkProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  "aria-hidden": true as const,
  focusable: "false" as const,
});

/** Railway — rails in the brand's near-black. */
export function RailwayMark({ size = 22 }: MarkProps) {
  return (
    <svg {...base(size)} fill="#0B0D0E">
      <rect x="2" y="3.4" width="12" height="2.6" rx="1.3" />
      <circle cx="19.1" cy="4.7" r="2.6" />
      <rect x="2" y="10.7" width="20" height="2.6" rx="1.3" />
      <rect x="2" y="18" width="20" height="2.6" rx="1.3" />
    </svg>
  );
}

/** Render — the mint tile. */
export function RenderMark({ size = 22 }: MarkProps) {
  return (
    <svg {...base(size)}>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="#46E3B7" />
      <path
        fill="#0B1B17"
        d="M9 6.6h4.3c2.4 0 3.9 1.3 3.9 3.4 0 1.5-.8 2.6-2.2 3.1l2.5 4.3h-2.8l-2.2-3.9h-1.2v3.9H9zm2.3 2.1v3h1.8c1 0 1.6-.6 1.6-1.5s-.6-1.5-1.6-1.5z"
      />
    </svg>
  );
}

/** Fly.io — the balloon. */
export function FlyMark({ size = 22 }: MarkProps) {
  return (
    <svg {...base(size)}>
      <path
        fill="#7B3FE4"
        d="M12 1.8c-4 0-7.2 3.2-7.2 7.2 0 3 2.4 5.8 4.4 7.4.5.4.8 1 .8 1.6v.3h4v-.3c0-.6.3-1.2.8-1.6 2-1.6 4.4-4.4 4.4-7.4 0-4-3.2-7.2-7.2-7.2z"
      />
      <path fill="#24175B" fillOpacity="0.28" d="M12 1.8c1.4 0 2.5 3.2 2.5 7.2s-1.1 7.2-2.5 7.2z" />
      <path fill="none" stroke="#24175B" strokeWidth="1.1" strokeLinecap="round" d="M10.3 18.6 10.7 19.9M13.7 18.6 13.3 19.9" />
      <rect x="9.6" y="19.6" width="4.8" height="2.8" rx="0.9" fill="#24175B" />
    </svg>
  );
}

/** Heroku — the purple tile. */
export function HerokuMark({ size = 22 }: MarkProps) {
  return (
    <svg {...base(size)}>
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#430098" />
      <path
        fill="#fff"
        d="M8.1 6.3h2.4v4.4c1.3-.7 2.7-1.1 4-1.1 2 0 3.2 1.1 3.2 3.1v5h-2.4v-4.6c0-1-.5-1.5-1.4-1.5-1.1 0-2.3.4-3.4 1.2v4.9H8.1z"
      />
      <path fill="#fff" d="M14.4 6.3h2.4c-.2 1.5-1 2.7-2.2 3.5.2-1.2.1-2.3-.2-3.5z" />
    </svg>
  );
}

/** Docker — containers on the whale. The glyph is drawn a shade wider than the
 *  24-unit box (the spout reaches x≈25.2), so it is fitted back inside rather
 *  than clipped flat against the right edge by the SVG's own overflow. */
export function DockerMark({ size = 22 }: MarkProps) {
  return (
    <svg {...base(size)} fill="#2496ED">
      <g transform="translate(0.16 0) scale(0.92)">
        <path d="M5.4 9.5h2.9v2.9H5.4zM8.8 9.5h2.9v2.9H8.8zM12.2 9.5h2.9v2.9h-2.9zM15.6 9.5h2.9v2.9h-2.9zM8.8 6.1h2.9V9H8.8zM12.2 6.1h2.9V9h-2.9zM15.6 6.1h2.9V9h-2.9zM12.2 2.7h2.9v2.9h-2.9z" />
        <path d="M23.4 12.8c-.6-.4-1.9-.5-2.9-.3-.1-1-.7-1.8-1.7-2.6l-.6-.4-.4.6c-.5.8-.8 1.9-.7 3 0 .4.2.8.4 1.2-.5.3-1.4.6-2.6.6H.7c-.5 1.9.1 4.3 1.6 6 1.5 1.6 3.7 2.5 6.5 2.5 6.1 0 10.6-2.8 12.7-7.9 .8.1 2.6.1 3.5-1.7l.2-.4z" />
      </g>
    </svg>
  );
}

export const BRAND_MARKS: Record<DeployTargetId, (p: MarkProps) => React.JSX.Element> = {
  railway: RailwayMark,
  render: RenderMark,
  fly: FlyMark,
  heroku: HerokuMark,
  docker: DockerMark,
};
