// Log lines for the Logs view. Generated in the browser rather than fetched —
// but generated from the endpoints that actually exist, at the levels their
// status would produce, so filtering and searching behave like the real thing.

import { ENDPOINTS, SAMPLE_CALLERS, USDC_ASSET_ID, type Endpoint } from "./app-data";
import { shortAddress } from "./algorand-address";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogLine = {
  id: number;
  at: number;
  level: LogLevel;
  slug: string;
  message: string;
};

export const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export const LEVEL_TONE: Record<LogLevel, { dot: string; text: string; label: string }> = {
  debug: { dot: "bg-neutral-300", text: "text-neutral-400", label: "DEBUG" },
  info: { dot: "bg-sky-500", text: "text-sky-700", label: "INFO" },
  warn: { dot: "bg-amber-500", text: "text-amber-700", label: "WARN" },
  error: { dot: "bg-rose-500", text: "text-rose-700", label: "ERROR" },
};

/** Only a live endpoint has traffic — a paused one going quiet is the point. */
const LOGGING_ENDPOINTS = ENDPOINTS.filter((e) => e.status === "live" || e.status === "error");

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const hex = (n: number) =>
  Array.from({ length: n }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");

type Template = { level: LogLevel; render: (e: Endpoint) => string };

const HEALTHY: Template[] = [
  { level: "info", render: (e) => `402 quote issued · ${e.price.toFixed(3)} USDC · caller ${shortAddress(pick(SAMPLE_CALLERS))}` },
  { level: "info", render: (e) => `200 · settled ${e.price.toFixed(3)} USDC · tx ${hex(8)} · ${Math.round(e.p50 * (0.8 + Math.random() * 0.5))}ms` },
  { level: "debug", render: () => `x-payment verified · asset ${USDC_ASSET_ID} · round ${48_210_000 + Math.floor(Math.random() * 900)}` },
  { level: "debug", render: (e) => `quote cache hit · ${e.slug} · age ${Math.floor(Math.random() * 9) + 1}s` },
  { level: "debug", render: () => `handler cold start skipped · warm pool 3/3` },
  { level: "warn", render: () => `quote expired before payment · caller re-quoted` },
  { level: "warn", render: (e) => `retry 1/3 · upstream timeout after ${Math.max(1000, e.p50 * 2)}ms` },
];

const FAILING: Template[] = [
  { level: "error", render: (e) => `handler 502 · not settled · caller keeps ${e.price.toFixed(3)} USDC` },
  { level: "error", render: () => `payment rejected · signature does not match payload` },
  { level: "warn", render: () => `list provider slow · 5400ms · falling back to cached lists` },
  { level: "info", render: (e) => `402 quote issued · ${e.price.toFixed(3)} USDC · caller ${shortAddress(pick(SAMPLE_CALLERS))}` },
];

let nextId = 1;

function makeLine(at: number, endpoint?: Endpoint): LogLine {
  const e = endpoint ?? pick(LOGGING_ENDPOINTS);
  // A degraded endpoint mostly emits failures; a healthy one mostly does not.
  const templates = e.status === "error" ? (Math.random() < 0.7 ? FAILING : HEALTHY) : HEALTHY;
  const t = pick(templates);
  return { id: nextId++, at, level: t.level, slug: e.slug, message: t.render(e) };
}

/** A backlog ending at `now`, oldest first. */
function seedLog(count: number, now: number): LogLine[] {
  const lines: LogLine[] = [];
  let at = now - count * 1400;
  for (let i = 0; i < count; i++) {
    at += 300 + Math.floor(Math.random() * 2200);
    lines.push(makeLine(Math.min(at, now)));
  }
  return lines;
}

/* ── the stream ───────────────────────────────────────────────────────────── */

// A log stream is an external system, not component state: it arrives on its own
// schedule and must not be built during render, because the backlog is derived
// from the clock and the server's would never match the browser's. Owning it out
// here also means pausing survives a trip to another view.

/** Enough backlog to scroll, capped so a tab left open overnight cannot grow. */
const BACKLOG = 70;
export const CEILING = 500;
const TICK_MS = 1400;

let buffer: LogLine[] | null = null;
let live = true;
let timer: ReturnType<typeof setInterval> | null = null;
const watchers = new Set<() => void>();

const announce = () => watchers.forEach((cb) => cb());

function tick() {
  if (!buffer) return;
  buffer = [...buffer, makeLine(Date.now())].slice(-CEILING);
  announce();
}

function retime() {
  if (timer) clearInterval(timer);
  timer = live && watchers.size > 0 ? setInterval(tick, TICK_MS) : null;
}

export const logStream = {
  subscribe(cb: () => void) {
    // The backlog is built on the first subscribe — after mount, never during a
    // render, so hydration compares like with like.
    if (buffer === null) {
      buffer = seedLog(BACKLOG, Date.now());
      queueMicrotask(announce);
    }
    watchers.add(cb);
    retime();
    return () => {
      watchers.delete(cb);
      retime();
    };
  },
  /** null until the stream has attached — the view renders its loading state. */
  snapshot: (): LogLine[] | null => buffer,
  serverSnapshot: (): LogLine[] | null => null,
  isLive: () => live,
  setLive(next: boolean) {
    live = next;
    retime();
    announce();
  },
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 12:04:31.221 — fixed width so the column never reflows as lines arrive. */
export function stamp(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
