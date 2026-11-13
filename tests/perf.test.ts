import { Blob as NodeBlob } from "node:buffer";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { jsonToPlainText } from "../src/export/formats";
import { createBackup } from "../src/storage/backup";
import { blobToText } from "../src/storage/blob";
import { EditorDatabase } from "../src/storage/db";
import { createDoc, getDoc, saveDocContent } from "../src/storage/documents";
import { restoreBackup } from "../src/storage/restore";
import { SaveQueue } from "../src/storage/saveQueue";

// Node Blobs for byte-identical fixtures (see src/storage/storage.test.ts).
(globalThis as { Blob: unknown }).Blob = NodeBlob;

const WORDS = [
  "hindi",
  "angrezi",
  "kitaab",
  "paani",
  "suraj",
  "chand",
  "ghar",
  "bazaar",
  "kahani",
  "likhna",
  "padhna",
  "bolna",
  "sunna",
  "dekhna",
  "chalna",
  "rukna",
  "khaana",
  "peena",
  "sona",
  "jaagna",
];

/** Deterministic ~50,000-word editor JSON: 2500 paragraphs x 20 words. */
function fiftyThousandWordDoc(): { doc: JSONContent; text: string } {
  const paragraphs: JSONContent[] = [];
  const lines: string[] = [];
  for (let para = 0; para < 2500; para++) {
    const words: string[] = [];
    for (let word = 0; word < 20; word++) {
      words.push(`${WORDS[(para * 20 + word) % WORDS.length]}${para}-${word}`);
    }
    const line = words.join(" ");
    lines.push(line);
    paragraphs.push({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    });
  }
  return {
    doc: { type: "doc", content: paragraphs },
    text: lines.join("\n\n"),
  };
}

function timed<T>(label: string, work: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = work();
  const ms = performance.now() - start;
  // Vitest captures stdout; these numbers feed the NFR table in the summary.
  console.log(`[perf] ${label}: ${ms.toFixed(1)} ms`);
  return { result, ms };
}

describe("typing latency on a 50,000-word document", () => {
  it("serializes, counts and saves within generous CI bounds", async () => {
    const { doc, text } = fiftyThousandWordDoc();
    const wordCount = text.trim().split(/\s+/).length;
    expect(wordCount).toBe(50_000);

    // The per-keystroke autosave path: schedule() must be instant (it only
    // stashes lazy getters and arms a timer); serialization happens at write.
    vi.useFakeTimers();
    try {
      const auto = new SaveQueue(async () => undefined, {});
      const scheduled = timed("autosave.schedule (per-keystroke cost)", () => {
        auto.schedule(
          () => doc,
          () => text,
        );
      });
      expect(scheduled.ms).toBeLessThan(50);
      auto.dispose();
    } finally {
      vi.useRealTimers();
    }

    // Deferred work that must fit inside the debounce window.
    const serialized = timed("JSON.stringify 50k-word doc", () =>
      JSON.stringify(doc),
    );
    expect(serialized.ms).toBeLessThan(1000);

    const counted = timed("word-count path (jsonToPlainText)", () =>
      jsonToPlainText(doc),
    );
    expect(counted.result.trim().split(/\s+/)).toHaveLength(50_000);
    expect(counted.ms).toBeLessThan(1000);
  }, 30_000);

  it("saves a 50,000-word doc to IndexedDB", async () => {
    const db = new EditorDatabase(`perf-${Date.now()}`);
    try {
      const { doc, text } = fiftyThousandWordDoc();
      const record = await createDoc("Perf", db);
      const start = performance.now();
      await saveDocContent(record.id, doc, text, db);
      const ms = performance.now() - start;
      console.log(`[perf] saveDocContent 50k-word doc: ${ms.toFixed(1)} ms`);
      expect(ms).toBeLessThan(5000);
      expect((await getDoc(record.id, db))?.wordCount).toBe(50_000);
    } finally {
      await db.delete();
    }
  }, 30_000);
});

describe("large backup", () => {
  it("backs up and restores 200 docs with fonts and images without crashing", async () => {
    const db = new EditorDatabase(`large-${Date.now()}`);
    try {
      const imageBytes = new Uint8Array(20_000);
      for (let docIndex = 0; docIndex < 200; docIndex++) {
        const record = await createDoc(`Doc ${docIndex}`, db);
        await saveDocContent(
          record.id,
          {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: `body ${docIndex} `.repeat(50) },
                ],
              },
            ],
          },
          `body ${docIndex} `,
          db,
        );
        if (docIndex % 10 === 0) {
          await db.images.add({
            id: `img-${docIndex}`,
            docId: record.id,
            blob: new NodeBlob([imageBytes], {
              type: "image/webp",
            }) as unknown as Blob,
            mime: "image/webp",
          });
        }
      }
      for (let fontIndex = 0; fontIndex < 5; fontIndex++) {
        await db.fonts.add({
          id: `font-${fontIndex}`,
          family: `Perf Font ${fontIndex}`,
          format: "ttf",
          blob: new NodeBlob([new Uint8Array(50_000)], {
            type: "font/ttf",
          }) as unknown as Blob,
          addedAt: Date.now(),
        });
      }

      const backupStart = performance.now();
      const blob = await createBackup({ includeSnapshots: true }, db);
      const backupMs = performance.now() - backupStart;
      console.log(
        `[perf] large backup: ${(blob.size / 1024).toFixed(0)} KiB in ${backupMs.toFixed(0)} ms (200 docs, 20 images, 5 fonts)`,
      );
      expect(backupMs).toBeLessThan(30_000);

      const wiped = new EditorDatabase(`large-wiped-${Date.now()}`);
      try {
        const restoreStart = performance.now();
        const { report } = await restoreBackup(blob, "replace", wiped);
        const restoreMs = performance.now() - restoreStart;
        console.log(`[perf] large restore: ${restoreMs.toFixed(0)} ms`);
        expect(report.docsRestored).toBe(200);
        expect(report.imagesRestored).toBe(20);
        expect(report.fontsRestored).toBe(5);
        const sample = await wiped.images.get("img-0");
        expect(
          sample === undefined ? "" : await blobToText(sample.blob),
        ).toHaveLength(20_000);
      } finally {
        await wiped.delete();
      }
    } finally {
      await db.delete();
    }
  }, 60_000);
});
