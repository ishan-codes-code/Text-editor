import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayHost } from "./OverlayHost";
import { useOverlayStore } from "./store";

/** Lets a pending history.back() from an earlier close land first. */
async function settleHistory(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(async () => {
  await settleHistory();
});

afterEach(async () => {
  cleanup();
  useOverlayStore.getState().resetForTests();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  await settleHistory();
});

function openSheet(id = "docs") {
  useOverlayStore.getState().openOverlay({
    id,
    kind: "sheet",
    side: "left",
    title: "Documents",
    description: "Pick a document.",
    render: () => <div>panel body</div>,
  });
}

describe("OverlayHost", () => {
  it("renders only the top overlay with its own scroll region", async () => {
    render(<OverlayHost />);
    openSheet("a");
    useOverlayStore.getState().openOverlay({
      id: "b",
      kind: "dialog",
      title: "Second",
      render: () => <div>second body</div>,
    });
    // jsdom matchMedia stub reports no match: bottom-sheet path.
    expect(await screen.findByText("second body")).not.toBeNull();
    expect(screen.queryByText("panel body")).toBeNull();
    expect(screen.getByText("Second")).not.toBeNull();
  });

  it("Escape closes the top item", async () => {
    const user = userEvent.setup();
    render(<OverlayHost />);
    openSheet();
    expect(await screen.findByText("panel body")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("panel body")).toBeNull();
  });

  it("Android back closes the top item via CloseWatcher when available", async () => {
    const cancels: ((event: Event) => void)[] = [];
    const destroyed: unknown[] = [];
    vi.stubGlobal(
      "CloseWatcher",
      class {
        oncancel: ((event: Event) => void) | null = null;
        constructor() {
          cancels.push((event) => this.oncancel?.(event));
        }
        destroy() {
          destroyed.push(this);
        }
      },
    );
    const depth = history.length;
    render(<OverlayHost />);
    openSheet();
    expect(await screen.findByText("panel body")).not.toBeNull();
    // CloseWatcher path pushes no history entry.
    expect(history.length).toBe(depth);
    expect(cancels).toHaveLength(1);

    // The platform back button fires cancel; the overlay consumes it.
    const prevented: boolean[] = [];
    cancels[0]?.({
      preventDefault: () => {
        prevented.push(true);
      },
    } as unknown as Event);
    expect(prevented).toEqual([true]);
    await waitFor(() => {
      expect(screen.queryByText("panel body")).toBeNull();
    });
    expect(destroyed).toHaveLength(1);
    expect(history.length).toBe(depth);
  });
});
