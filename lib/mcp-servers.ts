"use client";

import { useMemo, useSyncExternalStore } from "react";
import { MCP_TOOLS, type McpTool } from "./mcp-tools";

// Servers the user attached, kept in localStorage so a reload does not drop the
// handshake. Same shape as lib/store.ts: one cached snapshot, one window event,
// so the palette and the canvas stay in step without a state library.

export type McpServer = {
  id: string;
  url: string;
  label: string;
  /** Everything introspection reported, so disabled tools can be re-enabled. */
  tools: McpTool[];
  /** Tool ids the user turned on — only these reach the palette. */
  enabled: string[];
  connectedAt: string;
};

const KEY = "ripar-mcp-servers";
const EVENT = "ripar:mcp-servers";
const EMPTY: McpServer[] = [];

let cache: McpServer[] | null = null;

function isServer(v: unknown): v is McpServer {
  const s = v as McpServer | null;
  return (
    !!s &&
    typeof s.id === "string" &&
    typeof s.url === "string" &&
    typeof s.label === "string" &&
    Array.isArray(s.tools) &&
    Array.isArray(s.enabled)
  );
}

function read(): McpServer[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isServer) : EMPTY;
  } catch {
    // A hand-edited or half-written entry must never take the builder down.
    return EMPTY;
  }
}

function write(next: McpServer[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode or quota — the session still holds the new value */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  // A storage event means another tab wrote, so our snapshot is stale.
  const onStorage = () => {
    cache = null;
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot(): McpServer[] {
  if (cache === null) cache = read();
  return cache;
}

export function useMcpServers(): McpServer[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** Attaching the same host twice replaces it rather than doubling the palette. */
export function connectServer(server: McpServer) {
  write([...snapshot().filter((s) => s.id !== server.id), server]);
}

export function disconnectServer(id: string) {
  write(snapshot().filter((s) => s.id !== id));
}

export function setServerEnabled(id: string, enabled: string[]) {
  write(snapshot().map((s) => (s.id === id ? { ...s, enabled } : s)));
}

/** The built-in library plus every tool the user enabled on an attached server. */
export function useMcpCatalogue(): McpTool[] {
  const servers = useMcpServers();
  return useMemo(
    () => [...MCP_TOOLS, ...servers.flatMap((s) => s.tools.filter((t) => s.enabled.includes(t.id)))],
    [servers]
  );
}

export function useMcpToolIndex(): Map<string, McpTool> {
  const catalogue = useMcpCatalogue();
  return useMemo(() => new Map(catalogue.map((t) => [t.id, t])), [catalogue]);
}
