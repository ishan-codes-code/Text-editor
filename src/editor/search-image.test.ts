import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorExtensions } from "./extensions";
import { findMatches } from "./search";

function makeEditor(content: string): Editor {
  return new Editor({
    extensions: createEditorExtensions({
      shortcuts: {
        onOpenLink: () => undefined,
        onOpenFind: () => undefined,
        onToggleFont: () => undefined,
        onOpenPalette: () => undefined,
      },
    }),
    content,
  });
}

describe("search", () => {
  let editors: Editor[] = [];
  afterEach(() => {
    for (const editor of editors) editor.destroy();
    editors = [];
    document.body.innerHTML = "";
  });

  function track(content: string): Editor {
    const editor = makeEditor(content);
    editors.push(editor);
    return editor;
  }

  it("finds case-insensitive matches across paragraphs", () => {
    const editor = track("<p>Hello world</p><p>hello again</p>");
    expect(findMatches(editor.state.doc, "hello")).toHaveLength(2);
    expect(findMatches(editor.state.doc, "HELLO")).toHaveLength(2);
    expect(findMatches(editor.state.doc, "hello", true)).toHaveLength(1);
    expect(findMatches(editor.state.doc, "")).toHaveLength(0);
  });

  it("replaces the current match and all matches", () => {
    const editor = track("<p>foo bar foo</p>");
    editor.commands.setSearch("foo");
    expect(findMatches(editor.state.doc, "foo")).toHaveLength(2);
    editor.commands.replaceNext("baz");
    expect(editor.getText()).toBe("baz bar foo");
    editor.commands.replaceAllMatches("qux");
    expect(editor.getText()).toBe("baz bar qux");
  });

  it("steps through matches and clears the query", () => {
    const editor = track("<p>one two one</p>");
    editor.commands.setSearch("one");
    editor.commands.findStep(1);
    editor.commands.clearSearch();
    expect(findMatches(editor.state.doc, "one")).toHaveLength(2);
    // Search state cleared: a replace with no query is a no-op.
    expect(editor.commands.replaceAllMatches("x")).toBe(false);
    expect(editor.getText()).toBe("one two one");
  });
});

describe("imageRef", () => {
  let editors: Editor[] = [];
  afterEach(() => {
    for (const editor of editors) editor.destroy();
    editors = [];
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("inserts a store-backed image node by id", async () => {
    const urls = new Map<string, string>();
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        const url = `blob:test-${urls.size}`;
        urls.set(url, String(blob));
        return url;
      },
      revokeObjectURL: (url: string) => {
        urls.delete(url);
      },
    });
    const { EditorDatabase } = await import("../storage/db");
    const { addImage } = await import("../storage/images");
    const db = new EditorDatabase(`img-test-${Date.now()}`);
    try {
      const { Blob: NodeBlob } = await import("node:buffer");
      const record = await addImage(
        "doc-1",
        new NodeBlob(["bytes"], { type: "image/webp" }) as unknown as Blob,
        "image/webp",
        db,
      );
      const editor = makeEditor("<p>before</p>");
      editors.push(editor);
      editor.commands.insertImageRef(record.id, "alt text");
      const json = editor.getJSON();
      const node = json.content?.find((child) => child.type === "imageRef");
      expect(node?.attrs?.imageId).toBe(record.id);
      // Round-trips through HTML with the id intact (paste/export path).
      const html = editor.getHTML();
      expect(html).toContain(`data-image-id="${record.id}"`);
    } finally {
      await db.delete();
    }
  });
});
