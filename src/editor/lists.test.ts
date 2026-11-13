import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorExtensions } from "./extensions";

function makeEditor(): Editor {
  return new Editor({
    extensions: createEditorExtensions({
      shortcuts: {
        onOpenLink: () => undefined,
        onOpenFind: () => undefined,
        onToggleFont: () => undefined,
        onOpenPalette: () => undefined,
      },
    }),
    content: "<p>hello</p>",
  });
}

function pressKey(editor: Editor, key: string, init?: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  const handled = editor.view.someProp("handleKeyDown", (handler) =>
    handler(editor.view, event),
  );
  return handled;
}

describe("list functionality", () => {
  let editors: Editor[] = [];
  afterEach(() => {
    for (const editor of editors) editor.destroy();
    editors = [];
    document.body.innerHTML = "";
  });

  function track(): Editor {
    const editor = makeEditor();
    editors.push(editor);
    return editor;
  }

  it("toggles a bullet list and reports the active state", () => {
    const editor = track();
    editor.commands.setContent("<p>one</p>");
    editor.commands.selectAll();
    expect(editor.commands.toggleBulletList()).toBe(true);
    expect(editor.getHTML()).toContain("<ul>");
    expect(editor.isActive("bulletList")).toBe(true);
    // Toggling again returns to a plain paragraph.
    expect(editor.commands.toggleBulletList()).toBe(true);
    expect(editor.getHTML()).not.toContain("<ul>");
    expect(editor.isActive("bulletList")).toBe(false);
  });

  it("toggles a numbered list and reports the active state", () => {
    const editor = track();
    editor.commands.setContent("<p>one</p>");
    editor.commands.selectAll();
    expect(editor.commands.toggleOrderedList()).toBe(true);
    expect(editor.getHTML()).toContain("<ol>");
    expect(editor.isActive("orderedList")).toBe(true);
    expect(editor.commands.toggleOrderedList()).toBe(true);
    expect(editor.getHTML()).not.toContain("<ol>");
  });

  it("toggles a checklist backed by task items", () => {
    const editor = track();
    editor.commands.setContent("<p>one</p>");
    editor.commands.selectAll();
    expect(editor.commands.toggleTaskList()).toBe(true);
    expect(editor.isActive("taskList")).toBe(true);
    expect(editor.getHTML()).toContain("taskList");
  });

  it("pressing Enter creates the next list item", () => {
    const editor = track();
    editor.commands.setContent("<ul><li><p>one</p></li></ul>");
    editor.commands.focus("end");
    pressKey(editor, "Enter");
    const items = editor.view.dom.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(editor.isActive("bulletList")).toBe(true);
  });

  it("pressing Enter on an empty item exits the list", () => {
    const editor = track();
    editor.commands.setContent("<ul><li><p>one</p></li></ul>");
    editor.commands.focus("end");
    pressKey(editor, "Enter");
    expect(editor.view.dom.querySelectorAll("li")).toHaveLength(2);
    // The caret sits in a fresh empty item: Enter again leaves the list.
    pressKey(editor, "Enter");
    expect(editor.isActive("bulletList")).toBe(false);
    // The finished item stays listed; the caret continues in a paragraph.
    const list = editor.view.dom.querySelector("ul");
    expect(list?.textContent).toContain("one");
    expect(editor.getHTML()).toMatch(/<\/ul><p><\/p>/);
  });

  it("Backspace on an empty list item lifts it out of the list", () => {
    const editor = track();
    editor.commands.setContent("<ul><li><p>one</p></li><li><p></p></li></ul>");
    editor.commands.focus("end");
    pressKey(editor, "Backspace");
    const items = editor.view.dom.querySelectorAll("li");
    expect(items).toHaveLength(1);
  });

  it("nests list items where supported", () => {
    const editor = track();
    editor.commands.setContent(
      "<ul><li><p>one</p></li><li><p>two</p></li></ul>",
    );
    // Place the caret in the second item, then sink it one level.
    const secondStart = editor.view.dom.querySelectorAll("li")[1];
    expect(secondStart).not.toBeUndefined();
    editor.commands.focus("end");
    expect(editor.commands.sinkListItem("listItem")).toBe(true);
    expect(editor.getHTML()).toContain("<ul><li>");
    const nested = editor.view.dom.querySelectorAll("ul ul");
    expect(nested.length).toBeGreaterThan(0);
  });

  it("list content survives a JSON round-trip (save and reopen)", () => {
    const editor = track();
    editor.commands.setContent(
      "<ul><li><p>one</p></li><li><p>two</p><ul><li><p>nested</p></li></ul></li></ul><ol><li><p>three</p></li></ol>",
    );
    const json = editor.getJSON();
    const reopened = new Editor({
      extensions: createEditorExtensions({
        shortcuts: {
          onOpenLink: () => undefined,
          onOpenFind: () => undefined,
          onToggleFont: () => undefined,
          onOpenPalette: () => undefined,
        },
      }),
      content: json,
    });
    editors.push(reopened);
    const html = reopened.getHTML();
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("nested");
  });
});
