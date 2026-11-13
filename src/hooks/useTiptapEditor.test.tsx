import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render } from "@testing-library/react";
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
  const { editor } = useTiptapEditor({ initialContent: content });
  useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);
  return <EditorContent editor={editor} />;
}

/**
 * Table extensions load lazily, so the hook briefly mounts a base instance
 * and then recreates it with the full set. Tests target the final instance,
 * identified by the table nodes only it carries.
 */
async function waitForFinalEditor(
  seen: (Editor | null)[],
): Promise<Editor> {
  let finalEditor: Editor | null = null;
  await vi.waitFor(() => {
    const last = seen.at(-1);
    expect(last?.schema.nodes.table).not.toBeUndefined();
    finalEditor = last;
  });
  if (finalEditor === null) throw new Error("editor never settled");
  return finalEditor;
}

describe("useTiptapEditor", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("mounts the full editor and destroys it on unmount", async () => {
    const seen: (Editor | null)[] = [];
    const { unmount } = render(
      <Harness onEditor={(editor) => seen.push(editor)} />,
    );

    const editor = await waitForFinalEditor(seen);
    expect(editor.isDestroyed).toBe(false);
    expect(editor.schema.nodes.doc).not.toBeUndefined();
    expect(editor.schema.nodes.pageBreak).not.toBeUndefined();
    expect(editor.commands.indent).toBeDefined();

    const editable = document.body.querySelector(
      '.tiptap[contenteditable="true"]',
    );
    expect(editable?.getAttribute("spellcheck")).toBe("false");
    expect(editable?.getAttribute("autocorrect")).toBe("off");
    expect(editable?.getAttribute("autocapitalize")).toBe("none");

    editor.commands.setContent("<p>hello</p>");
    expect(editor.getText()).toBe("hello");

    unmount();
    // @tiptap/react schedules destruction on the next tick (StrictMode-safe),
    // so the assertion must poll rather than read synchronously.
    await vi.waitFor(() => {
      expect(editor.isDestroyed).toBe(true);
    });
  });

  it("seeds initial content", async () => {
    const seen: (Editor | null)[] = [];
    render(
      <Harness
        content="<p>seeded</p>"
        onEditor={(editor) => seen.push(editor)}
      />,
    );
    const mounted = await waitForFinalEditor(seen);
    expect(mounted.getText()).toBe("seeded");
  });
});
