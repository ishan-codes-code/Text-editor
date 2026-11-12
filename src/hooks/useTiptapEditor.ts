import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { useEffect, useRef, useState } from "react";

/**
 * Mounts a bare Tiptap 3 core editor (Document + Paragraph + Text only).
 * The full extension set lands in phase 2; this hook proves the core mount,
 * disposal and hostile-input attributes under Preact.
 */
export function useTiptapEditor(initialContent = "<p></p>") {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef(initialContent);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) return;
    const instance = new Editor({
      element: mount,
      extensions: [Document, Paragraph, Text],
      content: contentRef.current,
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
      },
    });
    setEditor(instance);
    return () => {
      instance.destroy();
      setEditor(null);
    };
  }, []);

  return { mountRef, editor };
}
