"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  CheckCheck,
  MessageSquare,
  Rocket,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SlideOver } from "@/components/ui/slide-over";
import { fetchNotifications, markNotificationsRead } from "@/lib/db";

// kind → visual treatment for DB-backed notifications.
const KIND_STYLE: Record<string, { icon: React.ReactNode; bg: string }> = {
  deploy: { icon: <Rocket className="h-4 w-4 text-white" />, bg: "from-blue-500 to-indigo-600" },
  error: { icon: <AlertCircle className="h-4 w-4 text-white" />, bg: "from-rose-500 to-red-600" },
  comment: { icon: <MessageSquare className="h-4 w-4 text-white" />, bg: "from-violet-500 to-purple-600" },
  digest: { icon: <BarChart3 className="h-4 w-4 text-white" />, bg: "from-emerald-500 to-teal-600" },
  info: { icon: <Sparkles className="h-4 w-4 text-white" />, bg: "from-amber-400 to-orange-500" },
};

type Notification = {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};

const seed: Notification[] = [
  {
    id: "n1",
    icon: <Rocket className="h-4 w-4 text-white" />,
    iconBg: "from-blue-500 to-indigo-600",
    title: "Financial Reconciliation is live",
    body: "Deployed to production · e1378.deployments.ripar.io",
    time: "2m ago",
    unread: true,
  },
  {
    id: "n2",
    icon: <AlertCircle className="h-4 w-4 text-white" />,
    iconBg: "from-rose-500 to-red-600",
    title: "Run failed: run_6b93de",
    body: "reconcile step timed out after 30s — retried once.",
    time: "1h ago",
    unread: true,
  },
  {
    id: "n3",
    icon: <MessageSquare className="h-4 w-4 text-white" />,
    iconBg: "from-violet-500 to-purple-600",
    title: "Ava Chen commented on validate_tx",
    body: "“Should we also flag duplicates within the same batch?”",
    time: "2h ago",
    unread: true,
  },
  {
    id: "n4",
    icon: <Sparkles className="h-4 w-4 text-white" />,
    iconBg: "from-amber-400 to-orange-500",
    title: "New integration: NetSuite",
    body: "Sync journals and vendor bills straight into your agents.",
    time: "1d ago",
    unread: false,
  },
  {
    id: "n5",
    icon: <BarChart3 className="h-4 w-4 text-white" />,
    iconBg: "from-emerald-500 to-teal-600",
    title: "Weekly digest",
    body: "128 runs · 94% success · 41k tokens saved by caching.",
    time: "2d ago",
    unread: false,
  },
];

// Bell button + its notifications drawer, self-contained so it can sit in the
// dashboard sidebar and the editor header alike.
export function NotificationsBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(seed);
  // True once the feed is DB-backed; mark-reads then write through.
  const [dbBacked, setDbBacked] = useState(false);
  const unread = items.filter((n) => n.unread).length;

  useEffect(() => {
    let live = true;
    fetchNotifications().then((rows) => {
      if (!live || !rows) return;
      setDbBacked(true);
      setItems(
        rows.map((r) => {
          const style = KIND_STYLE[r.kind] ?? KIND_STYLE.info;
          return { id: r.id, icon: style.icon, iconBg: style.bg, title: r.title, body: r.body, time: r.time, unread: r.unread };
        })
      );
    });
    return () => {
      live = false;
    };
  }, []);

  const markAll = () => {
    setItems((list) => list.map((n) => ({ ...n, unread: false })));
    if (dbBacked) markNotificationsRead("all");
  };
  const markOne = (id: string) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    if (dbBacked) markNotificationsRead([id]);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700",
          className
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff6b2b] px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unread}
          </span>
        )}
      </button>

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You're all caught up."}
        icon={<Bell className="h-4 w-4" />}
      >
        <div className="-mt-1 mb-3 flex justify-end">
          <button
            onClick={markAll}
            disabled={unread === 0}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
          </button>
        </div>
        <div className="space-y-1.5">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => markOne(n.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                n.unread ? "border-blue-100 bg-blue-50/40 hover:bg-blue-50/70" : "border-black/[0.06] hover:bg-neutral-50"
              )}
            >
              <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br", n.iconBg)}>
                {n.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-neutral-900">{n.title}</span>
                  {n.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-neutral-500">{n.body}</span>
                <span className="mt-1 block text-[10px] text-neutral-400">{n.time}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-[11px] text-neutral-300">That&apos;s everything from the last 30 days.</p>
      </SlideOver>
    </>
  );
}
