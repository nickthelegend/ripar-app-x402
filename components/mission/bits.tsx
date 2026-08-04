"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { dna } from "@/lib/mission/dna";
import { useAnimationFrame } from "@/lib/mission/use-animation-frame";

/**
 * The panel surface. Everything on this screen floats above the stream rather
 * than boxing it in, so the glass has to be thin enough to see the economy
 * through and solid enough to read numbers on.
 */
export function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative rounded-[14px] border border-white/[0.07] backdrop-blur-2xl",
        "bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05),rgba(255,255,255,0.014))]",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_30px_80px_-40px_rgba(0,0,0,1)]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Small tracked caps. The instrument voice — used for every label on screen. */
export function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("font-plex text-[9.5px] uppercase tracking-[0.2em] text-haze", className)}>
      {children}
    </div>
  );
}

/**
 * A figure that counts toward its target instead of jumping to it.
 *
 * Writes textContent from inside the animation loop, so a number changing sixty
 * times a second costs zero React renders. The initial text is rendered normally
 * so the server sends the real value and hydration has nothing to correct.
 */
export function Odometer({
  value,
  format,
  className,
  /** Time constant in ms. Lower is snappier; revenue wants slower than counts. */
  ease = 240,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  ease?: number;
}) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const target = useRef(value);
  target.current = value;

  useAnimationFrame((dt) => {
    const gap = target.current - shown.current;
    if (Math.abs(gap) < 1e-7) return;
    shown.current += gap * Math.min(1, dt / ease);
    if (el.current) el.current.textContent = format(shown.current);
  });

  return (
    <span ref={el} className={cn("tnum", className)}>
      {format(value)}
    </span>
  );
}

/** Live indicator. Breathes rather than blinks — a blink reads as an alarm. */
export function Pulse({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex h-[5px] w-[5px]", className)}>
      <span className="absolute inline-flex h-full w-full animate-[missionPulse_2.4s_ease-in-out_infinite] rounded-full bg-mint" />
      <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-mint" />
    </span>
  );
}

/**
 * Agent DNA, in its placeholder form: a strand grown from the handle alone.
 * See lib/mission/dna.ts for what it is meant to become.
 */
export function Dna({ handle, className }: { handle: string; className?: string }) {
  const strands = dna(handle);
  return (
    <div className={cn("flex h-5 items-end gap-[2px]", className)} aria-hidden>
      {strands.map((s, i) => (
        <span
          key={i}
          className={cn("w-[2px] rounded-full", s.warm ? "bg-gold/70" : "bg-haze/45")}
          style={{ height: `${Math.round(s.height * 100)}%` }}
        />
      ))}
    </div>
  );
}
