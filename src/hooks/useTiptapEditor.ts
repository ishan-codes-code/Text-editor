import { Editor, type JSONContent } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { createEditorExtensions } from "../editor/extensions";
import { sanitizePastedHTML } from "../editor/pastePolicy";
import { loadTableExtensions } from "../editor/tables";

export interface TiptapEditorOptions {
  initialContent?: JSONContent | string;
  editable?: boolean;
  onUpdate?: (editor: Editor) => void;
  onOpenLink?: () => void;
  onOpenFind?: (withReplace: boolean) => void;
  onToggleFont?: () => void;
  onOpenPalette?: () => void;
  /** Receives dropped/pasted image files; the owner stores and inserts them. */
  onImageFile?: (file: File, atPos?: number) => void;
  getKnownFamilies?: () => string[];
  getKeepColors?: () => boolean;
}

function imageFiles(data: DataTransfer | null): File[] {
  if (data === null) return [];
  const files: File[] = [];
  for (const file of Array.from(data.files)) {
    if (file.type.startsWith("image/")) files.push(file);
  }
  return files;
}

/**
 * Mounts the full Tiptap 3 editor: formatting, lists, alignment, fonts,
 * indent, page breaks, images, find/replace, paste policy and TRD shortcuts.
 * Table extensions load lazily (precached by the service worker) before the
 * editor is constructed, so the hook resolves asynchronously.
 */
export function useTiptapEditor(options: TiptapEditorOptions = {}) {
  const {
    initialContent = "<p></p>",
    editable = true,
    onUpdate,
    onOpenLink,
    onOpenFind,
    onToggleFont,
    onOpenPalette,
    onImageFile,
    getKnownFamilies,
    getKeepColors,
  } = options;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef(initialContent);
  const callbacksRef = useRef({
    onUpdate,
    onOpenLink,
    onOpenFind,
    onToggleFont,
    onOpenPalette,
    onImageFile,
    getKnownFamilies,
    getKeepColors,
  });
  callbacksRef.current = {
    onUpdate,
    onOpenLink,
    onOpenFind,
    onToggleFont,
    onOpenPalette,
    onImageFile,
    getKnownFamilies,
    getKeepColors,
  };
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) return;
    let cancelled = false;
    let instance: Editor | null = null;
    void loadTableExtensions().then((tableExtensions) => {
      if (cancelled) return;
      instance = new Editor({
        element: mount,
        extensions: [
          ...createEditorExtensions({
            shortcuts: {
              onOpenLink: () => callbacksRef.current.onOpenLink?.(),
              onOpenFind: (withReplace: boolean) =>
                callbacksRef.current.onOpenFind?.(withReplace),
              onToggleFont: () => callbacksRef.current.onToggleFont?.(),
              onOpenPalette: () => callbacksRef.current.onOpenPalette?.(),
            },
          }),
          ...tableExtensions,
        ],
        content: contentRef.current,
        editable,
        editorProps: {
          attributes: {
            class: "tiptap",
            // Kruti Dev rule (TRD): the Android keyboard must not rewrite
            // Latin keystrokes, so autocorrect/capitalization are off.
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "none",
            autocomplete: "off",
          },
          transformPastedHTML: (html) =>
            sanitizePastedHTML(html, {
              knownFamilies: callbacksRef.current.getKnownFamilies?.() ?? [],
              keepColors: callbacksRef.current.getKeepColors?.() ?? false,
            }),
          handlePaste: (_view, event) => {
            const files = imageFiles(event.clipboardData);
            if (files.length === 0) return false;
            event.preventDefault();
            for (const file of files) {
              callbacksRef.current.onImageFile?.(file);
            }
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            if (moved) return false;
            const files = imageFiles(event.dataTransfer);
            if (files.length === 0) return false;
            event.preventDefault();
            const pos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })?.pos;
            for (const file of files) {
              callbacksRef.current.onImageFile?.(file, pos);
            }
            return true;
          },
        },
        onUpdate: ({ editor: updated }) => {
          callbacksRef.current.onUpdate?.(updated);
        },
      });
      setEditor(instance);
    });
    return () => {
      cancelled = true;
      instance?.destroy();
      setEditor(null);
    };
    // Mount once; content and callbacks flow through refs and commands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mountRef, editor };
}
