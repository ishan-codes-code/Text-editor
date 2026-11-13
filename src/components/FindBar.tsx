import type { Editor } from "@tiptap/core";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Replace,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findMatches } from "../editor/search";
import { Button } from "./ui/button";

export interface FindBarProps {
  editor: Editor;
  /** Opened via Ctrl+H: show the replace row immediately. */
  withReplace: boolean;
  onClose: () => void;
}

/** Inline find bar (TRD F11). Small enough to stay in the core chunk. */
export function FindBar({ editor, withReplace, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(withReplace);
  const [tick, setTick] = useState(0);
  const queryRef = useRef<HTMLInputElement | null>(null);

  // Move keyboard focus into the bar when it opens (Ctrl+F/H).
  useEffect(() => {
    queryRef.current?.focus();
  }, []);

  // Ctrl+H while the bar is already open reveals the replace row.
  useEffect(() => {
    if (withReplace) setShowReplace(true);
  }, [withReplace]);

  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    editor.on("transaction", bump);
    return () => {
      editor.off("transaction", bump);
    };
  }, [editor]);

  useEffect(() => {
    editor.commands.setSearch(query, { caseSensitive });
  }, [editor, query, caseSensitive]);

  useEffect(
    () => () => {
      editor.commands.clearSearch();
    },
    [editor],
  );

  // Escape closes the bar from anywhere inside it (buttons included).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches =
    query === "" ? [] : findMatches(editor.state.doc, query, caseSensitive);
  void tick;

  const step = (delta: 1 | -1) => {
    editor.commands.findStep(delta);
    editor.commands.focus();
  };

  /** Structural key-event type: JSX handlers pass a richer event. */
  interface FindKeyEvent {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    preventDefault: () => void;
  }

  const onFindKeyDown = (event: FindKeyEvent) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "f") {
        // Already here: keep focus in the bar.
        event.preventDefault();
        queryRef.current?.focus();
        return;
      }
      if (key === "h") {
        // The editor keymap cannot fire while focus is in the bar.
        event.preventDefault();
        setShowReplace(true);
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <search
      aria-label="Find and replace"
      className="border-b bg-background px-4 py-2 print:hidden"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5">
        <SearchIcon
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={queryRef}
          type="search"
          aria-label="Find in document (Ctrl+F)"
          placeholder="Find"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onFindKeyDown}
          className="h-9 min-w-32 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <span
          aria-live="polite"
          className="min-w-16 text-center text-xs text-muted-foreground"
          data-testid="find-count"
        >
          {query === "" ? "" : `${matches.length} found`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous match (Shift+Enter)"
          disabled={matches.length === 0}
          onClick={() => step(-1)}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next match (Enter)"
          disabled={matches.length === 0}
          onClick={() => step(1)}
        >
          <ChevronDown />
        </Button>
        <Button
          variant={caseSensitive ? "secondary" : "ghost"}
          size="icon"
          aria-label="Match case"
          aria-pressed={caseSensitive}
          title="Match case"
          onClick={() => setCaseSensitive((value) => !value)}
        >
          <CaseSensitive />
        </Button>
        <Button
          variant={showReplace ? "secondary" : "ghost"}
          size="icon"
          aria-label="Toggle replace (Ctrl+H)"
          aria-pressed={showReplace}
          title="Replace (Ctrl+H)"
          onClick={() => setShowReplace((value) => !value)}
        >
          <Replace />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close find bar (Escape)"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {showReplace && (
        <div className="mx-auto mt-1.5 flex max-w-3xl flex-wrap items-center gap-1.5">
          <input
            type="text"
            aria-label="Replace with"
            placeholder="Replace with"
            value={replacement}
            onChange={(event) => setReplacement(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (
                (event.ctrlKey || event.metaKey) &&
                !event.shiftKey &&
                !event.altKey &&
                event.key.toLowerCase() === "f"
              ) {
                event.preventDefault();
                queryRef.current?.focus();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            className="h-9 min-w-32 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={matches.length === 0}
            onClick={() => {
              editor.commands.replaceNext(replacement);
            }}
          >
            Replace
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={matches.length === 0}
            onClick={() => {
              editor.commands.replaceAllMatches(replacement);
            }}
          >
            Replace all
          </Button>
        </div>
      )}
    </search>
  );
}
