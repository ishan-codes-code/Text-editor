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

export function StatusBar({
  words,
  chars,
  saveState,
  savedAt,
  readOnly,
}: {
  words: number;
  chars: number;
  saveState: SaveState;
  savedAt: number | null;
  readOnly: boolean;
}) {
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
