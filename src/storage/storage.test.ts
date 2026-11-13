import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom's Blob neither implements arrayBuffer/text nor survives
// fake-indexeddb's structured clone (it comes back as `{}`). Swap in Node's
// Blob for this file so fixtures exercise the real byte-preserving path;
// production Chrome Blobs implement the full API.
(globalThis as { Blob: unknown }).Blob = NodeBlob;

import type { JSONContent } from "@tiptap/core";
import { createBackup } from "./backup";
import { blobToBytes, blobToText } from "./blob";
import { EditorDatabase } from "./db";
import {
  createDoc,
  deleteDoc,
  duplicateDoc,
  getDoc,
  listDocs,
  renameDoc,
  saveDocContent,
  searchDocs,
} from "./documents";
import { acquireDocLock } from "./locks";
import { parseBackup, RestoreError, restoreBackup } from "./restore";
import { SaveQueue, type SaveState } from "./saveQueue";
import { MAX_SNAPSHOTS_PER_DOC, maybeSnapshot } from "./snapshots";

let db: EditorDatabase;

/**
 * jsdom's Blob neither implements arrayBuffer/text nor survives
 * fake-indexeddb's structured clone (it comes back as `{}`), so font/image
 * fixtures use Node's Blob, which round-trips byte-identically. Production
 * Chrome Blobs implement the full API.
 */
function testBlob(parts: string[], type: string): Blob {
  return new NodeBlob(parts, { type }) as unknown as Blob;
}

beforeEach(() => {
  db = new EditorDatabase(`test-${Date.now()}-${Math.random()}`);
});

afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});

describe("documents", () => {
  it("creates, lists, renames, duplicates, deletes and searches", async () => {
    const first = await createDoc("Shopping", db);
    const second = await createDoc("Kruti notes", db);
    expect(first.title).toBe("Shopping");
    expect(first.titleFont).toBeNull();

    let listed = await listDocs(db);
    expect(listed).toHaveLength(2);
    // Most recently updated first.
    expect(listed[0]?.id).toBe(second.id);

    await renameDoc(first.id, "Groceries", db);
    expect((await getDoc(first.id, db))?.title).toBe("Groceries");

    const copy = await duplicateDoc(first.id, db);
    expect(copy?.title).toBe("Groceries (copy)");
    expect(copy?.id).not.toBe(first.id);
    expect(copy?.content).toEqual((await getDoc(first.id, db))?.content);

    expect(await searchDocs("grocer", db)).toHaveLength(2);
    expect(await searchDocs("kruti", db)).toHaveLength(1);
    expect(await searchDocs("", db)).toHaveLength(3);

    await deleteDoc(first.id, db);
    expect(await getDoc(first.id, db)).toBeUndefined();
    listed = await listDocs(db);
    expect(listed).toHaveLength(2);
  });

  it("saves content and word count in one transaction", async () => {
    const doc = await createDoc("T", db);
    await saveDocContent(
      doc.id,
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hello brave world" }],
          },
        ],
      },
      "hello brave world",
      db,
    );
    const saved = await getDoc(doc.id, db);
    expect(saved?.wordCount).toBe(3);
    expect(JSON.stringify(saved?.content)).toContain("hello brave world");
  });

  it("lists from the content-free projection, not the docs table", async () => {
    const doc = await createDoc("Meta check", db);
    const big = `x`.repeat(50_000);
    await saveDocContent(
      doc.id,
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: big }] },
        ],
      },
      big,
      db,
    );
    // The projection carries no content field at all.
    const rows = await db.docMeta.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0] !== undefined && "content" in rows[0]).toBe(false);
    expect(rows[0]?.wordCount).toBe(1);
    const listed = await listDocs(db);
    expect(listed[0]?.title).toBe("Meta check");
    expect(listed[0] !== undefined && "content" in listed[0]).toBe(false);
  });

  it("duplicating a doc copies its images under new ids", async () => {
    const doc = await createDoc("Illustrated", db);
    const imageId = "img-original";
    await db.images.add({
      id: imageId,
      docId: doc.id,
      blob: testBlob(["pixels"], "image/webp"),
      mime: "image/webp",
    });
    await saveDocContent(
      doc.id,
      {
        type: "doc",
        content: [
          {
            type: "imageRef",
            attrs: { imageId },
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "caption" }],
          },
        ],
      },
      "caption",
      db,
    );
    const copy = await duplicateDoc(doc.id, db);
    expect(copy).not.toBeUndefined();
    const copyContent = JSON.stringify(copy?.content);
    // The copy references a NEW image id, never the original's.
    expect(copyContent).not.toContain(imageId);
    const copyImages = await db.images
      .where("docId")
      .equals(copy!.id)
      .toArray();
    expect(copyImages).toHaveLength(1);
    expect(copyImages[0]?.id).not.toBe(imageId);
    expect(copyContent).toContain(copyImages[0]?.id ?? "missing");
    // Deleting the original (and its images) leaves the copy intact.
    await deleteDoc(doc.id, db);
    expect(await db.images.where("docId").equals(copy!.id).count()).toBe(1);
    expect(JSON.stringify((await getDoc(copy!.id, db))?.content)).toContain(
      copyImages[0]?.id ?? "missing",
    );
  });

  it("deleting a doc removes its snapshots and images", async () => {
    const doc = await createDoc("T", db);
    await maybeSnapshot(doc.id, { type: "doc" }, Date.now(), db);
    await db.images.add({
      id: "img-1",
      docId: doc.id,
      blob: testBlob(["x"], "image/webp"),
      mime: "image/webp",
    });
    await deleteDoc(doc.id, db);
    expect(await db.snapshots.where("docId").equals(doc.id).count()).toBe(0);
    expect(await db.images.where("docId").equals(doc.id).count()).toBe(0);
  });
});

describe("save queue", () => {
  it("debounces rapid edits into one save", async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const auto = new SaveQueue(async (_json: JSONContent, text: string) => {
      saves.push(text);
    }, {});
    auto.schedule(
      () => ({ type: "doc" }),
      () => "one",
    );
    auto.schedule(
      () => ({ type: "doc" }),
      () => "one two",
    );
    auto.schedule(
      () => ({ type: "doc" }),
      () => "one two three",
    );
    expect(saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(saves).toEqual(["one two three"]);
    auto.dispose();
  });

  it("flush forces the save (blur / hidden tab path)", async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const states: string[] = [];
    const auto = new SaveQueue(
      async (_json: JSONContent, text: string) => {
        saves.push(text);
      },
      { onStateChange: (s: SaveState) => states.push(s) },
    );
    // Crash scenario: the tab is killed ~100 ms after the last keystroke,
    // well inside the 400 ms debounce. flush() (visibilitychange/pagehide)
    // must still persist everything, so at most the debounce window is lost.
    auto.schedule(
      () => ({ type: "doc" }),
      () => "unsaved work",
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(saves).toHaveLength(0);
    await auto.flush();
    expect(saves).toEqual(["unsaved work"]);
    expect(states).toContain("saved");
    auto.dispose();
  });

  it("uses the long debounce for very large docs", async () => {
    vi.useFakeTimers();
    let saves = 0;
    const auto = new SaveQueue(async (_json: JSONContent, _text: string) => {
      saves += 1;
    }, {});
    const big = new Array(20_001).fill("word").join(" ");
    auto.schedule(
      () => ({ type: "doc" }),
      () => big,
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(saves).toBe(0);
    await vi.advanceTimersByTimeAsync(800);
    // The large-doc path yields once (setTimeout 0) before writing.
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toBe(1);
    auto.dispose();
  });

  it("reports errors but retries the payload on the next flush", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const states: string[] = [];
    const auto = new SaveQueue(
      async (_json: JSONContent, _text: string) => {
        attempts += 1;
        if (attempts === 1) throw new Error("quota?");
      },
      { onStateChange: (s: SaveState) => states.push(s) },
    );
    auto.schedule(
      () => ({ type: "doc" }),
      () => "x",
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(states).toContain("error");
    await auto.flush();
    expect(attempts).toBe(2);
    expect(states.at(-1)).toBe("saved");
    auto.dispose();
  });

  it("serializes at write time, so an older save never overwrites newer content", async () => {
    vi.useFakeTimers();
    const seen: { text: string; generation: number }[] = [];
    let liveText = "v1";
    const auto = new SaveQueue(async (_json: JSONContent, text: string) => {
      seen.push({ text, generation: auto.scheduledGeneration });
    }, {});
    // Rapid keystrokes coalesce: only the newest generation is written, and
    // the payload is serialized when the write runs — not per keystroke.
    auto.schedule(
      () => ({ type: "doc", v: 1 }),
      () => liveText,
    );
    liveText = "v2";
    auto.schedule(
      () => ({ type: "doc", v: 2 }),
      () => liveText,
    );
    liveText = "v3";
    auto.schedule(
      () => ({ type: "doc" }),
      () => liveText,
    );
    expect(auto.scheduledGeneration).toBe(3);
    await vi.advanceTimersByTimeAsync(400);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ text: "v3", generation: 3 });
    expect(auto.writtenGeneration).toBe(3);
    auto.dispose();
  });

  it("flush drains an in-flight write before a newer generation", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const auto = new SaveQueue(async (_json: JSONContent, text: string) => {
      order.push(`start:${text}`);
      if (text === "first") await gate;
      order.push(`end:${text}`);
    }, {});
    auto.schedule(
      () => ({ type: "doc" }),
      () => "first",
    );
    const flushPromise = auto.flush();
    auto.schedule(
      () => ({ type: "doc" }),
      () => "second",
    );
    const fullFlush = auto.flush();
    release();
    await flushPromise;
    await fullFlush;
    // Sequential single-writer order: first completes, then the newer write.
    expect(order).toEqual([
      "start:first",
      "end:first",
      "start:second",
      "end:second",
    ]);
    expect(auto.writtenGeneration).toBe(2);
    auto.dispose();
  });
});

describe("snapshots", () => {
  it("skips recent and unchanged content, prunes to the last 10", async () => {
    const doc = await createDoc("T", db);
    const base = Date.now();
    expect(await maybeSnapshot(doc.id, { type: "doc", n: 1 }, base, db)).toBe(
      true,
    );
    // Too soon: skipped.
    expect(
      await maybeSnapshot(doc.id, { type: "doc", n: 2 }, base + 60_000, db),
    ).toBe(false);
    // Interval passed but identical content: skipped.
    expect(
      await maybeSnapshot(doc.id, { type: "doc", n: 1 }, base + 6 * 60_000, db),
    ).toBe(false);
    // Write 12 spaced snapshots; only the newest 10 survive.
    for (let i = 0; i < 12; i++) {
      await maybeSnapshot(
        doc.id,
        { type: "doc", n: 100 + i },
        base + (i + 2) * 6 * 60_000,
        db,
      );
    }
    const count = await db.snapshots.where("docId").equals(doc.id).count();
    expect(count).toBe(MAX_SNAPSHOTS_PER_DOC);
  });
});

describe("locks", () => {
  it("falls back to editable when Web Locks are unavailable", async () => {
    const lock = await acquireDocLock("doc-1");
    expect(lock.held).toBe(true);
    lock.release();
  });
});

describe("backup and restore", () => {
  async function seed(): Promise<string> {
    const doc = await createDoc("Backup me", db);
    await saveDocContent(doc.id, { type: "doc", t: 1 }, "Backup me", db);
    await db.fonts.add({
      id: "font-1",
      family: "Test Family",
      format: "ttf",
      blob: testBlob(["fake-ttf"], "font/ttf"),
      addedAt: Date.now(),
    });
    await db.images.add({
      id: "img-1",
      docId: doc.id,
      blob: testBlob(["fake-webp"], "image/webp"),
      mime: "image/webp",
    });
    await db.settings.put({ key: "zoom", value: 1.25 });
    await maybeSnapshot(doc.id, { type: "doc", t: 1 }, Date.now(), db);
    return doc.id;
  }

  it("round-trips docs, fonts, images, settings and snapshots", async () => {
    const docId = await seed();
    const blob = await createBackup({ includeSnapshots: true }, db);

    const wiped = new EditorDatabase(`wiped-${Date.now()}`);
    try {
      const { report } = await restoreBackup(blob, "replace", wiped);
      expect(report.docsRestored).toBe(1);
      expect(report.fontsRestored).toBe(1);
      expect(report.imagesRestored).toBe(1);
      expect(report.snapshotsRestored).toBe(1);

      const restored = await getDoc(docId, wiped);
      expect(restored?.title).toBe("Backup me");
      expect(JSON.stringify(restored?.content)).toContain('"t":1');
      const font = await wiped.fonts.get("font-1");
      expect(font?.family).toBe("Test Family");
      expect(font !== undefined ? await blobToText(font.blob) : "").toBe(
        "fake-ttf",
      );
      const image = await wiped.images.get("img-1");
      expect(image?.docId).toBe(docId);
      expect(await wiped.settings.get("zoom")).toMatchObject({ value: 1.25 });
    } finally {
      await wiped.delete();
    }
  });

  it("merge keeps the newer copy of the same doc", async () => {
    const docId = await seed();
    const blob = await createBackup({ includeSnapshots: false }, db);
    // Local copy becomes newer after the backup was taken.
    await saveDocContent(docId, { type: "doc", t: 2 }, "newer", db);
    const target = new EditorDatabase(`merge-${Date.now()}`);
    try {
      // Seed target with the newer version, then merge the older backup.
      const newer = await getDoc(docId, db);
      if (newer) await target.docs.put({ ...newer });
      const { report } = await restoreBackup(blob, "merge", target);
      expect(report.docsSkippedNewer).toBe(1);
      expect(report.docsRestored).toBe(0);
      expect((await target.docs.get(docId))?.wordCount).toBe(1);
    } finally {
      await target.delete();
    }
  });

  it("delivers the pre-restore backup before wiping anything", async () => {
    const docId = await seed();
    const blob = await createBackup({ includeSnapshots: false }, db);
    const target = new EditorDatabase(`predeliver-${Date.now()}`);
    try {
      const local = await createDoc("Local work", target);
      const delivered: Blob[] = [];
      const { report } = await restoreBackup(blob, "replace", target, {
        onPreRestoreBackup: async (pre) => {
          // The hook runs before the wipe: the local doc must still exist,
          // and the delivered backup must already contain it.
          expect(await target.docs.get(local.id)).not.toBeUndefined();
          delivered.push(pre);
          const entries = (await import("fflate")).unzipSync(
            await blobToBytes(pre),
          );
          const docs = JSON.parse(
            new TextDecoder().decode(entries["docs.json"]),
          ) as { id: string }[];
          expect(docs.some((d) => d.id === local.id)).toBe(true);
        },
      });
      expect(delivered).toHaveLength(1);
      expect(report.docsRestored).toBe(1);
      // Replace wiped the local doc and restored the backup instead.
      expect(await target.docs.get(local.id)).toBeUndefined();
      expect((await target.docs.get(docId))?.title).toBe("Backup me");
    } finally {
      await target.delete();
    }
  });

  it("rejects corrupt files without touching existing data", async () => {
    const docId = await seed();
    const before = JSON.stringify(await getDoc(docId, db));

    const badZips: [string, Blob][] = [
      ["not a zip", testBlob(["hello"], "application/zip")],
    ];
    // Valid zip, missing manifest.
    const { Zip, ZipPassThrough, strToU8 } = await import("fflate");
    const build = async (files: Record<string, Uint8Array>): Promise<Blob> => {
      const chunks: Uint8Array[] = [];
      let resolveDone: () => void = () => undefined;
      const finished = new Promise<void>((r) => {
        resolveDone = r;
      });
      const zip = new Zip((_err, chunk, final) => {
        chunks.push(chunk);
        if (final) resolveDone();
      });
      for (const [name, data] of Object.entries(files)) {
        const s = new ZipPassThrough(name);
        zip.add(s);
        s.push(data, true);
      }
      zip.end();
      await finished;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      return new NodeBlob([out], {
        type: "application/zip",
      }) as unknown as Blob;
    };
    badZips.push([
      "missing manifest",
      await build({ "docs.json": strToU8("[]") }),
    ]);
    badZips.push([
      "wrong schema version",
      await build({
        "manifest.json": strToU8(
          JSON.stringify({
            schemaVersion: 999,
            createdAt: 1,
            includeSnapshots: false,
            counts: { docs: 0, fonts: 0, images: 0, snapshots: 0 },
          }),
        ),
      }),
    ]);
    const good = await createBackup({ includeSnapshots: false }, db);
    const parsed = await parseBackup(good);
    void parsed;
    // Tamper: claim a font the zip does not contain.
    const tamperedManifest = {
      schemaVersion: 1,
      createdAt: 1,
      includeSnapshots: false,
      counts: { docs: 1, fonts: 5, images: 1, snapshots: 0 },
    };
    const { unzipSync } = await import("fflate");
    const entries = unzipSync(await blobToBytes(good));
    entries["manifest.json"] = strToU8(JSON.stringify(tamperedManifest));
    badZips.push(["missing font file", await build(entries)]);

    for (const [label, blob] of badZips) {
      await expect(
        restoreBackup(blob, "replace", db),
        label,
      ).rejects.toBeInstanceOf(RestoreError);
    }
    // Existing data untouched by every rejected restore.
    expect(JSON.stringify(await getDoc(docId, db))).toBe(before);
  });

  it("handles a large library without crashing", async () => {
    for (let i = 0; i < 200; i++) {
      await createDoc(`Doc ${i}`, db);
    }
    for (let i = 0; i < 20; i++) {
      await db.fonts.add({
        id: `font-${i}`,
        family: `Family ${i}`,
        format: "ttf",
        blob: testBlob([`data-${i}`], "font/ttf"),
        addedAt: Date.now(),
      });
    }
    const blob = await createBackup({ includeSnapshots: false }, db);
    expect(blob.size).toBeGreaterThan(0);
    const target = new EditorDatabase(`large-${Date.now()}`);
    try {
      const { report } = await restoreBackup(blob, "replace", target);
      expect(report.docsRestored).toBe(200);
      expect(report.fontsRestored).toBe(20);
    } finally {
      await target.delete();
    }
  });
});
