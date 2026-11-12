import { Editor, type JSONContent } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { createEditorExtensions } from "../editor/extensions";
import { sanitizePastedHTML } from "../editor/pastePolicy";

export interface TiptapEditorOptions {
  initialContent?: JSONContent | string;
  editable?: boolean;
  onUpdate?: (editor: Editor) => void;
  onOpenLink?: () => void;
  getKnownFamilies?: () => string[];
  getKeepColors?: () => boolean;
}

/**
 * Mounts the full phase-2 Tiptap 3 editor: formatting, lists, alignment,
 * fonts, indent, page breaks, paste policy and TRD shortcuts.
 */
export function useTiptapEditor(options: TiptapEditorOptions = {}) {
  const {
    initialContent = "<p></p>",
    editable = true,
    onUpdate,
    onOpenLink,
    getKnownFamilies,
    getKeepColors,
  } = options;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef(initialContent);
  const callbacksRef = useRef({
    onUpdate,
    onOpenLink,
    getKnownFamilies,
    getKeepColors,
  });
  callbacksRef.current = {
    onUpdate,
    onOpenLink,
    getKnownFamilies,
    getKeepColors,
  };
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) return;
    const instance = new Editor({
      element: mount,
      extensions: createEditorExtensions({
        shortcuts: {
          onOpenLink: () => callbacksRef.current.onOpenLink?.(),
        },
      }),
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
      },
      onUpdate: ({ editor: updated }) => {
        callbacksRef.current.onUpdate?.(updated);
      },
    });
    setEditor(instance);
    return () => {
      instance.destroy();
      setEditor(null);
    };
    // Mount once; content and callbacks flow through refs and commands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mountRef, editor };
}
