"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_TONE, type AgentStatus, type Status } from "@/lib/app-data";

/** Status never rides on colour alone — the dot is paired with its label. */
export function StatusPill({ status, className }: { status: Status | AgentStatus; className?: string }) {
  const t = STATUS_TONE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium", t.text, className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} />
      {t.label}
    </span>
  );
}

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[68ch] text-[13.5px] text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-black/10 bg-white py-1.5 pl-8 pr-8 text-[13.5px] outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 transition-colors hover:text-neutral-900"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium transition-colors",
            value === o.value
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-900"
          )}
        >
          {o.label}
          {o.count != null && (
            <span className={cn("ml-1.5 tnum", value === o.value ? "text-neutral-400" : "text-neutral-400")}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** A figure with its unit and label. Kept small — the app is not a billboard. */
export function Metric({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[12px] text-neutral-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tnum text-[19px] font-semibold tracking-tight text-neutral-900">{value}</span>
        {unit && <span className="text-[12px] text-neutral-400">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11.5px] text-neutral-400">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-black/12 px-6 py-14 text-center">
      <p className="text-[14.5px] font-medium text-neutral-800">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-neutral-500">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Column header that sorts. Direction is announced, not just drawn. */
export function SortHeader<K extends string>({
  label,
  field,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  field: K;
  sort: { field: K; dir: "asc" | "desc" };
  onSort: (f: K) => void;
  align?: "left" | "right";
}) {
  const active = sort.field === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1 rounded transition-colors hover:text-neutral-900",
          active ? "text-neutral-900" : "text-neutral-400"
        )}
      >
        {label}
        <span aria-hidden className={cn("text-[9px]", active ? "opacity-100" : "opacity-0")}>
          {sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.09] bg-white">{children}</div>
  );
}

/** Copies `text` and says so. A blocked clipboard is reported rather than
 *  swallowed, because the user is otherwise left believing they have the value. */
export function CopyButton({
  text,
  label = "Copy",
  what,
  className,
}: {
  text: string;
  label?: string;
  /** Named in the screen-reader label, e.g. "Copy fly.toml". */
  what?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Insecure origin or a denied permission — the text is on screen to select.
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={what ? `${label} ${what}` : label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] font-medium transition-colors",
        state === "failed" ? "border-rose-200 text-rose-600" : "text-neutral-500 hover:border-black/20 hover:text-neutral-900",
        className
      )}
    >
      {state === "copied" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Select it instead" : label}
      </span>
    </button>
  );
}

/** A named block of code or config with its own copy button. */
export function CodeBlock({
  title,
  filename,
  body,
  note,
  maxHeight = "none",
}: {
  title: string;
  filename?: string;
  body: string;
  note?: ReactNode;
  maxHeight?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 pb-1.5">
        <h4 className="text-[12.5px] font-semibold text-neutral-900">{title}</h4>
        {filename && (
          <span className="rounded bg-black/[0.04] px-1.5 py-px font-mono text-[11px] text-neutral-500">
            {filename}
          </span>
        )}
        <CopyButton text={body} what={filename ?? title} className="ml-auto" />
      </div>
      <pre
        style={{ maxHeight }}
        className="overflow-auto rounded-lg border border-black/[0.07] bg-neutral-50 p-3 font-mono text-[12px] leading-[1.65] text-neutral-700"
      >
        {body}
      </pre>
      {note && <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">{note}</p>}
    </div>
  );
}
