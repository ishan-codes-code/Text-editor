import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface AppShortcutsOptions {
  /** Opens the link editor (toolbar dialog); invoked by Ctrl+K. */
  onOpenLink: () => void;
  /** Opens the find bar; invoked by Ctrl+F (plain) and Ctrl+H (replace). */
  onOpenFind: (withReplace: boolean) => void;
  /** Toggles the selection between the Kruti Dev font and the default font. */
  onToggleFont: () => void;
  /** Opens the special-character palette. */
  onOpenPalette: () => void;
}

/**
 * TRD shortcuts that Tiptap v3 does not bind itself. Verified against the
 * installed v3 exports — bold/italic/underline, headings (Mod-Alt-1..6),
 * lists (Mod-Shift-7/8/9), align (Mod-Shift-L/E/R/J), sup/sub, undo (Mod-Z)
 * and redo (Mod-Y) are already built in:
 *
 * - Alt+Shift+5: strikethrough (Docs-compatible; Tiptap binds Mod-Shift-S)
 * - Shift+Mod+Z: redo (Tiptap binds Mod-Y only)
 * - Mod+K: link dialog (the Link extension binds no key)
 * - Ctrl+F / Ctrl+H: find bar (phase 5 owns them now; preventDefault always)
 * - Mod+Shift+K: toggle Hindi/English font (phase 4)
 * - Mod+Shift+P: special-character palette (phase 4)
 *
 * Alt+Shift+5 cannot be a keymap entry: with Shift held the key reads "%",
 * so it is matched by physical code instead. Browser-reserved Ctrl+N/T/W are
 * never touched.
 */
export const AppShortcuts = Extension.create<AppShortcutsOptions>({
  name: "appShortcuts",

  addOptions() {
    return {
      onOpenLink: () => undefined,
      onOpenFind: () => undefined,
      onToggleFont: () => undefined,
      onOpenPalette: () => undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      "Shift-Mod-z": () => this.editor.commands.redo(),
      "Mod-k": () => {
        this.options.onOpenLink();
        return true;
      },
      "Mod-f": () => {
        this.options.onOpenFind(false);
        return true;
      },
      "Mod-h": () => {
        this.options.onOpenFind(true);
        return true;
      },
      "Shift-Mod-k": () => {
        this.options.onToggleFont();
        return true;
      },
      "Shift-Mod-p": () => {
        this.options.onOpenPalette();
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin({
        key: new PluginKey("altShiftDigit5"),
        props: {
          handleKeyDown(_view, event) {
            if (
              event.altKey &&
              event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              event.code === "Digit5"
            ) {
              event.preventDefault();
              // Read the editor lazily: the closure runs on keypress, long
              // after construction bound the extension to its editor.
              extension.editor.commands.toggleStrike();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
