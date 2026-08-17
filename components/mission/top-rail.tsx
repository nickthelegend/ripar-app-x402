"use client";

import { useEconomySnapshot } from "@/lib/mission/use-economy";
import { Label, Odometer, Pulse } from "./bits";

/**
 * The thinnest possible chrome: who we are, what we are watching, and the fact
 * that none of it is real yet. The simulated badge is not a disclaimer bolted
 * on — this repo puts illustrative figures behind a label every time, and a
 * screen this convincing needs it more than most.
 */
export function TopRail() {
  const s = useEconomySnapshot();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-2.5">
        <Mark />
        <span className="font-plex text-[12px] tracking-[0.14em] text-frost">RIPAR</span>
        <span className="hidden h-3 w-px bg-white/15 sm:block" />
        <Label className="hidden text-haze/80 sm:block">Mission Control</Label>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-4">
        <span className="rounded-full border border-gold/25 bg-gold/[0.07] px-2 py-[3px]">
          <Label className="text-[8.5px] text-gold/85">Simulated</Label>
        </span>
        <Label className="hidden font-plex tnum text-haze md:block">
          <Odometer value={s.agents} format={(n) => String(Math.round(n))} /> agents
        </Label>
        {/* The elapsed clock lived here. It told you nothing you needed and it
            was the only thing on screen changing every second for no reason. */}
        <span className="flex items-center gap-2">
          <Pulse />
          <Label className="text-mint/70">Live</Label>
        </span>
      </div>
    </header>
  );
}

/** An agent, and the settlements leaving it. */
function Mark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="8" r="2.4" fill="#E8B65A" />
      <path d="M10 4.6a4.6 4.6 0 0 1 0 6.8" stroke="#E8B65A" strokeOpacity="0.6" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M12.4 2.4a7.8 7.8 0 0 1 0 11.2" stroke="#E8B65A" strokeOpacity="0.26" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
