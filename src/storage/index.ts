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
  addFont,
  deleteFont,
  FontValidationError,
  listFonts,
  MAX_FONT_BYTES,
  readFontFamily,
  registerFontFace,
  registerStoredFonts,
  sniffFontFormat,
  type ValidatedFont,
  validateFontFile,
} from "./fonts";
export {
  addImage,
  clearImageURLCacheForTests,
  deleteImage,
  getImage,
  imageObjectURL,
  MAX_IMAGE_EDGE,
  type PreparedImage,
  prepareImage,
  revokeImageURL,
} from "./images";
export {
  acquireDocLock,
  type DocLock,
  docLockName,
  locksSupported,
} from "./locks";
export {
  type ParsedBackup,
  parseBackup,
  RestoreError,
  type RestoreHooks,
  type RestoreMode,
  type RestoreReport,
  restoreBackup,
  writeParsedBackup,
} from "./restore";
export { type SavePayload, SaveQueue, type SaveState } from "./saveQueue";
export {
  getSnapshotContent,
  listSnapshots,
  MAX_SNAPSHOTS_PER_DOC,
  maybeSnapshot,
  SNAPSHOT_INTERVAL_MS,
} from "./snapshots";
export type {
  BackupManifest,
  DocMetaRecord,
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
