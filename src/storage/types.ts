import type { JSONContent } from "@tiptap/core";

/** A single document row. Content is Tiptap editor JSON, stored losslessly. */
export interface DocRecord {
  id: string;
  title: string;
  /** Lets titles render in Kruti Dev; null means the default UI font. */
  titleFont: string | null;
  content: JSONContent;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotRecord {
  id?: number;
  docId: string;
  content: JSONContent;
  savedAt: number;
}

export type FontFormat = "ttf" | "otf";

export interface FontRecord {
  id: string;
  family: string;
  format: FontFormat;
  blob: Blob;
  addedAt: number;
}

export interface ImageRecord {
  id: string;
  docId: string;
  blob: Blob;
  mime: string;
}

export type SettingsMap = Record<string, unknown>;

export const SETTINGS_KEYS = {
  theme: "theme",
  defaultFont: "defaultFont",
  defaultSize: "defaultSize",
  zoom: "zoom",
  lastOpenedDoc: "lastOpenedDoc",
  lastBackup: "lastBackup",
  persisted: "persisted",
  keepPastedColors: "keepPastedColors",
} as const;

export interface BackupCounts {
  docs: number;
  fonts: number;
  images: number;
  snapshots: number;
}

export interface BackupManifest {
  schemaVersion: 1;
  createdAt: number;
  includeSnapshots: boolean;
  counts: BackupCounts;
}

export function now(): number {
  return Date.now();
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 2 ** 32).toString(36)}`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}
