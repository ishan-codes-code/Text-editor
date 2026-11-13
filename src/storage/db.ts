import { Dexie, type Table } from "dexie";
import type {
  DocMetaRecord,
  DocRecord,
  FontRecord,
  ImageRecord,
  SnapshotRecord,
} from "./types";

/**
 * Dexie database, schema v2. UI code must never import this directly —
 * go through the functions in `src/storage/` instead.
 *
 * v2 adds `docMeta`: a projection of the docs row WITHOUT the editor JSON.
 * The document list (re-read on every autosave) queries docMeta only, so a
 * save never loads full document content back into memory.
 */
export class EditorDatabase extends Dexie {
  docs!: Table<DocRecord, string>;
  docMeta!: Table<DocMetaRecord, string>;
  snapshots!: Table<SnapshotRecord, number>;
  fonts!: Table<FontRecord, string>;
  images!: Table<ImageRecord, string>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor(name = "offline-text-editor") {
    super(name);
    this.version(1).stores({
      docs: "&id, updatedAt",
      snapshots: "++id, docId, savedAt",
      fonts: "&id, family",
      images: "&id, docId",
      settings: "&key",
    });
    this.version(2)
      .stores({
        docs: "&id, updatedAt",
        docMeta: "&id, updatedAt",
        snapshots: "++id, docId, savedAt",
        fonts: "&id, family",
        images: "&id, docId",
        settings: "&key",
      })
      .upgrade(async (tx) => {
        // Backfill the projection for databases created under v1.
        const docs = await tx.table("docs").toArray();
        const meta = (docs as DocRecord[]).map((doc) => ({
          id: doc.id,
          title: doc.title,
          titleFont: doc.titleFont,
          wordCount: doc.wordCount,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }));
        await tx.table("docMeta").bulkAdd(meta);
      });
  }
}

let shared: EditorDatabase | null = null;

/** Shared instance for app code. Tests create their own via `new EditorDatabase(name)`. */
export function getDb(): EditorDatabase {
  if (shared === null) shared = new EditorDatabase();
  return shared;
}

/** Forgets the shared instance (tests only). */
export function resetDbForTests(): void {
  shared = null;
}
