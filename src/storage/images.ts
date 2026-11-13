import { type EditorDatabase, getDb } from "./db";
import { type ImageRecord, newId } from "./types";

/** Longest edge after downscaling on insert (TRD). */
export const MAX_IMAGE_EDGE = 1600;

export interface PreparedImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

/**
 * Downscales an image file to a 1600 px longest edge and re-encodes it as
 * WebP. Falls back to the original file when the platform cannot process
 * images (jsdom tests) or WebP encoding is unavailable.
 */
export async function prepareImage(
  file: Blob,
  maxEdge: number = MAX_IMAGE_EDGE,
): Promise<PreparedImage> {
  const canProcess =
    typeof createImageBitmap === "function" &&
    typeof document !== "undefined" &&
    typeof document.createElement === "function";
  if (!canProcess) {
    return {
      blob: file,
      mime: file.type || "application/octet-stream",
      width: 0,
      height: 0,
    };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      blob: file,
      mime: file.type || "application/octet-stream",
      width: 0,
      height: 0,
    };
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return {
        blob: file,
        mime: file.type || "application/octet-stream",
        width: bitmap.width,
        height: bitmap.height,
      };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const encodable = canvas as HTMLCanvasElement & {
      convertToBlob?: (options?: {
        type?: string;
        quality?: number;
      }) => Promise<Blob | null>;
    };
    const webp: Blob | null =
      typeof encodable.convertToBlob === "function"
        ? await encodable.convertToBlob({ type: "image/webp", quality: 0.85 })
        : await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/webp", 0.85),
          );
    if (webp === null) {
      return {
        blob: file,
        mime: file.type || "application/octet-stream",
        width,
        height,
      };
    }
    return { blob: webp, mime: "image/webp", width, height };
  } finally {
    bitmap.close();
  }
}

export async function addImage(
  docId: string,
  blob: Blob,
  mime: string,
  db: EditorDatabase = getDb(),
): Promise<ImageRecord> {
  const record: ImageRecord = { id: newId(), docId, blob, mime };
  await db.transaction("rw", db.images, async () => {
    await db.images.add(record);
  });
  return record;
}

export function getImage(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<ImageRecord | undefined> {
  return db.images.get(id);
}

export async function deleteImage(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", db.images, async () => {
    await db.images.delete(id);
  });
  revokeImageURL(id);
}

/** In-memory blob-URL cache so renders never hit IndexedDB twice. */
const urlCache = new Map<string, string>();

export async function imageObjectURL(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached !== undefined) return cached;
  const record = await getImage(id, db);
  if (record === undefined) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(id, url);
  return url;
}

export function revokeImageURL(id: string): void {
  const url = urlCache.get(id);
  if (url !== undefined) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

/** Test helper: clears the object-URL cache between cases. */
export function clearImageURLCacheForTests(): void {
  urlCache.clear();
}
