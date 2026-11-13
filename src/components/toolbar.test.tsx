import { render, screen } from "@testing-library/react";
import { type AnyExtension, Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorExtensions } from "../editor/extensions";
import { loadTableExtensions } from "../editor/tables";
import { Toolbar } from "./Toolbar";

let tableExtensions: AnyExtension[] | null = null;

async function makeEditor(): Promise<Editor> {
  // The app withholds the editor until the lazy table chunk arrives; the
  // test mirrors that so table commands exist in the selector.
  tableExtensions ??= await loadTableExtensions();
  return new Editor({
    extensions: [
      ...createEditorExtensions({
        shortcuts: {
          onOpenLink: () => undefined,
          onOpenFind: () => undefined,
          onToggleFont: () => undefined,
          onOpenPalette: () => undefined,
        },
      }),
      ...tableExtensions,
    ],
    content: "<p>hello</p>",
  });
}

const noop = () => undefined;

describe("Toolbar", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
    document.body.innerHTML = "";
  });

  async function renderToolbar() {
    editor = await makeEditor();
    render(
      <Toolbar
        editor={editor}
        onOpenLink={noop}
        onOpenFind={noop}
        onOpenPalette={noop}
        onToggleFont={noop}
        onManageFonts={noop}
        onInsertImage={noop}
        families={["Test 010"]}
      />,
    );
  }

  it("renders grouped formatting controls, not one scrolling row", async () => {
    await renderToolbar();
    const bar = screen.getByRole("toolbar", { name: "Formatting" });
    // The old layout scrolled a single endless row; the new layout wraps.
    expect(bar.className).not.toMatch("overflow-x-auto");
    for (const group of [
      "Text formatting",
      "Text style",
      "Paragraph",
      "Lists",
      "Insert",
      "Tools",
    ]) {
      expect(screen.getByRole("group", { name: group }), group).not.toBeNull();
    }
  });

  it("exposes every control with an accessible name and keeps list commands wired", async () => {
    await renderToolbar();
    expect(
      screen.getByRole("button", { name: "Bullet list (Ctrl+Shift+8)" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Numbered list (Ctrl+Shift+7)" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Checklist (Ctrl+Shift+9)" }),
    ).not.toBeNull();
    expect(screen.getByLabelText("Font family")).not.toBeNull();
    expect(screen.getByLabelText("Block style")).not.toBeNull();

    // Clicking the bullet button toggles a real list through the editor.
    const current = editor;
    expect(current).not.toBeNull();
    current?.commands.setContent("<p>one</p>");
    current?.commands.selectAll();
    screen
      .getByRole("button", { name: "Bullet list (Ctrl+Shift+8)" })
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(current?.isActive("bulletList")).toBe(true);
  });
});
