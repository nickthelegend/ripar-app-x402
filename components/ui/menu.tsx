"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Lightweight dropdown menu: a trigger + a floating panel that closes on
// outside-click or Escape. No external dependency — used for every menu in the
// app (org switcher, user menu, model selector, project menu, etc.).
export function Menu({
  trigger,
  children,
  align = "start",
  side = "bottom",
  panelClassName,
}: {
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  side?: "bottom" | "top";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 min-w-[220px] rounded-xl border border-black/[0.08] bg-white p-1 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.28)]",
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
            align === "end" ? "right-0" : "left-0",
            "origin-top motion-safe:animate-[menuIn_120ms_ease-out]",
            panelClassName
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  danger,
  shortcut,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        danger
          ? "text-rose-600 hover:bg-rose-50"
          : "text-neutral-700 hover:bg-neutral-100"
      )}
    >
      {icon && <span className={cn("shrink-0", danger ? "text-rose-500" : "text-neutral-400")}>{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-[11px] text-neutral-400">{shortcut}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{children}</div>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-black/[0.06]" />;
}
