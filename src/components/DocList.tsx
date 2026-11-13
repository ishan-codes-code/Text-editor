import { Copy, FilePlus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { quoteFontFamily } from "../lib/fontCss";
import type { DocListItem } from "../storage/documents";
import { Button } from "./ui/button";

export interface DocListProps {
  docs: DocListItem[];
  activeId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DocList({
  docs,
  activeId,
  query,
  onQueryChange,
  onOpen,
  onNew,
  onRename,
  onDuplicate,
  onDelete,
}: DocListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const commitRename = (id: string) => {
    const title = renameValue.trim();
    if (title !== "") onRename(id, title);
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="doc-search">
          Search documents
        </label>
        <input
          id="doc-search"
          type="search"
          placeholder="Search documents…"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          className="h-11 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <Button size="sm" className="h-11" onClick={onNew} aria-label="New document">
          <FilePlus className="size-4" /> New
        </Button>
      </div>
      <ul aria-label="Documents" className="flex flex-col gap-1">
        {docs.map((doc) => {
          const active = doc.id === activeId;
          return (
            <li
              key={doc.id}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 ${active ? "bg-accent" : "hover:bg-accent/50"}`}
            >
              {renamingId === doc.id ? (
                <input
                  aria-label="Document title"
                  ref={(element) => {
                    element?.focus();
                  }}
                  value={renameValue}
                  onChange={(event) =>
                    setRenameValue(event.currentTarget.value)
                  }
                  onBlur={() => commitRename(doc.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(doc.id);
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  className="h-11 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen(doc.id)}
                  aria-label={`Open ${doc.title}`}
                  aria-current={active ? "true" : undefined}
                  className="flex min-h-11 min-w-0 flex-1 items-center text-left"
                >
                  <span
                    className="block truncate text-sm font-medium"
                    style={
                      doc.titleFont != null
                        ? { fontFamily: quoteFontFamily(doc.titleFont) }
                        : undefined
                    }
                  >
                    {doc.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {doc.wordCount} {doc.wordCount === 1 ? "word" : "words"} ·{" "}
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Rename ${doc.title}`}
                title="Rename"
                onClick={() => {
                  setRenamingId(doc.id);
                  setRenameValue(doc.title);
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Duplicate ${doc.title}`}
                title="Duplicate"
                onClick={() => onDuplicate(doc.id)}
              >
                <Copy className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${doc.title}`}
                title="Delete"
                onClick={() => onDelete(doc.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      {docs.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No documents match.
        </p>
      )}
    </div>
  );
}
