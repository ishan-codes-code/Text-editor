import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorExtensions } from "./extensions";
import { MAX_INDENT_LEVEL } from "./indent";
import { sanitizePastedHTML } from "./pastePolicy";

function makeEditor(onOpenLink: () => void = () => undefined): Editor {
  return new Editor({
    extensions: createEditorExtensions({
      shortcuts: {
        onOpenLink,
        onOpenFind: () => undefined,
        onToggleFont: () => undefined,
        onOpenPalette: () => undefined,
      },
    }),
    content: "<p>hello</p>",
  });
}

describe("editor extensions", () => {
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

  it("mounts the full schema", () => {
    const editor = track();
    for (const name of [
      "doc",
      "paragraph",
      "text",
      "bold",
      "heading",
      "bulletList",
      "orderedList",
      "taskList",
      "textStyle",
      "link",
      "blockquote",
      "codeBlock",
      "horizontalRule",
      "pageBreak",
    ]) {
      const present =
        editor.schema.nodes[name] !== undefined ||
        editor.schema.marks[name] !== undefined;
      expect(present, name).toBe(true);
    }
    // Attribute-only extensions (no node/mark of their own).
    for (const name of ["textAlign", "indent", "appShortcuts"]) {
      expect(
        editor.extensionManager.extensions.some((ext) => ext.name === name),
        name,
      ).toBe(true);
    }
  });

  it("indents and outdents within limits", () => {
    const editor = track();
    const indentOf = () =>
      (editor.getAttributes("paragraph") as { indent?: number | null }).indent;
    expect(editor.commands.indent()).toBe(true);
    expect(indentOf()).toBe(1);
    expect(editor.commands.indent()).toBe(true);
    expect(indentOf()).toBe(2);
    expect(editor.commands.outdent()).toBe(true);
    expect(indentOf()).toBe(1);
    expect(editor.getHTML()).toContain("margin-left: 2em");
    for (let i = 0; i < MAX_INDENT_LEVEL + 2; i++) editor.commands.indent();
    expect(indentOf()).toBe(MAX_INDENT_LEVEL);
  });

  it("inserts a page break node", () => {
    const editor = track();
    expect(editor.commands.insertPageBreak()).toBe(true);
    expect(editor.getHTML()).toContain('data-page-break=""');
  });

  it("toggles marks and alignment through commands", () => {
    const editor = track();
    editor.commands.setContent("<p>hello</p>");
    editor.commands.selectAll();
    expect(editor.commands.toggleBold()).toBe(true);
    expect(editor.isActive("bold")).toBe(true);
    expect(editor.commands.toggleStrike()).toBe(true);
    expect(editor.isActive("strike")).toBe(true);
    expect(editor.commands.setTextAlign("center")).toBe(true);
    expect(editor.getHTML()).toContain("text-align: center");
  });

  it("toggles strikethrough on Alt+Shift+5 (physical Digit5)", () => {
    const editor = track();
    editor.commands.setContent("<p>hello</p>");
    editor.commands.selectAll();
    // With Shift held the key reads "%", so the handler matches by code.
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "code", { value: "Digit5" });
    Object.defineProperty(event, "altKey", { value: true });
    Object.defineProperty(event, "shiftKey", { value: true });
    const handled = editor.view.someProp("handleKeyDown", (handler) =>
      handler(editor.view, event),
    );
    expect(handled).toBe(true);
    expect(editor.isActive("strike")).toBe(true);
  });

  it("opens the link dialog on Mod-K", () => {
    const opened = vi.fn();
    const editor = makeEditor(opened);
    editors.push(editor);
    const view = editor.view;
    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(event);
    expect(opened).toHaveBeenCalled();
  });
});

describe("paste policy", () => {
  const base = { knownFamilies: [] as string[], keepColors: false };

  it("keeps basic marks, links, lists and headings", () => {
    const out = sanitizePastedHTML(
      '<p><strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <a href="https://example.com">link</a></p><h2>head</h2><ul><li>one</li></ul>',
      base,
    );
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
    expect(out).toContain("<u>u</u>");
    expect(out).toContain("<s>s</s>");
    expect(out).toContain('<a href="https://example.com">link</a>');
    expect(out).toContain("<h2>head</h2>");
    expect(out).toContain("<li>one</li>");
  });

  it("drops foreign fonts and sizes, keeps known families", () => {
    const foreign = sanitizePastedHTML(
      '<p style="font-family: SomeFont; font-size: 28px">x</p>',
      base,
    );
    expect(foreign).not.toContain("font-family");
    expect(foreign).not.toContain("font-size");

    const known = sanitizePastedHTML(
      "<p style=\"font-family: 'Test Font', serif; font-size: 20px\">x</p>",
      { knownFamilies: ["test font"], keepColors: false },
    );
    expect(known).toContain("Test Font");
    expect(known).toContain("font-size: 20px");

    // Known family later in the fallback stack still counts.
    const fallback = sanitizePastedHTML(
      "<p style=\"font-family: Unknown, 'Test Font'\">x</p>",
      { knownFamilies: ["test font"], keepColors: false },
    );
    expect(fallback).toContain("Test Font");
  });

  it("strips colors by default, keeps them when enabled", () => {
    const html =
      '<p style="color: red; background-color: yellow">x</p><p><mark style="background: lime">y</mark></p>';
    const stripped = sanitizePastedHTML(html, base);
    expect(stripped).not.toContain("red");
    expect(stripped).not.toContain("yellow");
    expect(stripped).not.toContain("lime");
    const kept = sanitizePastedHTML(html, {
      knownFamilies: [],
      keepColors: true,
    });
    expect(kept).toContain("red");
    expect(kept).toContain("yellow");
  });

  it("drops scripts, javascript links and hostile attributes", () => {
    const out = sanitizePastedHTML(
      '<p onclick="evil()">a</p><script>alert(1)</script><p><a href="javascript:alert(1)">b</a></p><p id="x" class="y">c</p>',
      base,
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain('id="x"');
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>c</p>");
  });

  it("unwraps foreign wrappers but keeps their text", () => {
    const out = sanitizePastedHTML(
      "<div><span>hello</span></div><article><section>world</section></article>",
      base,
    );
    expect(out).toContain("hello");
    expect(out).toContain("world");
    expect(out).not.toContain("<div>");
    expect(out).not.toContain("<article>");
  });

  it("preserves manual page breaks", () => {
    const out = sanitizePastedHTML(
      '<p>a</p><div data-page-break=""></div><p>b</p>',
      base,
    );
    expect(out).toContain("data-page-break");
  });
});
