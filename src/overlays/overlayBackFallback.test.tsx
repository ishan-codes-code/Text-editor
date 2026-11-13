import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayHost } from "./OverlayHost";
import { useOverlayStore } from "./store";

// The history-entry back-button fallback is tested in its own file: jsdom
// shares one session history per file, and these assertions need each test
// to leave the pointer where it found it. Real history.back() (not a
// synthetic popstate, which fires listeners without traversing) keeps the
// entries balanced.

afterEach(() => {
  cleanup();
  useOverlayStore.getState().resetForTests();
  document.body.innerHTML = "";
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

describe("overlay history fallback", () => {
  it("a user back press closes only the top item", async () => {
    render(<OverlayHost />);
    openSheet();
    expect(await screen.findByText("panel body")).not.toBeNull();
    // The session entry is current while the overlay is open.
    expect(history.state).toEqual({ overlay: true });
    history.back();
    await waitFor(() => {
      expect(screen.queryByText("panel body")).toBeNull();
    });
  });

  it("a programmatic close removes the fallback entry", async () => {
    const user = userEvent.setup();
    render(<OverlayHost />);
    openSheet();
    expect(await screen.findByText("panel body")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("panel body")).toBeNull();
    // The cleanup history.back() traverses away from the session entry.
    await waitFor(() => {
      expect(history.state).not.toEqual({ overlay: true });
    });
    // Reopening pushes a fresh entry and a back press closes it again.
    openSheet("again");
    expect(await screen.findByText("panel body")).not.toBeNull();
    expect(history.state).toEqual({ overlay: true });
    history.back();
    await waitFor(() => {
      expect(screen.queryByText("panel body")).toBeNull();
    });
  });
});
