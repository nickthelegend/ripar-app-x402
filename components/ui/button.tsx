import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost";

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: {
  children: ReactNode;
  variant?: Variant;
} & ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-all duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "btn-shine px-6 py-3 text-white"
          : "px-4 py-2 text-neutral-500 hover:text-neutral-800",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
