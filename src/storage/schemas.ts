import * as v from "valibot";

/**
 * Valibot schemas for the backup file format. Restore validates every JSON
 * file against these BEFORE touching existing data.
 */

const countsSchema = v.object({
  docs: v.number(),
  fonts: v.number(),
  images: v.number(),
  snapshots: v.number(),
});

export const manifestSchema = v.object({
  schemaVersion: v.literal(1),
  createdAt: v.number(),
  includeSnapshots: v.boolean(),
  counts: countsSchema,
});

export type Manifest = v.InferOutput<typeof manifestSchema>;

const docSchema = v.object({
  id: v.string(),
  title: v.string(),
  titleFont: v.nullable(v.string()),
  // Editor JSON is an arbitrary JSON tree; structural checks happen on load.
  content: v.unknown(),
  wordCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export type ValidatedDoc = v.InferOutput<typeof docSchema>;

export const docsFileSchema = v.array(docSchema);

const settingEntrySchema = v.object({
  key: v.string(),
  value: v.unknown(),
});

export const settingsFileSchema = v.array(settingEntrySchema);

const snapshotSchema = v.object({
  docId: v.string(),
  content: v.unknown(),
  savedAt: v.number(),
});

export const snapshotsFileSchema = v.array(snapshotSchema);

const fontMetaSchema = v.object({
  id: v.string(),
  family: v.string(),
  format: v.union([v.literal("ttf"), v.literal("otf")]),
  addedAt: v.number(),
});

export const fontsFileSchema = v.array(fontMetaSchema);

const imageMetaSchema = v.object({
  id: v.string(),
  docId: v.string(),
  mime: v.string(),
});

export const imagesFileSchema = v.array(imageMetaSchema);

export function parseManifest(raw: unknown): Manifest {
  return v.parse(manifestSchema, raw);
}
