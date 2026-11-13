import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

describe("App", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    indexedDB.deleteDatabase("offline-text-editor");
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    localStorage.clear();
  });

  it("boots a document, toolbar and canvas", async () => {
    render(<App />, container);
    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[aria-label="Editor"] .tiptap[contenteditable="true"]',
        ),
      ).not.toBeNull();
    });
    expect(
      container.querySelector('[role="toolbar"][aria-label="Formatting"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Documents"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="word-count"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="save-status"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="persist-status"]'),
    ).not.toBeNull();
  });

  it("mounts the editor with hostile-input attributes", async () => {
    render(<App />, container);
    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[aria-label="Editor"] .tiptap[contenteditable="true"]',
        ),
      ).not.toBeNull();
    });
    const editable = container.querySelector(
      '[aria-label="Editor"] .tiptap[contenteditable="true"]',
    );
    expect(editable?.getAttribute("spellcheck")).toBe("false");
    expect(editable?.getAttribute("autocorrect")).toBe("off");
    expect(editable?.getAttribute("autocapitalize")).toBe("none");
  });

  it("reflects typing in the word and save status", async () => {
    render(<App />, container);
    await vi.waitFor(() => {
      expect(
        container.querySelector(
          '[aria-label="Editor"] .tiptap[contenteditable="true"]',
        ),
      ).not.toBeNull();
    });
    const editable = container.querySelector(
      '[aria-label="Editor"] .tiptap[contenteditable="true"]',
    ) as HTMLElement | null;
    const paragraph = editable?.querySelector("p");
    if (paragraph !== null && paragraph !== undefined) {
      paragraph.textContent = "hello offline world";
    }
    editable?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="word-count"]')?.textContent,
      ).toContain("3 words");
    });
    // Debounced autosave persists the content.
    await vi.waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="save-status"]')?.textContent,
        ).toMatch(/Saved/);
      },
      { timeout: 5000 },
    );
  });
});
