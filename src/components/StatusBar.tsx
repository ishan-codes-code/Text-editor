import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import type { SaveState } from "../storage/autosave";

export function saveStateLabel(
  state: SaveState,
  savedAt: number | null,
  readOnly: boolean,
): string {
  if (readOnly) return "Read-only (open in another tab)";
  switch (state) {
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved changes";
    case "error":
      return "Save failed — will retry";
    case "saved":
      if (savedAt === null) return "Saved";
      return `Saved ${new Date(savedAt).toLocaleTimeString()}`;
  }
}

function selectCounts(ctx: { editor: Editor | null }): {
  words: number;
  chars: number;
} {
  if (ctx.editor === null) return { words: 0, chars: 0 };
  return {
    words: ctx.editor.storage.characterCount.words() as number,
    chars: ctx.editor.storage.characterCount.characters() as number,
  };
}

export function StatusBar({
  editor,
  saveState,
  savedAt,
  readOnly,
}: {
  editor: Editor | null;
  saveState: SaveState;
  savedAt: number | null;
  readOnly: boolean;
}) {
  // Counts subscribe to the editor directly, so typing re-renders only this
  // footer — the app shell above never re-renders per keystroke.
  const { words, chars } = useEditorState({
    editor,
    selector: selectCounts,
  }) ?? {
    words: 0,
    chars: 0,
  };
  return (
    <footer className="flex items-center justify-between gap-2 px-1 py-2 text-xs text-muted-foreground">
      <span data-testid="word-count">
        {words} {words === 1 ? "word" : "words"} · {chars}{" "}
        {chars === 1 ? "character" : "characters"}
      </span>
      <span data-testid="save-status" role="status">
        {saveStateLabel(saveState, savedAt, readOnly)}
      </span>
    </footer>
  );
}
