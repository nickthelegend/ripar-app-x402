"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
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
