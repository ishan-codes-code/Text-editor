import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

describe("App", () => {
  beforeEach(async () => {
    // Dexie's own delete closes open handles first, then wipes: a raw
    // fire-and-forget deleteDatabase races boot and flakes the suite.
    // Forgetting the shared instance forces the app to reopen a fresh one.
    const { getDb, resetDbForTests } = await import("./storage/db");
    await getDb().delete();
    resetDbForTests();
  });

  afterEach(async () => {
    cleanup();
    localStorage.clear();
    // Unmount kicks a best-effort autosave flush that the test cannot await
    // (cleanup functions are synchronous). Serialize a no-op transaction
    // behind it before the next test deletes the database: IndexedDB orders
    // same-store transactions, so this resolves only after the in-flight
    // write settles. Without the drain, `delete()` can close the handle
    // mid-write and the flush rejects as an unhandled DatabaseClosedError.
    const { getDb } = await import("./storage/db");
    const db = getDb();
    await db.transaction("r", db.tables, () => undefined);
  });

  it("boots a document, toolbar and canvas", async () => {
    render(<App />);
    await vi.waitFor(() => {
      expect(
        document.body.querySelector(
          '[aria-label="Editor"] .tiptap[contenteditable="true"]',
        ),
      ).not.toBeNull();
    });
    expect(screen.getByRole("toolbar", { name: "Formatting" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Documents" })).not.toBeNull();
    expect(screen.getByTestId("word-count")).not.toBeNull();
    expect(screen.getByTestId("save-status")).not.toBeNull();
    expect(screen.getByTestId("persist-status")).not.toBeNull();
  });

  it("mounts the editor with hostile-input attributes", async () => {
    render(<App />);
    await vi.waitFor(() => {
      expect(
        document.body.querySelector(
          '[aria-label="Editor"] .tiptap[contenteditable="true"]',
        ),
      ).not.toBeNull();
    });
    const editable = document.body.querySelector(
      '[aria-label="Editor"] .tiptap[contenteditable="true"]',
    );
    expect(editable?.getAttribute("spellcheck")).toBe("false");
    expect(editable?.getAttribute("autocorrect")).toBe("off");
    expect(editable?.getAttribute("autocapitalize")).toBe("none");
  });

  it("reflects typing in the word and save status", async () => {
    render(<App />);
    await vi.waitFor(() => {
      expect(
        document.body.querySelector(
          '[aria-label="Editor"] .tiptap[contenteditable="true"]',
        ),
      ).not.toBeNull();
    });
    // Boot must finish (doc loaded, surface enabled) before simulating
    // typing: input dispatched during the load is intentionally ignored so
    // a real user's early keystrokes can never be wiped by setContent.
    await vi.waitFor(() => {
      expect(document.querySelector("header h1")?.textContent).toBe("Untitled");
    });
    const editable = document.body.querySelector(
      '[aria-label="Editor"] .tiptap[contenteditable="true"]',
    ) as HTMLElement | null;
    const paragraph = editable?.querySelector("p");
    if (paragraph !== null && paragraph !== undefined) {
      paragraph.textContent = "hello offline world";
    }
    editable?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(screen.getByTestId("word-count")?.textContent).toContain(
        "3 words",
      );
    });
    // Debounced autosave persists the content.
    await vi.waitFor(
      () => {
        expect(screen.getByTestId("save-status")?.textContent).toMatch(/Saved/);
      },
      { timeout: 5000 },
    );
  });

  it("collapses and restores the docked documents panel, persisting the choice", async () => {
    // Pretend to be a wide landscape screen so the panel docks instead of
    // opening the slide-over sheet.
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("1024"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      render(<App />);
      const panel = await screen.findByRole("complementary", {
        name: "Documents panel",
      });
      expect(panel.className).toMatch("w-72");

      await user.click(screen.getByRole("button", { name: "Documents" }));
      await vi.waitFor(() => {
        expect(panel.className).toMatch("w-0");
      });

      const { getSetting } = await import("./storage");
      const { SETTINGS_KEYS } = await import("./storage/types");
      await vi.waitFor(async () => {
        expect(await getSetting(SETTINGS_KEYS.sidebarOpen, true)).toBe(false);
      });

      await user.click(screen.getByRole("button", { name: "Documents" }));
      await vi.waitFor(() => {
        expect(panel.className).toMatch("w-72");
      });
    } finally {
      window.matchMedia = original;
    }
  });
});
