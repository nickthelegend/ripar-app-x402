"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import type { Ceremony } from "@/lib/mission/renderer";
import { EconomyProvider } from "@/lib/mission/use-economy";
import { FirstLight } from "./first-light";
import { MissionSummary } from "./mission-summary";
import { SettlementFeed } from "./settlement-feed";
import { StreamCanvas } from "./stream-canvas";
import { Timeline } from "./timeline";
import { TopRail } from "./top-rail";

/**
 * Mission Control.
 *
 * The stream is full-bleed and everything else floats over it on glass, because
 * the moment you put the visualisation in a box beside the panels it becomes a
 * chart. The panels are the instruments; the field is the thing.
 *
 * The opening is staged: the sky, then the agents in a wave outward from the
 * centre, then the first payments, then the glass. Roughly two seconds, and it
 * only ever plays once.
 */
export function MissionControl() {
  return (
    <EconomyProvider agents={200}>
      <Field />
    </EconomyProvider>
  );
}

function Field() {
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const onCeremony = useCallback((c: Ceremony | null) => setCeremony(c), []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink text-frost">
      <StreamCanvas onCeremony={onCeremony} />
      <FirstLight ceremony={ceremony} />
      <TopRail />

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3 pt-[52px] sm:gap-4 sm:p-5 sm:pt-[60px]">
        <Panel delay={1.05} className="pointer-events-auto lg:hidden">
          <MissionSummary />
        </Panel>

        <div className="flex min-h-0 flex-1 gap-4">
          <Panel delay={1.05} className="pointer-events-auto hidden w-[268px] shrink-0 self-start lg:block">
            <MissionSummary />
          </Panel>

          <div className="min-w-0 flex-1" />

          <Panel delay={1.18} className="pointer-events-auto hidden w-[318px] shrink-0 lg:block">
            <SettlementFeed />
          </Panel>
        </div>

        <Panel delay={1.18} className="pointer-events-auto h-[34dvh] shrink-0 lg:hidden">
          <SettlementFeed />
        </Panel>

        <Panel delay={1.3} className="pointer-events-auto hidden shrink-0 sm:block">
          <Timeline />
        </Panel>
      </div>
    </div>
  );
}

/** The glass arrives after the field it sits on, never before. */
function Panel({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
