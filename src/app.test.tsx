import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

describe("App", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    localStorage.clear();
  });

  it("renders the shell heading", () => {
    render(<App />, container);
    expect(container.querySelector("header h1")?.textContent).toContain(
      "Offline text editor",
    );
  });

  it("mounts the Tiptap editor with hostile-input attributes", async () => {
    render(<App />, container);
    // The editor mounts in an effect; wait for it like production code does.
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
    expect(editable).not.toBeNull();
    expect(editable?.getAttribute("spellcheck")).toBe("false");
    expect(editable?.getAttribute("autocorrect")).toBe("off");
    expect(editable?.getAttribute("autocapitalize")).toBe("none");
  });

  it("shows every scaffolded UI surface", () => {
    render(<App />, container);
    // Toolbar demo buttons.
    expect(
      container.querySelector('button[aria-label="Bold (phase 2)"]'),
    ).not.toBeNull();
    // Dropdown trigger, dialog trigger, sheet trigger.
    expect(container.textContent).toContain("Insert");
    expect(container.textContent).toContain("About");
    expect(
      container.querySelector('button[aria-label="Open settings"]'),
    ).not.toBeNull();
    // Command palette.
    expect(
      container.querySelector('input[placeholder="Search fonts…"]'),
    ).not.toBeNull();
    // Word count + persistence status placeholders (phase 3 owns the rest).
    expect(
      container.querySelector('[data-testid="word-count"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="persist-status"]'),
    ).not.toBeNull();
  });

  it("reflects typing in the word count", async () => {
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
    expect(editable).not.toBeNull();
    // Simulate typing the way a browser would: mutate the paragraph text
    // and let ProseMirror's mutation observer pick it up (jsdom has no
    // document.execCommand).
    const paragraph = editable?.querySelector("p");
    expect(paragraph).not.toBeNull();
    if (paragraph !== null && paragraph !== undefined) {
      paragraph.textContent = "hello offline world";
    }
    editable?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="word-count"]')?.textContent,
      ).toContain("3 words");
    });
  });
});
