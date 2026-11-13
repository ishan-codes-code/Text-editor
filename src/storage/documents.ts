import type { JSONContent } from "@tiptap/core";
import { type EditorDatabase, getDb } from "./db";
import {
  countWords,
  type DocMetaRecord,
  type DocRecord,
  newId,
  now,
} from "./types";

export interface DocListItem {
  id: string;
  title: string;
  titleFont: string | null;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

function metaOf(doc: DocRecord): DocMetaRecord {
  return {
    id: doc.id,
    title: doc.title,
    titleFont: doc.titleFont,
    wordCount: doc.wordCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Rewrites imageRef ids inside editor JSON after an id remap. Unknown shapes
 * pass through untouched, so future node types cannot break duplication.
 */
function remapImageIds(node: unknown, remap: Map<string, string>): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => remapImageIds(item, remap));
  }
  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>;
    const attrs = record.attrs;
    if (
      record.type === "imageRef" &&
      typeof attrs === "object" &&
      attrs !== null
    ) {
      const imageId = (attrs as Record<string, unknown>).imageId;
      if (typeof imageId === "string") {
        const next = remap.get(imageId);
        if (next !== undefined) {
          return {
            ...record,
            attrs: { ...(attrs as Record<string, unknown>), imageId: next },
          };
        }
      }
      return node;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      out[key] = remapImageIds(value, remap);
    }
    return out;
  }
  return node;
}

export async function createDoc(
  title = "Untitled",
  db: EditorDatabase = getDb(),
): Promise<DocRecord> {
  const timestamp = now();
  const doc: DocRecord = {
    id: newId(),
    title,
    titleFont: null,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    wordCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.transaction("rw", [db.docs, db.docMeta], async () => {
    await db.docs.add(doc);
    await db.docMeta.add(metaOf(doc));
  });
  return doc;
}

export async function getDoc(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<DocRecord | undefined> {
  return db.docs.get(id);
}

/**
 * Lists documents from the content-free projection only: safe to call on
 * every autosave, no matter how large the library's editor JSON grows.
 */
export async function listDocs(
  db: EditorDatabase = getDb(),
): Promise<DocListItem[]> {
  return db.docMeta.orderBy("updatedAt").reverse().toArray();
}

export async function searchDocs(
  query: string,
  db: EditorDatabase = getDb(),
): Promise<DocListItem[]> {
  const needle = query.trim().toLowerCase();
  if (needle === "") return listDocs(db);
  // Small single-user library: a filtered scan of the projection is fast
  // and avoids an index. Content is never loaded here.
  const docs = await db.docMeta.orderBy("updatedAt").reverse().toArray();
  return docs.filter((doc) => doc.title.toLowerCase().includes(needle));
}

/** Single-transaction content save (used by the save queue and forced saves). */
export async function saveDocContent(
  id: string,
  content: JSONContent,
  plainText: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", [db.docs, db.docMeta], async () => {
    const existing = await db.docs.get(id);
    if (existing === undefined) return;
    existing.content = content;
    existing.wordCount = countWords(plainText);
    existing.updatedAt = now();
    await db.docs.put(existing);
    await db.docMeta.put(metaOf(existing));
  });
}

export async function renameDoc(
  id: string,
  title: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", [db.docs, db.docMeta], async () => {
    const existing = await db.docs.get(id);
    if (existing === undefined) return;
    existing.title = title;
    existing.updatedAt = now();
    await db.docs.put(existing);
    await db.docMeta.put(metaOf(existing));
  });
}

export async function setDocTitleFont(
  id: string,
  titleFont: string | null,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", [db.docs, db.docMeta], async () => {
    const existing = await db.docs.get(id);
    if (existing === undefined) return;
    existing.titleFont = titleFont;
    existing.updatedAt = now();
    await db.docs.put(existing);
    await db.docMeta.put(metaOf(existing));
  });
}

/**
 * Duplicates a document WITH its images: every image row is copied under a
 * new id and the copy's editor JSON is rewritten to reference the copies.
 * Sharing ids would corrupt the copy when the original (or its images) is
 * deleted, since images are owned per document.
 */
export async function duplicateDoc(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<DocRecord | undefined> {
  const source = await db.docs.get(id);
  if (source === undefined) return undefined;
  const timestamp = now();
  const copy: DocRecord = {
    ...source,
    id: newId(),
    title: `${source.title} (copy)`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.transaction("rw", [db.docs, db.docMeta, db.images], async () => {
    const sourceImages = await db.images.where("docId").equals(id).toArray();
    const remap = new Map<string, string>();
    for (const image of sourceImages) {
      const nextId = newId();
      remap.set(image.id, nextId);
      await db.images.add({ ...image, id: nextId, docId: copy.id });
    }
    copy.content = remapImageIds(copy.content, remap) as JSONContent;
    await db.docs.add(copy);
    await db.docMeta.add(metaOf(copy));
  });
  return copy;
}

export async function deleteDoc(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction(
    "rw",
    [db.docs, db.docMeta, db.snapshots, db.images],
    async () => {
      await db.docs.delete(id);
      await db.docMeta.delete(id);
      await db.snapshots.where("docId").equals(id).delete();
      await db.images.where("docId").equals(id).delete();
    },
  );
}
