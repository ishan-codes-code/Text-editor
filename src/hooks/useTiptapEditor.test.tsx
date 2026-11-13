import type { Editor } from "@tiptap/core";
import { render } from "preact";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTiptapEditor } from "./useTiptapEditor";

function Harness({
  onEditor,
  content,
}: {
  onEditor: (editor: Editor | null) => void;
  content?: string;
}) {
  const { mountRef, editor } = useTiptapEditor({ initialContent: content });
  useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);
  return <div ref={mountRef} />;
}

describe("useTiptapEditor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts the full editor and destroys it on unmount", async () => {
    const seen: (Editor | null)[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    render(<Harness onEditor={(editor) => seen.push(editor)} />, container);

    await vi.waitFor(() => {
      expect(seen.at(-1)).not.toBeNull();
    });
    const editor = seen.at(-1);
    expect(editor).not.toBeNull();
    if (editor === null || editor === undefined) return;

    expect(editor.isDestroyed).toBe(false);
    expect(editor.schema.nodes.doc).not.toBeUndefined();
    expect(editor.schema.nodes.pageBreak).not.toBeUndefined();
    expect(editor.commands.indent).toBeDefined();

    const editable = container.querySelector('.tiptap[contenteditable="true"]');
    expect(editable?.getAttribute("spellcheck")).toBe("false");
    expect(editable?.getAttribute("autocorrect")).toBe("off");
    expect(editable?.getAttribute("autocapitalize")).toBe("none");

    editor.commands.setContent("<p>hello</p>");
    expect(editor.getText()).toBe("hello");

    render(null, container);
    expect(editor.isDestroyed).toBe(true);
  });

  it("seeds initial content", async () => {
    let resolveEditor: (editor: Editor) => void = () => undefined;
    const editorPromise = new Promise<Editor>((resolve) => {
      resolveEditor = resolve;
    });
    const container = document.createElement("div");
    document.body.append(container);
    render(
      <Harness
        content="<p>seeded</p>"
        onEditor={(editor) => {
          if (editor !== null) resolveEditor(editor);
        }}
      />,
      container,
    );
    const mounted = await editorPromise;
    expect(mounted.getText()).toBe("seeded");
  });
});
