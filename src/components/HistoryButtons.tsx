import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Redo, Undo } from "lucide-react";
import { Button } from "./ui/button";

function selectHistory(ctx: { editor: Editor | null }): {
  canUndo: boolean;
  canRedo: boolean;
} {
  const { editor } = ctx;
  if (editor === null) return { canUndo: false, canRedo: false };
  return { canUndo: editor.can().undo(), canRedo: editor.can().redo() };
}

/**
 * Document-level undo/redo for the application header. Subscribes in
 * isolation so history-state changes never re-render the app shell.
 */
export function HistoryButtons({ editor }: { editor: Editor | null }) {
  const { canUndo, canRedo } =
    useEditorState({ editor, selector: selectHistory }) ??
    ({ canUndo: false, canRedo: false } as const);
  if (editor === null) return null;
  return (
    <fieldset
      aria-label="History"
      className="m-0 flex items-center gap-0.5 border-0 p-0"
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Undo (Ctrl+Z)"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Redo (Ctrl+Y)"
        title="Redo (Ctrl+Y)"
        disabled={!canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo />
      </Button>
    </fieldset>
  );
}
