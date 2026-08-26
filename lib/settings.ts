"use client";

import { useSyncExternalStore } from "react";

// Workspace settings, kept on the device. Same one-cache-one-event shape as
// lib/store.ts and lib/mcp-servers.ts so the sidebar, the deploy panel and the
// settings form all read one source without a state library.

export type ApiKey = {
  id: string;
  name: string;
  /** Everything of the secret we keep: enough to recognise, not to use. */
  prefix: string;
  last4: string;
  created: string;
  lastUsed: string | null;
};

/**
 * Intended ceilings on outbound spend, kept on the device. Nothing reads them
 * before a payment: this app never signs one, so there is no request path to
 * refuse. Stated as such in the UI — if a spender is ever built here, this is
 * the shape it should obey, and the notice in the settings view comes out.
 */
export type SpendCaps = {
  enabled: boolean;
  perCall: number; // USDC, intended ceiling for a single outbound paid call
  daily: number; // USDC
  monthly: number; // USDC
};

export type Settings = {
  name: string;
  email: string;
  org: string;
  /** Where settlement pays. Validated against the Algorand checksum on save. */
  payout: string;
  caps: SpendCaps;
  keys: ApiKey[];
};

/**
 * The signed-out default.
 *
 * This used to be a persona — "Ava Chen", ava@example.com, a "Sample
 * workspace", a payout address derived from a fixed label, and two invented
 * API keys with plausible prefixes and a "lastUsed: 4 min ago". The auth
 * backend for this deployment is not reachable, so that persona is what every
 * visitor saw: an account they never created, holding credentials that never
 * existed. It reads as fabricated traction, and on a surface whose entire
 * argument is "check this against the chain yourself" that is the one thing it
 * cannot afford to look like.
 *
 * Signed out, the app now says so. The payout address is left empty rather than
 * filled with a lookalike: the Overview and Receipts views already read the
 * real payout from the deployed agent's own manifest, and an address nobody
 * holds the key to is worse than no address at all.
 */
const DEFAULT_SETTINGS: Settings = {
  name: "",
  email: "",
  org: "",
  payout: "",
  caps: { enabled: true, perCall: 0.5, daily: 25, monthly: 400 },
  keys: [],
};

const KEY = "ripar-settings";
const EVENT = "ripar:settings";

let cache: Settings | null = null;

function read(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // Nested shapes are merged by hand — a spread would let an older stored
      // record drop a field added since it was written.
      caps: { ...DEFAULT_SETTINGS.caps, ...(parsed.caps ?? {}) },
      keys: Array.isArray(parsed.keys) ? parsed.keys : DEFAULT_SETTINGS.keys,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function subscribe(cb: () => void) {
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

function getSettings(): Settings {
  if (cache === null) cache = read();
  return cache;
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS);
}

export function saveSettings(patch: Partial<Settings>) {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode or quota — the session still holds the new value */
  }
  window.dispatchEvent(new Event(EVENT));
}

/* ── API keys ─────────────────────────────────────────────────────────────── */

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** The full secret is returned once and never stored — only its shape is kept. */
export function mintApiKey(name: string, live: boolean): { key: ApiKey; secret: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join("");
  const prefix = live ? "rpk_live" : "rpk_test";
  return {
    secret: `${prefix}_${body}`,
    key: {
      id: `key_${live ? "live" : "test"}_${body.slice(0, 4)}`,
      name: name.trim(),
      prefix,
      last4: body.slice(-4),
      created: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      lastUsed: null,
    },
  };
}

export const maskKey = (k: ApiKey) => `${k.prefix}_${"•".repeat(24)}${k.last4}`;
