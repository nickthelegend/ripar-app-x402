"use client";

import { useState } from "react";
import { TIMELINE_SPAN_MS } from "@/lib/mission/economy";
import { age } from "@/lib/mission/format";
import { useEconomySnapshot } from "@/lib/mission/use-economy";
import { Glass, Label } from "./bits";

/**
 * The last six minutes of the economy, five seconds to a bar.
 *
 * There was a replay scrubber here — a track and a handle that could not be
 * dragged, because replay does not exist yet. It has been cut. A control that
 * mimes a feature is worse than no control, and it was the second brightest
 * thing on a screen whose whole job is to point at the stream.
 *
 * What is left is real: the histogram, and a cursor that reads the actual count
 * in whichever bucket you point at. Replay lands on its own branch, with the
 * scrubber that earns its place by working.
 */
export function Timeline() {
  const s = useEconomySnapshot();
  const [cursor, setCursor] = useState<number | null>(null);

  const bars = s.histogram;
  let max = 1;
  for (const b of bars) if (b > max) max = b;

  const bucketMs = TIMELINE_SPAN_MS / bars.length;

  return (
    <Glass className="w-full px-5 pt-3.5 pb-4">
      <div className="flex items-center justify-between">
        <Label className="text-haze/75">Last 6 minutes</Label>
        <div className="font-plex tnum text-[10px] text-haze">
          {cursor !== null && (
            <span className="text-frost/85">
              {bars[cursor]} settled · {age((bars.length - 1 - cursor) * bucketMs)} ago
            </span>
          )}
        </div>
      </div>

      <div
        className="group relative mt-2.5 h-[30px] cursor-crosshair"
        onPointerLeave={() => setCursor(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor(((e.clientX - r.left) / r.width) * bars.length);
          setCursor(Math.max(0, Math.min(bars.length - 1, i)));
        }}
      >
        <div className="flex h-full items-end gap-[2px]">
          {bars.map((b, i) => {
            const h = Math.max(2, (b / max) * 100);
            // The right-hand end is the present, and reads warmer for it.
            const recency = i / (bars.length - 1);
            return (
              <span
                key={i}
                className="flex-1 rounded-t-[1.5px] transition-[opacity,background-color] duration-150"
                style={{
                  height: `${h}%`,
                  // Cool and quiet at the old end, warming only as it reaches
                  // the present. A wall of gold down here would fight the field.
                  background: `rgba(${Math.round(107 + recency * 125)},${Math.round(
                    122 + recency * 60
                  )},${Math.round(147 - recency * 57)},${(0.3 + recency * 0.34).toFixed(3)})`,
                  opacity: cursor === null || cursor === i ? 1 : 0.5,
                }}
              />
            );
          })}
        </div>

        {cursor !== null && (
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-frost/25"
            style={{ left: `${((cursor + 0.5) / bars.length) * 100}%` }}
          />
        )}
      </div>
    </Glass>
  );
}
