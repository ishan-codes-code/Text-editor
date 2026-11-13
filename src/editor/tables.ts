import type { AnyExtension } from "@tiptap/core";

/**
 * Tables (TRD F12) load lazily but are precached by the service worker, so
 * they work fully offline. The editor hook awaits this before constructing
 * the editor; the import becomes its own chunk in the precache manifest.
 */
export async function loadTableExtensions(): Promise<AnyExtension[]> {
  const { TableKit } = await import("@tiptap/extension-table");
  return [
    TableKit.configure({
      table: { resizable: true },
    }),
  ];
}
