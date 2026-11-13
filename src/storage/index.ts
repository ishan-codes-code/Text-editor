export { Autosave, type SaveState } from "./autosave";
export {
  backupFileName,
  createBackup,
  deliverBackup,
  recordBackupTime,
} from "./backup";
export { EditorDatabase, getDb, resetDbForTests } from "./db";
export {
  createDoc,
  type DocListItem,
  deleteDoc,
  duplicateDoc,
  getDoc,
  listDocs,
  renameDoc,
  saveDocContent,
  searchDocs,
  setDocTitleFont,
} from "./documents";
export {
  acquireDocLock,
  type DocLock,
  docLockName,
  locksSupported,
} from "./locks";
export {
  parseBackup,
  RestoreError,
  type RestoreMode,
  type RestoreReport,
  restoreBackup,
} from "./restore";
export {
  getSnapshotContent,
  listSnapshots,
  MAX_SNAPSHOTS_PER_DOC,
  maybeSnapshot,
  SNAPSHOT_INTERVAL_MS,
} from "./snapshots";
export type {
  BackupManifest,
  DocRecord,
  FontFormat,
  FontRecord,
  ImageRecord,
  SettingsMap,
  SnapshotRecord,
} from "./types";
export { countWords, newId, now, SETTINGS_KEYS } from "./types";

import { type EditorDatabase, getDb } from "./db";

export async function getSetting<T>(
  key: string,
  fallback: T,
  db: EditorDatabase = getDb(),
): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(
  key: string,
  value: unknown,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.settings.put({ key, value });
}
