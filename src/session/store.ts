import { create } from "zustand";

/**
 * Document session as an explicit state machine. Only the transitions below
 * are legal; anything else is a no-op (and a bug if it ever happens).
 *
 *   idle → loading → ready ⇄ switching → ready
 *     │         ↓          ↓
 *     │       error ──────→ ready (recovered on a snapshot / fresh doc)
 *     └──────────────────→ error only from loading/switching
 *
 * - `loading`: boot or first open; editing is disabled.
 * - `ready`: a document is open and editable (unless a tab lock forces
 *   read-only, which is orthogonal to the machine).
 * - `switching`: exclusive operation in flight (open, duplicate, restore,
 *   update-reload). Editing is blocked and saves are flushed first.
 * - `error`: the open failed or the stored content was corrupt. Opening a
 *   corrupt document must never leave the editor read-only: the app falls
 *   back to the latest snapshot (or a fresh doc) and returns to `ready`
 *   with the failure recorded in `lastError`.
 */
export type SessionPhase = "idle" | "loading" | "ready" | "switching" | "error";

const TRANSITIONS: Record<SessionPhase, readonly SessionPhase[]> = {
  idle: ["loading"],
  loading: ["ready", "error"],
  ready: ["switching", "loading", "error"],
  switching: ["ready", "error"],
  error: ["loading", "ready"],
};

export function canTransition(from: SessionPhase, to: SessionPhase): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

interface SessionState {
  phase: SessionPhase;
  activeId: string | null;
  lastError: string | null;
  transition: (to: SessionPhase, detail?: { error?: string }) => boolean;
  setActiveId: (id: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  phase: "idle",
  activeId: null,
  lastError: null,
  transition: (to, detail) => {
    const from = get().phase;
    if (from === to) return true;
    if (!canTransition(from, to)) return false;
    set({
      phase: to,
      lastError: to === "error" ? (detail?.error ?? "Unknown error") : null,
    });
    return true;
  },
  setActiveId: (id) => set({ activeId: id }),
  reset: () => set({ phase: "idle", activeId: null, lastError: null }),
}));
