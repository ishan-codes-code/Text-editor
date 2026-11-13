import { useCallback, useEffect, useState } from "react";
import {
  type DocListItem,
  listDocs,
  renameDoc,
  searchDocs,
} from "../storage/documents";
import { DocList } from "./DocList";

export interface DocsPanelProps {
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Refreshes app-level lists (header title, docked panel) after mutations. */
  onChanged: () => void;
}

/** Content-only panel: the overlay manager provides the sheet shell. */
export function DocsPanel({
  activeId,
  onOpen,
  onNew,
  onDuplicate,
  onDelete,
  onChanged,
}: DocsPanelProps) {
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    setDocs(query.trim() === "" ? await listDocs() : await searchDocs(query));
  }, [query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <DocList
      docs={docs}
      activeId={activeId}
      query={query}
      onQueryChange={setQuery}
      onOpen={onOpen}
      onNew={() => {
        void (async () => {
          await onNew();
          await reload();
        })();
      }}
      onRename={(id, title) => {
        void (async () => {
          await renameDoc(id, title);
          await reload();
          onChanged();
        })();
      }}
      onDuplicate={(id) => {
        void (async () => {
          await onDuplicate(id);
          await reload();
        })();
      }}
      onDelete={(id) => {
        void (async () => {
          await onDelete(id);
          await reload();
        })();
      }}
    />
  );
}
