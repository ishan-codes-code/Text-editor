import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface AppShortcutsOptions {
  /** Opens the link editor (toolbar dialog); invoked by Ctrl+K. */
  onOpenLink: () => void;
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
 *
 * Alt+Shift+5 cannot be a keymap entry: with Shift held the key reads "%",
 * so it is matched by physical code instead. Ctrl+F/H intentionally keep
 * the browser behavior until the phase-5 find UI owns them.
 */
export const AppShortcuts = Extension.create<AppShortcutsOptions>({
  name: "appShortcuts",

  addOptions() {
    return { onOpenLink: () => undefined };
  },

  addKeyboardShortcuts() {
    return {
      "Shift-Mod-z": () => this.editor.commands.redo(),
      "Mod-k": () => {
        this.options.onOpenLink();
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
