import { describe, expect, it } from "vitest";
import { useOverlayStore } from "./store";

function request(id: string, kind: "dialog" | "sheet" = "dialog") {
  return {
    id,
    kind,
    title: id,
    render: () => null,
  };
}

describe("overlay stack", () => {
  it("pushes, tops, and closes in LIFO order", () => {
    const store = useOverlayStore.getState();
    store.resetForTests();

    expect(useOverlayStore.getState().stack).toHaveLength(0);
    store.openOverlay(request("a"));
    store.openOverlay(request("b", "sheet"));
    expect(useOverlayStore.getState().stack.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);

    store.closeTopOverlay();
    expect(useOverlayStore.getState().stack.map((item) => item.id)).toEqual([
      "a",
    ]);

    store.closeOverlay("a");
    expect(useOverlayStore.getState().stack).toHaveLength(0);
  });

  it("reopening an id moves it to the top instead of duplicating", () => {
    const store = useOverlayStore.getState();
    store.resetForTests();

    store.openOverlay(request("a"));
    store.openOverlay(request("b"));
    store.openOverlay(request("a"));
    expect(useOverlayStore.getState().stack.map((item) => item.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("closeTop on an empty stack and closeAll are safe", () => {
    const store = useOverlayStore.getState();
    store.resetForTests();

    store.closeTopOverlay();
    expect(useOverlayStore.getState().stack).toHaveLength(0);
    store.openOverlay(request("a"));
    store.closeAllOverlays();
    expect(useOverlayStore.getState().stack).toHaveLength(0);
  });
});
