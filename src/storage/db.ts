import { Dexie, type Table } from "dexie";
import type {
  DocRecord,
  FontRecord,
  ImageRecord,
  SnapshotRecord,
} from "./types";

/**
 * Dexie database, schema v1. UI code must never import this directly —
 * go through the functions in `src/storage/` instead.
 */
export class EditorDatabase extends Dexie {
  docs!: Table<DocRecord, string>;
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
