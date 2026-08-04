"use client";

import { useEffect } from "react";

// How many modal surfaces are currently open. Global shortcuts read this to
// stay out of the way while a dialog has the user's attention.
//
// Counted from the `open` prop rather than sniffed out of the DOM: an exit
// animation that never finishes — a throttled tab, reduced motion, an
// interrupted transition — leaves the node behind, and a shortcut layer that
// keyed off that node would go quiet for the rest of the session.

let open = 0;

export const isDialogOpen = () => open > 0;

/** Counts a surface as open for as long as it is. */
export function useDialogStack(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    open++;
    return () => {
      open--;
    };
  }, [isOpen]);
}
