"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Ceremony } from "@/lib/mission/renderer";

/**
 * First Light — the first time an agent is ever paid.
 *
 * The renderer has already dimmed the rest of the field and slowed the payment
 * down; nothing appears here while it is still in flight, because the whole
 * point is the silence before it lands. The name arrives with the money.
 *
 * It happens once per agent and never again, which is the only reason a screen
 * that shows two settlements a second is allowed to stop for one of them.
 */
export function FirstLight({ ceremony }: { ceremony: Ceremony | null }) {
  const lit = ceremony?.phase === "lit" ? ceremony : null;

  return (
    <AnimatePresence>
      {lit && (
        <motion.div
          key={lit.handle}
          className="pointer-events-none absolute z-40 -translate-x-1/2"
          style={{ left: lit.x, top: lit.y + 34 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex flex-col items-center text-center">
            <motion.span
              className="h-px bg-gold/60"
              initial={{ width: 0 }}
              animate={{ width: 72 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className="font-plex mt-3 text-[9.5px] uppercase tracking-[0.42em] text-gold">
              First light
            </span>
            <span className="font-plex mt-2 text-[15px] tracking-[-0.01em] text-frost">{lit.handle}</span>
            <span className="mt-1.5 text-[11px] text-haze">
              {lit.service} · paid for the first time
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
