"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check, Info } from "lucide-react";

type Tone = "default" | "success" | "error";
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; tone: Tone; action?: ToastAction };
type ToastApi = { toast: (message: string, tone?: Tone, action?: ToastAction) => void };

const ToastContext = createContext<ToastApi | null>(null);

// Safe to call outside a provider (returns a no-op) so components never crash.
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { toast: () => {} };
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Tone = "default", action?: ToastAction) => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, tone, action }]);
    // Toasts with an action linger a bit longer so the user can reach them.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 5000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-neutral-900 py-2 pl-3 pr-4 text-sm font-medium text-white shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]"
            >
              {t.tone === "success" && <Check className="h-4 w-4 text-emerald-400" />}
              {t.tone === "error" && <AlertCircle className="h-4 w-4 text-rose-400" />}
              {t.tone === "default" && <Info className="h-4 w-4 text-neutral-400" />}
              {t.message}
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    setToasts((list) => list.filter((x) => x.id !== t.id));
                  }}
                  className="-mr-1 ml-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/25"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
