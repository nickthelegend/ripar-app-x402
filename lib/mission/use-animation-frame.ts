"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One requestAnimationFrame loop, callback swapped by ref so changing the body
 * never restarts the clock.
 *
 * Browsers stop firing rAF in a hidden tab and then hand back the whole gap as
 * a single delta on return. Resetting the timestamp on visibilitychange keeps
 * that gap out of the simulation, which is the difference between coming back
 * to a running field and coming back to a flood.
 */
export function useAnimationFrame(fn: (dtMs: number, timeMs: number) => void, active = true) {
  const cb = useRef(fn);
  useEffect(() => {
    cb.current = fn;
  });

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      cb.current(dt, now);
    };

    const resync = () => {
      last = performance.now();
    };

    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", resync);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [active]);
}

/**
 * Starts false so the server and the first client render agree, then settles to
 * the real setting on mount and tracks changes to it.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}
