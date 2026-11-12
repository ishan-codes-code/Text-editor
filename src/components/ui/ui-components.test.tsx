import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Toaster, toast } from "./sonner";

// NOTE: Radix-based Dialog/Sheet/DropdownMenu interaction is covered by the
// Playwright suite (tests/e2e/ui-components.spec.ts) in real Chromium
// instead of here. Vitest's SSR externalizer lets Radix's CJS transitive
// deps require the real `react` peer, bypassing the Vite preact/compat
// alias — a test-runner artifact, not a compat failure (the production
// build resolves one React). jsdom therefore cannot execute those trees.

// Preact flushes passive effects after paint (requestAnimationFrame in
// jsdom fires on a ~16ms timer), so one macrotask is not enough. 50ms waits
// out both the frame and the render microtasks.
const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

async function click(element: Element | null): Promise<void> {
  expect(element).not.toBeNull();
  (element as HTMLElement).click();
  await tick();
}

describe("shadcn-style UI components on preact/compat", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it("Button renders variants without React", async () => {
    render(
      <div>
        <Button>Default</Button>
        <Button variant="outline" size="sm">
          Small
        </Button>
      </div>,
      container,
    );
    await tick();
    const buttons = document.body.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.className).toContain("bg-primary");
    expect(buttons[1]?.className).toContain("border");
  });

  it("Command filters, shows empty state and selects via keyboard", async () => {
    const onSelect = vi.fn();
    render(
      <Command label="Fonts">
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandItem value="Serif" onSelect={onSelect}>
            Serif
          </CommandItem>
          <CommandItem value="Monospace" onSelect={onSelect}>
            Monospace
          </CommandItem>
          <CommandEmpty>No match.</CommandEmpty>
        </CommandList>
      </Command>,
      container,
    );
    await tick();
    await tick();
    const input = document.body.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();

    input.focus();
    input.value = "ser";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.body.querySelector('[data-value="Serif"]')).not.toBeNull();
    expect(document.body.querySelector('[data-value="Monospace"]')).toBeNull();

    input.value = "zzz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.body.textContent).toContain("No match.");

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    // After clearing, the first item is active again; ArrowDown moves to the
    // second one, proving keyboard navigation, and Enter selects it.
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await tick();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await tick();
    expect(onSelect).toHaveBeenCalledWith("Monospace");
  });

  it("Sonner toasts and dismisses", async () => {
    render(<Toaster />, container);
    // Let the subscription effect run before publishing, as in real usage.
    await tick();
    toast("Saved");
    await tick();
    expect(
      document.body.querySelector('[data-testid="toaster"]')?.textContent,
    ).toContain("Saved");

    await click(document.body.querySelector('button[aria-label="Dismiss"]'));
    expect(
      document.body.querySelector('[data-testid="toaster"]')?.textContent,
    ).not.toContain("Saved");
  });
});
