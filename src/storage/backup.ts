import { strToU8, Zip, ZipPassThrough } from "fflate";
import * as v from "valibot";
import { blobToBytes } from "./blob";
import { type EditorDatabase, getDb } from "./db";
import {
  manifestSchema,
  settingsFileSchema,
  snapshotsFileSchema,
} from "./schemas";
import {
  type BackupManifest,
  type FontFormat,
  now,
  SETTINGS_KEYS,
} from "./types";

export const BACKUP_SCHEMA_VERSION = 1 as const;

function extForFont(format: FontFormat, blob: Blob): string {
  if (format === "otf") return "otf";
  // `blob.type` can be empty (unknown MIME, or a test double); the stored
  // format is authoritative and defaults to ttf.
  const mime = blob.type ?? "";
  if (mime.includes("otf") || mime.includes("opentype")) return "otf";
  return "ttf";
}

function extForImage(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "webp";
}

/**
 * Builds the backup `.zip` incrementally (streaming entries, binary blobs —
 * never one base64 JSON) so large libraries cannot exhaust mobile memory:
 *
 *   manifest.json, docs.json, settings.json, snapshots.json (optional),
 *   fonts.json + fonts/<id>.<ttf|otf>, images.json + images/<id>.<webp|png|jpg>
 *
 * `fonts.json`/`images.json` carry the id/family/mime metadata the binary
 * entries cannot; docs reference images by id.
 */
export async function createBackup(
  options: { includeSnapshots?: boolean } = {},
  db: EditorDatabase = getDb(),
): Promise<Blob> {
  const includeSnapshots = options.includeSnapshots ?? true;
  const [docs, fonts, images, settingsRows, snapshots] = await Promise.all([
    db.docs.toArray(),
    db.fonts.toArray(),
    db.images.toArray(),
    db.settings.toArray(),
    includeSnapshots ? db.snapshots.toArray() : Promise.resolve([]),
  ]);

  const manifest: BackupManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: now(),
    includeSnapshots,
    counts: {
      docs: docs.length,
      fonts: fonts.length,
      images: images.length,
      snapshots: snapshots.length,
    },
  };

  const chunks: Uint8Array[] = [];
  let done: () => void = () => undefined;
  let failed: (err: unknown) => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    done = resolve;
    failed = reject;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      failed(err);
      return;
    }
    chunks.push(chunk);
    if (final) done();
  });

  const pushFile = async (
    name: string,
    data: Uint8Array | Blob,
  ): Promise<void> => {
    const stream = new ZipPassThrough(name);
    zip.add(stream);
    // `instanceof Uint8Array` fails across vm/iframe realms, so detect views
    // structurally; ArrayBuffer.isView works in every realm.
    const bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(
          data.buffer as ArrayBuffer,
          data.byteOffset,
          data.byteLength,
        )
      : await blobToBytes(data as Blob);
    // Push in slices so one huge font/image never blocks the loop.
    const SLICE = 256 * 1024;
    for (let offset = 0; offset < bytes.length; offset += SLICE) {
      stream.push(bytes.subarray(offset, offset + SLICE), false);
      await Promise.resolve();
    }
    stream.push(new Uint8Array(0), true);
  };

  try {
    await pushFile("manifest.json", strToU8(JSON.stringify(manifest)));
    await pushFile("docs.json", strToU8(JSON.stringify(docs)));
    await pushFile(
      "fonts.json",
      strToU8(
        JSON.stringify(
          fonts.map((font) => ({
            id: font.id,
            family: font.family,
            format: font.format,
            addedAt: font.addedAt,
          })),
        ),
      ),
    );
    await pushFile(
      "images.json",
      strToU8(
        JSON.stringify(
          images.map((image) => ({
            id: image.id,
            docId: image.docId,
            mime: image.mime,
          })),
        ),
      ),
    );
    await pushFile(
      "settings.json",
      strToU8(
        JSON.stringify(
          settingsRows.map(
            (row) => ({ ...row }) as { key: string; value: unknown },
          ),
        ),
      ),
    );
    if (includeSnapshots) {
      const serializable = snapshots.map((s) => ({
        docId: s.docId,
        content: s.content,
        savedAt: s.savedAt,
      }));
      await pushFile("snapshots.json", strToU8(JSON.stringify(serializable)));
    }
    for (const font of fonts) {
      await pushFile(
        `fonts/${font.id}.${extForFont(font.format, font.blob)}`,
        font.blob,
      );
    }
    for (const image of images) {
      await pushFile(
        `images/${image.id}.${extForImage(image.mime)}`,
        image.blob,
      );
    }
  } finally {
    zip.end();
  }
  await finished;
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([out.buffer as ArrayBuffer], { type: "application/zip" });
}

export function backupFileName(at: number = now()): string {
  const date = new Date(at).toISOString().slice(0, 10);
  return `text-editor-backup-${date}.zip`;
}

/**
 * Hands a Blob to the user. The File System Access save picker is not
 * available on Android Chrome, so this uses `<a download>` and the Web Share
 * API with files where supported.
 */
export async function deliverBackup(
  blob: Blob,
  filename: string,
): Promise<"download" | "share"> {
  const file = new File([blob], filename, { type: "application/zip" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (typeof nav.canShare === "function" && typeof nav.share === "function") {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return "share";
      }
    } catch {
      // User dismissed the sheet or share failed: fall through to download.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on a later tick; revoking synchronously can cancel the fetch
    // of the blob URL in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return "download";
}

/** Records a successful backup time for the "back up now" banner logic. */
export async function recordBackupTime(
  at: number = now(),
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEYS.lastBackup, value: at });
}

// Re-exported so restore + tests share one validation entry point.
export { manifestSchema, settingsFileSchema, snapshotsFileSchema, v };
