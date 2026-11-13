import type { ReactNode } from "react";
import { create } from "zustand";

/**
 * The single overlay stack for dialogs, sheets, menus and popovers.
 *
 * - Exactly one overlay renders at a time (the top of the stack), so there
 *   is exactly one scroll lock and Esc natively closes the top item.
 * - Overlays open ONLY through `openOverlay`; components never manage
 *   `open` state themselves.
 * - `render` closures must read through refs (or their own data hooks), not
 *   captured props: the host re-evaluates them on every render, but the
 *   closure is created once at open time.
 */
export type OverlayKind = "dialog" | "sheet";

export interface OverlayRequest {
  /** Stable id: reopening the same id replaces the entry in place. */
  id: string;
  kind: OverlayKind;
  /** Sheets only: which edge they dock to on wide screens. */
  side?: "left" | "right";
  title: string;
  description?: string;
  render: () => ReactNode;
}

export interface OverlayItem extends OverlayRequest {
  openedAt: number;
}

interface OverlayState {
  stack: OverlayItem[];
  openOverlay: (request: OverlayRequest) => string;
  closeOverlay: (id: string) => void;
  closeTopOverlay: () => void;
  closeAllOverlays: () => void;
  resetForTests: () => void;
}

export const useOverlayStore = create<OverlayState>()((set, get) => ({
  stack: [],
  openOverlay: (request) => {
    const item: OverlayItem = { ...request, openedAt: Date.now() };
    set((state) => {
      const without = state.stack.filter((entry) => entry.id !== item.id);
      return { stack: [...without, item] };
    });
    return request.id;
  },
  closeOverlay: (id) => {
    set((state) => ({ stack: state.stack.filter((entry) => entry.id !== id) }));
  },
  closeTopOverlay: () => {
    const { stack } = get();
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    if (top !== undefined) get().closeOverlay(top.id);
  },
  closeAllOverlays: () => {
    set({ stack: [] });
  },
  resetForTests: () => {
    set({ stack: [] });
  },
}));

/** The current top overlay, or null when the stack is empty. */
export function useTopOverlay(): OverlayItem | null {
  return useOverlayStore((state) =>
    state.stack.length === 0
      ? null
      : (state.stack[state.stack.length - 1] as OverlayItem),
  );
}
