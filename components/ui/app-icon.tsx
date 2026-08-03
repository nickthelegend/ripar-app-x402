import Image from "next/image";
import { cn } from "@/lib/utils";

export function AppIcon({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[24%] bg-gradient-to-b from-white to-[#e7e7ec] shadow-[0_4px_12px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-black/5",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/ripar-mark.png"
        alt=""
        width={size}
        height={size}
        priority
        className="object-contain"
        style={{ width: size * 0.62, height: size * 0.62 }}
      />
    </div>
  );
}
