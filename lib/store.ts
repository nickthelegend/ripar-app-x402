"use client";

import { useSyncExternalStore } from "react";
import { saveOnboardingRow, saveProfileRow, type OnboardingRow } from "@/lib/db";

// Tiny localStorage-backed stores with a window event, so distant components
// (sidebar, settings, checklist, editor) stay in sync without a state library.

const EVENT = "ripar:store";

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  // A storage event means ANOTHER tab wrote — our module caches are stale.
  const onStorage = () => {
    profileCache = null;
    creditsCache = null;
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  // localStorage can throw (private mode, quota) — the in-memory cache still
  // holds the new value, so the session keeps working either way.
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
  emit();
}

/* ---------------------------------- profile --------------------------------- */

export type Profile = { name: string; email: string; role: string };

const PROFILE_KEY = "ripar-profile";
const PROFILE_DEFAULT: Profile = { name: "No Name", email: "you@example.com", role: "Owner" };

// Cache snapshots so useSyncExternalStore gets stable object identities.
let profileCache: Profile | null = null;

export function getProfile(): Profile {
  if (profileCache === null) profileCache = read(PROFILE_KEY, PROFILE_DEFAULT);
  return profileCache;
}

export function setProfile(patch: Partial<Profile>) {
  profileCache = { ...getProfile(), ...patch };
  write(PROFILE_KEY, profileCache);
  // Write-through to Supabase when signed in (no-op otherwise).
  saveProfileRow({ name: profileCache.name, email: profileCache.email });
}

// Hydrate from Supabase without writing back (avoids echo loops).
export function hydrateProfile(patch: Partial<Profile>) {
  profileCache = { ...getProfile(), ...patch };
  write(PROFILE_KEY, profileCache);
}

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, getProfile, () => PROFILE_DEFAULT);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/* ------------------------------ credits + setup ----------------------------- */

export type ChecklistStep = { id: string; label: string; desc: string; credits: number };

export const CHECKLIST_STEPS: ChecklistStep[] = [
  { id: "create", label: "Create your first agent", desc: "Open the builder and meet the Playground.", credits: 2000 },
  { id: "chat", label: "Chat with your agent", desc: "Send it a message and watch it think.", credits: 1000 },
  { id: "knowledge", label: "Attach a knowledge base", desc: "Ground its answers in your own data.", credits: 2000 },
  { id: "publish", label: "Publish your project", desc: "Ship it to a live URL your team can use.", credits: 5000 },
  { id: "invite", label: "Invite a teammate", desc: "Agents are better with reviewers.", credits: 5000 },
];

export const CHECKLIST_TOTAL = CHECKLIST_STEPS.reduce((n, s) => n + s.credits, 0);

type Credits = { earned: number; done: string[]; dismissed: boolean };

const CREDITS_KEY = "ripar-credits";
const CREDITS_DEFAULT: Credits = { earned: 0, done: [], dismissed: false };

let creditsCache: Credits | null = null;

export function getCredits(): Credits {
  if (creditsCache === null) creditsCache = read(CREDITS_KEY, CREDITS_DEFAULT);
  return creditsCache;
}

export function useCredits(): Credits {
  return useSyncExternalStore(subscribe, getCredits, () => CREDITS_DEFAULT);
}

// Marks a step complete. Returns the credits granted (0 if already done),
// so callers can toast "+2,000 credits earned".
export function completeStep(id: string): number {
  const state = getCredits();
  if (state.done.includes(id)) return 0;
  const step = CHECKLIST_STEPS.find((s) => s.id === id);
  if (!step) return 0;
  creditsCache = { ...state, done: [...state.done, id], earned: state.earned + step.credits };
  write(CREDITS_KEY, creditsCache);
  saveOnboardingRow(creditsCache);
  return step.credits;
}

export function dismissChecklist() {
  creditsCache = { ...getCredits(), dismissed: true };
  write(CREDITS_KEY, creditsCache);
  saveOnboardingRow(creditsCache);
}

// Merge a Supabase onboarding row with local progress: union of completed
// steps, credits recomputed from the union, dismissed if either side says so.
// Returns true when the merge produced something newer than the DB row (the
// caller should write it back).
export function hydrateCredits(row: OnboardingRow): boolean {
  const local = getCredits();
  const done = Array.from(new Set([...row.done, ...local.done])).filter((id) =>
    CHECKLIST_STEPS.some((s) => s.id === id)
  );
  const earned = CHECKLIST_STEPS.filter((s) => done.includes(s.id)).reduce((n, s) => n + s.credits, 0);
  const merged: Credits = { earned, done, dismissed: row.dismissed || local.dismissed };
  creditsCache = merged;
  write(CREDITS_KEY, merged);
  // Set equality on contents, not lengths — equal-sized but different arrays
  // must still trigger a write-back.
  const sameDone = [...done].sort().join(",") === [...row.done].sort().join(",");
  return !sameDone || merged.dismissed !== row.dismissed || earned !== row.earned;
}

// Wipe local caches back to defaults (used on sign-out so the next user on
// this browser doesn't inherit — or contaminate — the previous user's state).
export function resetLocalState() {
  profileCache = { ...PROFILE_DEFAULT };
  creditsCache = { ...CREDITS_DEFAULT };
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(CREDITS_KEY);
  } catch {
    /* non-fatal */
  }
  emit();
}
