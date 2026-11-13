import type { JSONContent } from "@tiptap/core";
import { type EditorDatabase, getDb } from "./db";
import { now } from "./types";

export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_SNAPSHOTS_PER_DOC = 10;

function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Records a snapshot if enough time passed since the last one and the
 * content actually changed. Prunes to the newest MAX_SNAPSHOTS_PER_DOC.
 * Returns true when a snapshot was written.
 */
export async function maybeSnapshot(
  docId: string,
  content: JSONContent,
  at: number = now(),
  db: EditorDatabase = getDb(),
): Promise<boolean> {
  const recent = await db.snapshots
    .where("docId")
    .equals(docId)
    .reverse()
    .sortBy("savedAt");
  const latest = recent[0];
  if (latest !== undefined) {
    if (at - latest.savedAt < SNAPSHOT_INTERVAL_MS) return false;
    if (sameContent(latest.content, content)) return false;
  }
  await db.transaction("rw", db.snapshots, async () => {
    await db.snapshots.add({ docId, content, savedAt: at });
    const excess = await db.snapshots
      .where("docId")
      .equals(docId)
      .sortBy("savedAt");
    if (excess.length > MAX_SNAPSHOTS_PER_DOC) {
      const victims = excess.slice(0, excess.length - MAX_SNAPSHOTS_PER_DOC);
      const keys = victims.map((s) => s.id).filter((id) => id !== undefined);
      await db.snapshots.bulkDelete(keys);
    }
  });
  return true;
}

export async function listSnapshots(
  docId: string,
  db: EditorDatabase = getDb(),
): Promise<{ id: number; savedAt: number }[]> {
  const rows = await db.snapshots
    .where("docId")
    .equals(docId)
    .sortBy("savedAt");
  return rows
    .filter((row) => row.id !== undefined)
    .map((row) => ({ id: row.id as number, savedAt: row.savedAt }))
    .reverse();
}

export async function getSnapshotContent(
  snapshotId: number,
  db: EditorDatabase = getDb(),
): Promise<JSONContent | undefined> {
  const row = await db.snapshots.get(snapshotId);
  return row?.content;
}
