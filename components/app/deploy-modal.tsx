"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { Endpoint } from "@/lib/app-data";
import { DEPLOY_TARGETS, deployPlan, type DeployTargetId } from "@/lib/deploy-targets";
import { useSettings } from "@/lib/settings";
import { BRAND_MARKS } from "./brand-marks";
import { CodeBlock } from "./bits";

/**
 * Ripar owns the quote, the payment check and the receipt. The handler itself
 * runs on whatever host the team already pays for, so this hands over the exact
 * commands and config for that host rather than pretending to deploy for them.
 */
export function DeployModal({
  endpoint,
  open,
  onClose,
}: {
  endpoint: Endpoint | null;
  open: boolean;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<DeployTargetId>("railway");
  const { payout } = useSettings();
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const blocks = useMemo(
    () => (endpoint ? deployPlan(target, endpoint, payout) : []),
    [endpoint, target, payout]
  );

  const chosen = DEPLOY_TARGETS.find((t) => t.id === target)!;

  // Arrow keys move the choice, which is what a radio group is for — the picker
  // is one decision, not five independent buttons.
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + DEPLOY_TARGETS.length) % DEPLOY_TARGETS.length;
    setTarget(DEPLOY_TARGETS[next].id);
    items.current[next]?.focus();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={endpoint ? `Deploy ${endpoint.name}` : "Deploy"}
      description="Ripar keeps the 402 quote, the payment check and the receipt. Your handler runs wherever you like — pick a host and take the exact config."
      className="max-w-2xl"
    >
      {endpoint && (
        <div className="space-y-5">
          <div role="radiogroup" aria-label="Deploy target" className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {DEPLOY_TARGETS.map((t, i) => {
              const Mark = BRAND_MARKS[t.id];
              const on = t.id === target;
              return (
                <button
                  key={t.id}
                  ref={(el) => { items.current[i] = el; }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setTarget(t.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  style={on ? { borderColor: t.colour, boxShadow: `inset 0 0 0 1px ${t.colour}` } : undefined}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-colors",
                    on ? "bg-white" : "border-black/[0.08] hover:border-black/20"
                  )}
                >
                  <Mark size={22} />
                  <span className="text-[12.5px] font-semibold text-neutral-900">{t.name}</span>
                  <span className="text-[11px] leading-snug text-neutral-500">{t.blurb}</span>
                </button>
              );
            })}
          </div>

          <div className="max-h-[46vh] space-y-4 overflow-y-auto rounded-xl border border-black/[0.07] bg-white p-3.5">
            {blocks.map((b) => (
              <CodeBlock key={b.title} title={b.title} filename={b.filename} body={b.body} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-neutral-500">
              <span className="font-mono text-[11.5px]">RIPAR_PAYOUT</span> is the address settlement pays
              — change it under Settings and these commands change with it. Ripar never runs the deploy
              for you; nothing above has been executed.
            </p>
            <a
              href={chosen.docs}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-600 transition-colors hover:border-black/20 hover:text-neutral-900"
            >
              {chosen.name} docs <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
