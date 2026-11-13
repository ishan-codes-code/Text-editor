import type { Editor, JSONContent } from "@tiptap/core";
import * as v from "valibot";
import {
  type EditorDatabase,
  getDoc,
  getSnapshotContent,
  listSnapshots,
} from "../storage";

/**
 * Switching or restoring into a document must never clobber an in-progress
 * IME composition, and must never leave the editor read-only on corrupt
 * content. These helpers centralize both rules.
 */

// Editor JSON is an arbitrary tree; the load gate only checks that it is a
// ProseMirror doc node. Structural problems deeper inside are handled by the
// editor's own schema recovery, never by refusing to open.
const docContentSchema = v.object({
  type: v.literal("doc"),
  content: v.optional(v.array(v.unknown())),
});

export function isLoadableContent(content: unknown): content is JSONContent {
  return v.is(docContentSchema, content);
}

export const BLANK_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function isComposing(editor: Editor): boolean {
  try {
    return (
      (editor.view as unknown as { composing?: boolean }).composing === true
    );
  } catch {
    return false;
  }
}

/**
 * Applies content unless an IME composition is in flight, in which case it
 * waits for `compositionend` (bounded, so the open path can never hang).
 */
export async function setContentWhenReady(
  editor: Editor,
  content: JSONContent,
): Promise<void> {
  if (isComposing(editor)) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      try {
        editor.view.dom.addEventListener("compositionend", done, {
          once: true,
        });
      } catch {
        done();
      }
      setTimeout(done, 1000);
    });
  }
  editor.commands.setContent(content);
}

export interface ResolvedOpenContent {
  content: JSONContent;
  /** True when the stored doc was corrupt and a fallback was used. */
  recovered: boolean;
}

/**
 * Resolves what to show for a document: the stored content when it is a
 * loadable doc, else the newest loadable snapshot, else a blank doc. Always
 * returns something renderable — callers show an error notice when
 * `recovered` is true but keep the editor enabled.
 */
export async function resolveOpenContent(
  docId: string,
  db?: EditorDatabase,
): Promise<ResolvedOpenContent> {
  const doc = await getDoc(docId, db);
  if (doc !== undefined && isLoadableContent(doc.content)) {
    return { content: doc.content, recovered: false };
  }
  for (const snapshot of await listSnapshots(docId, db)) {
    const content = await getSnapshotContent(snapshot.id, db);
    if (isLoadableContent(content)) {
      return { content, recovered: true };
    }
  }
  return { content: BLANK_DOC, recovered: true };
}

/**
 * Forces the editor to re-measure layout (line breaks, cursor geometry)
 * once web fonts finish loading. Call after registering stored fonts so
 * text set in fallback metrics reflows into its final positions.
 */
export function remeasureAfterFontsLoad(editor: Editor): void {
  try {
    const fonts = (
      document as unknown as {
        fonts?: { ready?: Promise<unknown> };
      }
    ).fonts;
    const ready = fonts?.ready;
    if (!ready || editor.isDestroyed) return;
    void ready.then(() => {
      if (editor.isDestroyed) return;
      try {
        editor.view.updateState(editor.view.state);
      } catch {
        // Layout already torn down; nothing to re-measure.
      }
    });
  } catch {
    // jsdom and font-less environments: nothing to wait for.
  }
}
