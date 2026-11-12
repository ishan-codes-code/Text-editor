import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom's Blob neither implements arrayBuffer/text nor survives
// fake-indexeddb's structured clone (it comes back as `{}`). Swap in Node's
// Blob for this file so fixtures exercise the real byte-preserving path;
// production Chrome Blobs implement the full API.
(globalThis as { Blob: unknown }).Blob = NodeBlob;

import { Autosave } from "./autosave";
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

describe("autosave", () => {
  it("debounces rapid edits into one save", async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const auto = new Autosave(async (_json, text) => {
      saves.push(text);
    }, {});
    auto.schedule({ type: "doc" }, "one");
    auto.schedule({ type: "doc" }, "one two");
    auto.schedule({ type: "doc" }, "one two three");
    expect(saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(saves).toEqual(["one two three"]);
    auto.dispose();
  });

  it("flush forces the save (blur / hidden tab path)", async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const states: string[] = [];
    const auto = new Autosave(
      async (_json, text) => {
        saves.push(text);
      },
      { onStateChange: (s) => states.push(s) },
    );
    // Crash scenario: the tab is killed ~100 ms after the last keystroke,
    // well inside the 400 ms debounce. flush() (visibilitychange/pagehide)
    // must still persist everything, so at most the debounce window is lost.
    auto.schedule({ type: "doc" }, "unsaved work");
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
    const auto = new Autosave(async () => {
      saves += 1;
    }, {});
    const big = new Array(20_001).fill("word").join(" ");
    auto.schedule({ type: "doc" }, big);
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
    const auto = new Autosave(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("quota?");
      },
      { onStateChange: (s) => states.push(s) },
    );
    auto.schedule({ type: "doc" }, "x");
    await vi.advanceTimersByTimeAsync(400);
    expect(states).toContain("error");
    await auto.flush();
    expect(attempts).toBe(2);
    expect(states.at(-1)).toBe("saved");
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
