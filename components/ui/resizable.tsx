"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function save(id: string, value: number | null) {
  // localStorage can throw (private mode, quota) — resizing must never crash.
  try {
    if (value === null) localStorage.removeItem(`ripar-panel-${id}`);
    else localStorage.setItem(`ripar-panel-${id}`, String(Math.round(value)));
  } catch {
    /* non-fatal */
  }
}

// Drag-to-resize for split panels. Returns a pixel width to apply to the panel
// plus props for <ResizeHandle>. The width persists per `id` (localStorage),
// double-clicking the handle resets to the default, and arrow keys resize
// when the handle is focused (keyboard alternative to dragging).
export function useResizable(
  id: string,
  { initial, min, max, invert = false }: { initial: number; min: number; max: number; invert?: boolean }
) {
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(initial);
  const [dragging, setDragging] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, w)), [min, max]);

  // Restore the saved width after mount (localStorage is client-only).
  useEffect(() => {
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(`ripar-panel-${id}`));
    } catch {
      /* non-fatal */
    }
    if (saved && !Number.isNaN(saved)) {
      const w = clamp(saved);
      widthRef.current = w;
      setWidth(w);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Remove in-flight drag listeners if the component unmounts mid-drag.
  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (cleanupRef.current) return; // one drag at a time
      e.preventDefault();
      setDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startW = widthRef.current;

      const finish = (ev?: PointerEvent) => {
        if (ev && ev.pointerId !== pointerId) return;
        cleanup();
        setDragging(false);
        save(id, widthRef.current);
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        // Button already released (missed pointerup / pointercancel) → stop.
        if (ev.buttons === 0) {
          finish(ev);
          return;
        }
        const delta = ev.clientX - startX;
        const w = clamp(startW + (invert ? -delta : delta));
        widthRef.current = w;
        setWidth(w);
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        cleanupRef.current = null;
      };
      cleanupRef.current = cleanup;

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [id, invert, clamp]
  );

  const onDoubleClick = useCallback(() => {
    widthRef.current = initial;
    setWidth(initial);
    save(id, null);
  }, [id, initial]);

  // Keyboard alternative: focus the handle, then Arrow keys resize.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 48 : 16;
      let delta = 0;
      if (e.key === "ArrowLeft") delta = invert ? step : -step;
      else if (e.key === "ArrowRight") delta = invert ? -step : step;
      else if (e.key === "Home") {
        e.preventDefault();
        onDoubleClick();
        return;
      } else return;
      e.preventDefault();
      const w = clamp(widthRef.current + delta);
      widthRef.current = w;
      setWidth(w);
      save(id, w);
    },
    [id, invert, clamp, onDoubleClick]
  );

  return { width, dragging, handleProps: { onPointerDown, onDoubleClick, onKeyDown } };
}

// The grab strip between two panels. Invisible until hovered/dragged, with a
// generous 7px hit area that overlaps both neighbors. Focusable for keyboard
// resizing (arrows; Home resets).
export function ResizeHandle({
  dragging,
  className,
  ...props
}: { dragging?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      {...props}
      className={cn("group relative z-10 -mx-[3px] w-[7px] shrink-0 cursor-col-resize touch-none", className)}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full transition-colors duration-150",
          dragging ? "bg-blue-500" : "bg-transparent group-hover:bg-blue-400/70 group-focus-visible:bg-blue-400/70"
        )}
      />
    </div>
  );
}
