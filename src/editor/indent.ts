import { Extension } from "@tiptap/core";

export const INDENT_STEP_EM = 2;
export const MAX_INDENT_LEVEL = 8;

/**
 * Block indent as a global `indent` attribute on paragraphs and headings.
 * Toolbar buttons plus Docs-style Ctrl+]/Ctrl+[. Lists indent through native
 * nesting, so this covers paragraph/heading only.
 */
export const Indent = Extension.create({
  name: "indent",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: null,
            parseHTML: (element) => {
              const margin = element.style.marginLeft;
              if (!margin) return null;
              const px = Number.parseFloat(margin);
              if (!Number.isFinite(px) || px <= 0) return null;
              // Stored as em steps; px values are converted at the default
              // 16 px base so foreign markup degrades gracefully.
              const em = margin.endsWith("em") ? px : px / 16;
              const level = Math.round(em / INDENT_STEP_EM);
              return level > 0 && level <= MAX_INDENT_LEVEL ? level : null;
            },
            renderHTML: (attributes) => {
              const level = (attributes as { indent?: number | null }).indent;
              if (typeof level !== "number" || level <= 0) return {};
              return { style: `margin-left: ${level * INDENT_STEP_EM}em` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ chain, editor }) => {
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          const attrs = editor.getAttributes(type) as {
            indent?: number | null;
          };
          const current = attrs.indent ?? 0;
          if (current >= MAX_INDENT_LEVEL) return false;
          return chain()
            .updateAttributes(type, { indent: current + 1 })
            .run();
        },
      outdent:
        () =>
        ({ chain, editor }) => {
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          const attrs = editor.getAttributes(type) as {
            indent?: number | null;
          };
          const current = attrs.indent ?? 0;
          if (current <= 0) return false;
          const next = current - 1 === 0 ? null : current - 1;
          return chain().updateAttributes(type, { indent: next }).run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Docs-style indent keys; harmless alongside the toolbar buttons.
      "Mod-]": () => this.editor.commands.indent(),
      "Mod-[": () => this.editor.commands.outdent(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}
