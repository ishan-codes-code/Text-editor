import { strFromU8, unzipSync } from "fflate";
import * as v from "valibot";
import { createBackup } from "./backup";
import { blobToBytes } from "./blob";
import { type EditorDatabase, getDb } from "./db";
import {
  docsFileSchema,
  fontsFileSchema,
  imagesFileSchema,
  manifestSchema,
  settingsFileSchema,
  snapshotsFileSchema,
  type ValidatedDoc,
} from "./schemas";
import type { DocRecord, SnapshotRecord } from "./types";

export type RestoreMode = "merge" | "replace";

export interface RestoreReport {
  mode: RestoreMode;
  docsRestored: number;
  docsSkippedNewer: number;
  fontsRestored: number;
  imagesRestored: number;
  settingsRestored: number;
  snapshotsRestored: number;
}

export class RestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreError";
  }
}

interface ParsedBackup {
  docs: ValidatedDoc[];
  settings: { key: string; value: unknown }[];
  snapshots: { docId: string; content: unknown; savedAt: number }[];
  fonts: {
    id: string;
    family: string;
    format: "ttf" | "otf";
    data: Uint8Array;
    filename: string;
  }[];
  images: { id: string; docId: string; mime: string; data: Uint8Array }[];
}

function fileText(files: Record<string, Uint8Array>, name: string): string {
  const bytes = files[name];
  if (bytes === undefined) throw new RestoreError(`Backup is missing ${name}.`);
  return strFromU8(bytes);
}

/**
 * Parses and validates a backup zip WITHOUT writing anything. Throws
 * RestoreError (leaving existing data untouched) on any problem: bad zip,
 * bad manifest, wrong schema version, missing font/image entries, or an
 * invalid docs/settings/snapshots file.
 */
export async function parseBackup(blob: Blob): Promise<ParsedBackup> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(await blobToBytes(blob));
  } catch {
    throw new RestoreError("That file is not a valid backup zip.");
  }

  let manifest: v.InferOutput<typeof manifestSchema>;
  try {
    manifest = v.parse(
      manifestSchema,
      JSON.parse(fileText(files, "manifest.json")),
    );
  } catch {
    throw new RestoreError("Backup manifest is missing or invalid.");
  }
  if (manifest.schemaVersion !== 1) {
    throw new RestoreError(
      `Unsupported backup version ${manifest.schemaVersion as number}.`,
    );
  }

  const parseJsonFile = <T>(
    name: string,
    schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>,
    label: string,
  ): T => {
    try {
      return v.parse(schema, JSON.parse(fileText(files, name)));
    } catch {
      throw new RestoreError(`Backup ${label} is invalid.`);
    }
  };

  const docs = parseJsonFile("docs.json", docsFileSchema, "docs file");
  const settings = parseJsonFile(
    "settings.json",
    settingsFileSchema,
    "settings file",
  );
  const snapshots =
    manifest.includeSnapshots && files["snapshots.json"] !== undefined
      ? parseJsonFile("snapshots.json", snapshotsFileSchema, "snapshots file")
      : [];

  if (docs.length !== manifest.counts.docs) {
    throw new RestoreError("Backup docs do not match the manifest counts.");
  }

  const fontsMeta = parseJsonFile("fonts.json", fontsFileSchema, "fonts file");
  const imagesMeta = parseJsonFile(
    "images.json",
    imagesFileSchema,
    "images file",
  );

  const fonts: ParsedBackup["fonts"] = fontsMeta.map((meta) => {
    const data = files[`fonts/${meta.id}.ttf`] ?? files[`fonts/${meta.id}.otf`];
    if (data === undefined) {
      throw new RestoreError(
        `Backup is missing the font file for "${meta.family}".`,
      );
    }
    return { ...meta, data, filename: `fonts/${meta.id}` };
  });
  const images: ParsedBackup["images"] = imagesMeta.map((meta) => {
    const data =
      files[`images/${meta.id}.webp`] ??
      files[`images/${meta.id}.png`] ??
      files[`images/${meta.id}.jpg`] ??
      files[`images/${meta.id}.jpeg`];
    if (data === undefined) {
      throw new RestoreError("Backup is missing an image file.");
    }
    return { ...meta, data };
  });
  if (fonts.length !== manifest.counts.fonts) {
    throw new RestoreError("Backup fonts do not match the manifest counts.");
  }
  if (images.length !== manifest.counts.images) {
    throw new RestoreError("Backup images do not match the manifest counts.");
  }

  return { docs, settings, snapshots, fonts, images };
}

function fontMime(format: "ttf" | "otf"): string {
  return format === "otf" ? "font/otf" : "font/ttf";
}

/**
 * Restores a validated backup. Always creates an automatic pre-restore
 * backup first (returned to the caller for safekeeping). Each store is
 * written in its own transaction; validation happens before any write, so
 * a corrupt file leaves existing data untouched.
 */
export async function restoreBackup(
  blob: Blob,
  mode: RestoreMode = "merge",
  db: EditorDatabase = getDb(),
): Promise<{ report: RestoreReport; preRestoreBackup: Blob }> {
  const parsed = await parseBackup(blob);
  const preRestoreBackup = await createBackup({ includeSnapshots: true }, db);

  const report: RestoreReport = {
    mode,
    docsRestored: 0,
    docsSkippedNewer: 0,
    fontsRestored: 0,
    imagesRestored: 0,
    settingsRestored: 0,
    snapshotsRestored: 0,
  };

  if (mode === "replace") {
    await db.transaction(
      "rw",
      [db.docs, db.fonts, db.images, db.settings, db.snapshots],
      async () => {
        await Promise.all([
          db.docs.clear(),
          db.fonts.clear(),
          db.images.clear(),
          db.settings.clear(),
          db.snapshots.clear(),
        ]);
      },
    );
  }

  await db.transaction("rw", db.docs, async () => {
    for (const doc of parsed.docs) {
      const record: DocRecord = {
        id: doc.id,
        title: doc.title,
        titleFont: doc.titleFont,
        content: (doc.content ?? { type: "doc" }) as DocRecord["content"],
        wordCount: doc.wordCount,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
      if (mode === "merge") {
        const existing = await db.docs.get(doc.id);
        if (existing !== undefined && existing.updatedAt >= doc.updatedAt) {
          report.docsSkippedNewer += 1;
          continue;
        }
      }
      await db.docs.put(record);
      report.docsRestored += 1;
    }
  });

  await db.transaction("rw", db.fonts, async () => {
    for (const font of parsed.fonts) {
      const existing =
        mode === "merge" ? await db.fonts.get(font.id) : undefined;
      if (existing !== undefined) continue;
      await db.fonts.put({
        id: font.id,
        family: font.family,
        format: font.format,
        blob: new Blob([font.data.buffer as ArrayBuffer], {
          type: fontMime(font.format),
        }),
        addedAt: Date.now(),
      });
      report.fontsRestored += 1;
    }
  });

  await db.transaction("rw", db.images, async () => {
    for (const image of parsed.images) {
      const existing =
        mode === "merge" ? await db.images.get(image.id) : undefined;
      if (existing !== undefined) continue;
      await db.images.put({
        id: image.id,
        docId: image.docId,
        blob: new Blob([image.data.buffer as ArrayBuffer], {
          type: image.mime,
        }),
        mime: image.mime,
      });
      report.imagesRestored += 1;
    }
  });

  await db.transaction("rw", db.settings, async () => {
    for (const setting of parsed.settings) {
      await db.settings.put({ key: setting.key, value: setting.value });
      report.settingsRestored += 1;
    }
  });

  if (parsed.snapshots.length > 0) {
    await db.transaction("rw", db.snapshots, async () => {
      const rows: SnapshotRecord[] = parsed.snapshots.map((s) => ({
        docId: s.docId,
        content: (s.content ?? { type: "doc" }) as SnapshotRecord["content"],
        savedAt: s.savedAt,
      }));
      await db.snapshots.bulkAdd(rows);
      report.snapshotsRestored = rows.length;
    });
  }

  return { report, preRestoreBackup };
}
