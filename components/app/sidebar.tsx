"use client";

import { Activity, Bot, Keyboard, LayoutGrid, MessageSquare, Plug, Receipt, ScrollText, Search, Settings, Wallet } from "lucide-react";
import { Mark } from "@/components/ui/mark";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/app-data";
import { useWorkspace } from "@/lib/real-data";
import { shortAddress } from "@/lib/algorand-address";
import { useSettings } from "@/lib/settings";

export type View =
  | "overview" | "chat" | "endpoints" | "workflows" | "agents" | "logs" | "receipts" | "settings";

export const NAV: { id: View; label: string; Icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", Icon: LayoutGrid },
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "endpoints", label: "Endpoints", Icon: Plug },
  { id: "workflows", label: "Workflows", Icon: Activity },
  { id: "agents", label: "Agents", Icon: Bot },
  { id: "logs", label: "Logs", Icon: ScrollText },
  { id: "receipts", label: "Receipts", Icon: Receipt },
];

export function Sidebar({
  view,
  onSelect,
  onSearch,
  onWithdraw,
  onSettings,
  onShortcuts,
}: {
  view: View;
  onSelect: (v: View) => void;
  onSearch: () => void;
  onWithdraw: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
}) {
  const { name, payout } = useSettings();
  // Real earnings, from settlements to the deployed agent's payout address.
  // It reads 0.00 until somebody actually pays, and that is the honest number.
  const { data: ws } = useWorkspace();
  const earned = ws?.mine.earnedUsdc ?? 0;
  const calls = ws?.mine.calls ?? 0;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2.5 px-3 py-3.5">
        <Mark size={26} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13.5px] font-semibold text-neutral-900">Ripar</span>
          <span className="block text-[11px] text-neutral-400">Algorand MainNet</span>
        </span>
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="mx-2.5 flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[12.5px] text-neutral-400 transition-colors hover:border-black/15"
      >
        <Search size={13} />
        Search
        <kbd className="ml-auto rounded border border-black/10 bg-neutral-50 px-1.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <nav className="mt-3 space-y-0.5 px-2">
        {NAV.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] font-medium transition-colors",
                active ? "bg-black/[0.055] text-neutral-900" : "text-neutral-500 hover:bg-black/[0.03] hover:text-neutral-900"
              )}
            >
              {active && <span className="absolute inset-y-1.5 left-0 w-[2.5px] rounded-full bg-accent" />}
              <Icon size={15} className={active ? "text-accent" : "text-neutral-400"} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 p-2.5">
        <div className="rounded-xl border border-black/[0.08] bg-white p-3">
          <div className="text-[11.5px] text-neutral-500">Settled to your address</div>
          <div className="tnum mt-0.5 text-[17px] font-semibold tracking-tight text-neutral-900">
            {usd(earned)}{" "}
            <span className="text-[11px] font-medium text-neutral-400">USDC</span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            {calls === 0 ? "no paid calls yet" : `${calls} paid ${calls === 1 ? "call" : "calls"}`}
          </div>
          <button
            type="button"
            onClick={onWithdraw}
            className="mt-2.5 w-full rounded-lg bg-neutral-900 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Withdraw to wallet
          </button>
        </div>

        <Menu
          align="start"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-black/[0.03]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-[9px] font-bold text-white">
                {initials}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[12.5px] font-medium text-neutral-800">{name}</span>
                <span className="block truncate font-mono text-[10.5px] text-neutral-400">{shortAddress(payout)}</span>
              </span>
            </button>
          )}
        >
          <MenuItem icon={<Wallet size={14} />} onClick={onWithdraw}>Withdraw</MenuItem>
          <MenuItem icon={<Settings size={14} />} onClick={onSettings}>Settings</MenuItem>
          <MenuItem icon={<Keyboard size={14} />} shortcut="?" onClick={onShortcuts}>Keyboard shortcuts</MenuItem>
        </Menu>
      </div>
    </div>
  );
}
