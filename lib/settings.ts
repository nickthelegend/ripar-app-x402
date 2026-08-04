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

// A real, checksum-valid address so the app is never demonstrating an invalid
// one. It belongs to no wallet — it is derived from a fixed label.
const SAMPLE_PAYOUT = "NWYNM3QBRXMDICW4PCNMV4LAVA52CKM4KL7IVGSXZ46EFLFCZXXR2MBEUM";

const DEFAULT_SETTINGS: Settings = {
  name: "Ava Chen",
  email: "ava@example.com",
  org: "Sample workspace",
  payout: SAMPLE_PAYOUT,
  caps: { enabled: true, perCall: 0.5, daily: 25, monthly: 400 },
  keys: [
    { id: "key_live_9f21", name: "Production server", prefix: "rpk_live", last4: "9c4e", created: "12 Jun 2026", lastUsed: "4 min ago" },
    { id: "key_test_3a70", name: "Local development", prefix: "rpk_test", last4: "1b83", created: "2 Jul 2026", lastUsed: null },
  ],
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
