"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { isDialogOpen } from "@/components/ui/dialog-stack";
import { cn } from "@/lib/utils";
import type { View } from "./sidebar";

// One source of truth: the handler and the overlay are built from the same map,
// so a shortcut cannot be listed but unbound, or bound but undocumented.
export const GO_KEYS: Record<string, View> = {
  o: "overview",
  c: "chat",
  e: "endpoints",
  w: "workflows",
  a: "agents",
  r: "receipts",
  s: "settings",
  d: "directory",
  j: "board",
  n: "register",
};

const VIEW_LABEL: Record<View, string> = {
  overview: "Overview",
  chat: "Chat",
  endpoints: "Endpoints",
  workflows: "Workflows",
  agents: "Agents",
  receipts: "Receipts",
  settings: "Settings",
  directory: "Directory",
  board: "Job board",
  register: "Register an agent",
};

const CHORD_MS = 1400;

/**
 * `g` then a letter jumps between surfaces. Held here rather than in each view
 * so the binding is the same everywhere, and suppressed while the user is
 * typing or a dialog is up — a shortcut that fires into a form is a bug.
 */
export function useShortcuts({
  onGo,
  onPalette,
  onHelp,
}: {
  onGo: (v: View) => void;
  onPalette: () => void;
  onHelp: () => void;
}): { chord: boolean } {
  const [chord, setChord] = useState(false);

  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      pending = false;
      setChord(false);
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        clear();
        onPalette();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // Behind a dialog the keys belong to the dialog, not to navigation.
      if (isDialogOpen()) return;

      if (e.key === "?") {
        e.preventDefault();
        clear();
        onHelp();
        return;
      }

      const key = e.key.toLowerCase();
      if (pending) {
        const target = GO_KEYS[key];
        clear();
        if (target) {
          e.preventDefault();
          onGo(target);
        }
        return;
      }
      if (key === "g") {
        pending = true;
        setChord(true);
        timer = setTimeout(clear, CHORD_MS);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, [onGo, onPalette, onHelp]);

  return { chord };
}

/** Shown while `g` is waiting for its second key, so the chord is not a secret. */
export function ChordHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-[90] flex items-center gap-2 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg">
      <Key>g</Key>
      <span className="text-neutral-400">then o · c · e · w · a · r · s · d · j · n</span>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold">
      {children}
    </kbd>
  );
}

function RowKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded border border-black/10 bg-neutral-50 px-1.5 py-0.5 font-sans text-[11.5px] font-semibold text-neutral-700">
      {children}
    </kbd>
  );
}

const GENERAL: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Search everything" },
  { keys: ["?"], label: "Show this list" },
  { keys: ["Esc"], label: "Close whatever is open" },
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Press g, then the letter of where you want to be."
      className="max-w-lg"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Group title="Go to">
          {Object.entries(GO_KEYS).map(([key, view]) => (
            <Row key={key} label={VIEW_LABEL[view]}>
              <RowKey>g</RowKey>
              <RowKey>{key}</RowKey>
            </Row>
          ))}
        </Group>
        <Group title="General">
          {GENERAL.map((s) => (
            <Row key={s.label} label={s.label}>
              {s.keys.map((k) => (
                <RowKey key={k}>{k}</RowKey>
              ))}
            </Row>
          ))}
        </Group>
      </div>
      <p className="mt-5 text-[12px] leading-relaxed text-neutral-400">
        Shortcuts stay out of the way while you are typing in a field or a dialog is open.
      </p>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      <ul className="mt-2 space-y-1">{children}</ul>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2 py-[3px] text-[13px] text-neutral-700")}>
      <span className="flex-1 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </li>
  );
}
