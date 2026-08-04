"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { Economy, EMPTY_SNAPSHOT } from "./economy";
import type { EconomySnapshot } from "./types";

/**
 * One economy, shared by the canvas and the panels.
 *
 * The simulation is seeded and never reads the wall clock, so constructing it
 * on the server and again in the browser produces byte-identical state. That is
 * what lets the panels server-render with a mature economy already in them —
 * the page arrives with real figures instead of zeros waiting to be filled.
 */
const EconomyContext = createContext<Economy | null>(null);

export function EconomyProvider({ children, agents = 200 }: { children: ReactNode; agents?: number }) {
  const [economy] = useState(() => new Economy({ agents }));
  return <EconomyContext.Provider value={economy}>{children}</EconomyContext.Provider>;
}

export function useEconomy(): Economy {
  const economy = useContext(EconomyContext);
  if (!economy) throw new Error("useEconomy must be used inside <EconomyProvider>");
  return economy;
}

/**
 * Panels read here. The engine commits a new snapshot five times a second, not
 * sixty — a number nobody can read at frame rate has no business re-rendering
 * at frame rate.
 */
export function useEconomySnapshot(): EconomySnapshot {
  const economy = useContext(EconomyContext);
  return useSyncExternalStore(
    economy ? economy.subscribe : noopSubscribe,
    economy ? economy.getSnapshot : emptySnapshot,
    economy ? economy.getSnapshot : emptySnapshot
  );
}

const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY_SNAPSHOT;
