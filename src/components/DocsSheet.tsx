import { useMemo, useState } from "react";
import { type DocListItem, renameDoc } from "../storage/documents";
import { DocList } from "./DocList";

export interface DocsPanelProps {
  docs: DocListItem[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Refreshes app-level lists (header title) after mutations. */
  onChanged: () => void;
}

/** Content-only panel: the overlay manager provides the sheet shell. */
export function DocsPanel({
  docs,
  activeId,
  onOpen,
  onNew,
  onDuplicate,
  onDelete,
  onChanged,
}: DocsPanelProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle === ""
        ? docs
        : docs.filter((doc) => doc.title.toLowerCase().includes(needle)),
    [docs, needle],
  );
  // Boot always ensures at least one document, so an empty list only ever
  // means the first load has not landed yet.
  if (docs.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
    );
  }
  return (
    <DocList
      docs={visible}
      activeId={activeId}
      query={query}
      onQueryChange={setQuery}
      onOpen={onOpen}
      onNew={() => void onNew()}
      onRename={(id, title) => {
        void (async () => {
          await renameDoc(id, title);
          onChanged();
        })();
      }}
      onDuplicate={(id) => void onDuplicate(id)}
      onDelete={(id) => void onDelete(id)}
    />
  );
}
