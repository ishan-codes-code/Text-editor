import type { JSONContent } from "@tiptap/core";
import { type EditorDatabase, getDb } from "./db";
import { countWords, type DocRecord, newId, now } from "./types";

export interface DocListItem {
  id: string;
  title: string;
  titleFont: string | null;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

function toListItem(doc: DocRecord): DocListItem {
  return {
    id: doc.id,
    title: doc.title,
    titleFont: doc.titleFont,
    wordCount: doc.wordCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
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
  await db.transaction("rw", db.docs, async () => {
    await db.docs.add(doc);
  });
  return doc;
}

export async function getDoc(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<DocRecord | undefined> {
  return db.docs.get(id);
}

export async function listDocs(
  db: EditorDatabase = getDb(),
): Promise<DocListItem[]> {
  const docs = await db.docs.orderBy("updatedAt").reverse().toArray();
  return docs.map(toListItem);
}

export async function searchDocs(
  query: string,
  db: EditorDatabase = getDb(),
): Promise<DocListItem[]> {
  const needle = query.trim().toLowerCase();
  if (needle === "") return listDocs(db);
  // Small single-user library: a filtered scan is fast and avoids an index.
  const docs = await db.docs.orderBy("updatedAt").reverse().toArray();
  return docs
    .filter((doc) => doc.title.toLowerCase().includes(needle))
    .map(toListItem);
}

/** Single-transaction content save (used by autosave and forced saves). */
export async function saveDocContent(
  id: string,
  content: JSONContent,
  plainText: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", db.docs, async () => {
    const existing = await db.docs.get(id);
    if (existing === undefined) return;
    existing.content = content;
    existing.wordCount = countWords(plainText);
    existing.updatedAt = now();
    await db.docs.put(existing);
  });
}

export async function renameDoc(
  id: string,
  title: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", db.docs, async () => {
    const existing = await db.docs.get(id);
    if (existing === undefined) return;
    existing.title = title;
    existing.updatedAt = now();
    await db.docs.put(existing);
  });
}

export async function setDocTitleFont(
  id: string,
  titleFont: string | null,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", db.docs, async () => {
    const existing = await db.docs.get(id);
    if (existing === undefined) return;
    existing.titleFont = titleFont;
    existing.updatedAt = now();
    await db.docs.put(existing);
  });
}

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
  await db.transaction("rw", db.docs, async () => {
    await db.docs.add(copy);
  });
  return copy;
}

export async function deleteDoc(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", [db.docs, db.snapshots, db.images], async () => {
    await db.docs.delete(id);
    await db.snapshots.where("docId").equals(id).delete();
    await db.images.where("docId").equals(id).delete();
  });
}
