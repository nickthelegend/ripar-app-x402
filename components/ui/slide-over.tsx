"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDialogStack } from "./dialog-stack";

// Right-side drawer for secondary panels (version history, run history,
// activity, notifications). Slides in from the edge; dismiss on scrim click
// or Escape. Portaled to <body> so ancestors with backdrop-filter/transform
// (which trap fixed-position descendants) can't clip it.
export function SlideOver({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useDialogStack(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          // AnimatePresence identifies its children by key.
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[70] flex justify-end bg-black/40 backdrop-blur-[2px]"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            onClick={(e) => e.stopPropagation()}
            className={cn("flex h-full w-full flex-col bg-white shadow-2xl", width)}
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/[0.07] px-5 py-4">
              <div className="flex items-start gap-3">
                {icon && <span className="mt-0.5 text-neutral-400">{icon}</span>}
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">{title}</h2>
                  {description && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{description}</p>}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
