import { describe, expect, it } from "vitest";
import { canTransition, useSessionStore } from "./store";

describe("session state machine", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("idle", "loading")).toBe(true);
    expect(canTransition("loading", "ready")).toBe(true);
    expect(canTransition("loading", "error")).toBe(true);
    expect(canTransition("ready", "switching")).toBe(true);
    expect(canTransition("switching", "ready")).toBe(true);
    expect(canTransition("switching", "error")).toBe(true);
    expect(canTransition("error", "ready")).toBe(true);
    expect(canTransition("error", "loading")).toBe(true);
    expect(canTransition("ready", "loading")).toBe(true);

    // Illegal jumps are rejected: boot cannot complete from idle, exclusive
    // ops cannot start before a document exists, and error is terminal
    // except through an explicit recovery.
    expect(canTransition("idle", "ready")).toBe(false);
    expect(canTransition("idle", "switching")).toBe(false);
    expect(canTransition("idle", "error")).toBe(false);
    expect(canTransition("ready", "idle")).toBe(false);
    expect(canTransition("switching", "loading")).toBe(false);
    expect(canTransition("switching", "switching")).toBe(false);
    expect(canTransition("error", "switching")).toBe(false);
  });

  it("walks boot → ready, records errors, and recovers", () => {
    useSessionStore.getState().reset();
    const store = useSessionStore.getState();
    expect(store.phase).toBe("idle");

    expect(store.transition("loading")).toBe(true);
    expect(useSessionStore.getState().phase).toBe("loading");

    // Illegal jump from loading straight to switching is ignored.
    expect(useSessionStore.getState().transition("switching")).toBe(false);
    expect(useSessionStore.getState().phase).toBe("loading");

    expect(
      useSessionStore.getState().transition("error", { error: "corrupt" }),
    ).toBe(true);
    expect(useSessionStore.getState().lastError).toBe("corrupt");

    // Recovery: fall back to a snapshot and return to ready.
    expect(useSessionStore.getState().transition("ready")).toBe(true);
    expect(useSessionStore.getState().phase).toBe("ready");
    expect(useSessionStore.getState().lastError).toBeNull();

    // Exclusive operation and back.
    expect(useSessionStore.getState().transition("switching")).toBe(true);
    expect(useSessionStore.getState().transition("ready")).toBe(true);

    useSessionStore.getState().reset();
    expect(useSessionStore.getState().phase).toBe("idle");
  });
});
