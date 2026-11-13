import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Toaster } from "./sonner";

// Radix Dialog/Sheet/DropdownMenu interaction is covered by the Playwright
// suite (tests/e2e/ui-components.spec.ts) in real Chromium instead of here.

afterEach(() => {
  cleanup();
});

describe("shadcn UI components on React 19", () => {
  it("Button renders variants", () => {
    render(
      <div>
        <Button>Default</Button>
        <Button variant="outline" size="sm">
          Small
        </Button>
      </div>,
    );
    const buttons = screen.getAllByRole("button");
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
    );
    const input = screen.getByPlaceholderText("Search…");
    expect(input).not.toBeNull();

    fireEvent.change(input, { target: { value: "ser" } });
    expect(await screen.findByText("Serif")).not.toBeNull();

    fireEvent.change(input, { target: { value: "zzz" } });
    expect(await screen.findByText("No match.")).not.toBeNull();

    fireEvent.change(input, { target: { value: "" } });
    // After clearing, the first item is active again; ArrowDown moves to the
    // second one and Enter selects it.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("Monospace");
  });

  it("Sonner toasts and dismisses", async () => {
    render(<Toaster />);
    const id = toast("Saved");
    expect(await screen.findByText("Saved")).not.toBeNull();

    toast.dismiss(id);
    await vi.waitFor(() => {
      expect(screen.queryByText("Saved")).toBeNull();
    });
  });
});
