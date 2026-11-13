import { Blob as NodeBlob, Buffer as NodeBuffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom's Blob neither implements arrayBuffer nor survives fake-indexeddb's
// structured clone; Node's Blob exercises the real byte-preserving path.
(globalThis as { Blob: unknown }).Blob = NodeBlob;

import { EditorDatabase } from "./db";
import {
  addFont,
  deleteFont,
  FontValidationError,
  listFonts,
  MAX_FONT_BYTES,
  readFontFamily,
  registerFontFace,
  registerStoredFonts,
  sniffFontFormat,
  validateFontFile,
} from "./fonts";

// Vitest runs from the repo root, so resolve the fixture relatively.
const FIXTURE_PATH = resolve("tests/fixtures/TestFont.ttf");

function fixtureBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

function fontBlob(bytes?: Uint8Array): Blob {
  const parts = [
    bytes ?? fixtureBytes(),
  ] as unknown as import("node:buffer").BlobPart[];
  return new NodeBlob(parts, {
    type: "font/ttf",
  }) as unknown as Blob;
}

let db: EditorDatabase;

beforeEach(() => {
  db = new EditorDatabase(`fonts-test-${Date.now()}-${Math.random()}`);
});

afterEach(async () => {
  await db.delete();
});

describe("font validation", () => {
  it("reads the family from the fixture name table", () => {
    expect(readFontFamily(fixtureBytes())).toBe("TestFont");
  });

  it("reads the digit/space family from the renamed fixture", () => {
    const bytes = new Uint8Array(
      readFileSync(resolve("tests/fixtures/TestFont010.ttf")),
    );
    expect(readFontFamily(bytes)).toBe("Test 010");
  });

  it("sniffs ttf from the sfnt version", () => {
    expect(sniffFontFormat(fixtureBytes())).toBe("ttf");
  });

  it("validates the fixture end to end", async () => {
    const result = await validateFontFile(fontBlob());
    expect(result.family).toBe("TestFont");
    expect(result.format).toBe("ttf");
  });

  it("rejects a bad sfnt header", () => {
    const bytes = fixtureBytes().slice();
    bytes[0] = 0x77; // "w" — not a font magic
    expect(() => sniffFontFormat(bytes)).toThrow(FontValidationError);
    expect(() => readFontFamily(bytes)).toThrow(FontValidationError);
  });

  it("rejects files without a name table", () => {
    // Minimal sfnt: version + zero tables.
    const bytes = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffFontFormat(bytes)).toBe("ttf");
    expect(() => readFontFamily(bytes)).toThrow(/name table/);
  });

  it("rejects oversize files before parsing", async () => {
    const big = new NodeBlob([new Uint8Array(MAX_FONT_BYTES + 1)], {
      type: "font/ttf",
    }) as unknown as Blob;
    await expect(validateFontFile(big)).rejects.toThrow(/too large/);
  });
});

describe("font storage", () => {
  it("adds, lists and deletes fonts in single transactions", async () => {
    expect(await listFonts(db)).toHaveLength(0);
    const record = await addFont(fontBlob(), db);
    expect(record.family).toBe("TestFont");
    expect(record.format).toBe("ttf");

    const listed = await listFonts(db);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.family).toBe("TestFont");

    // Deleting the font leaves the document text untouched (text keeps its
    // family mark; only the file row is removed).
    await deleteFont(record.id, db);
    expect(await listFonts(db)).toHaveLength(0);
  });

  it("persists font bytes byte-identically through IndexedDB", async () => {
    const record = await addFont(fontBlob(), db);
    const stored = await db.fonts.get(record.id);
    expect(stored).toBeDefined();
    const { blobToBytes } = await import("./blob");
    const roundTripped = await blobToBytes(stored?.blob as Blob);
    const expected = fixtureBytes();
    // `toEqual` on ~750 KB arrays costs seconds inside Vitest's differ (it
    // blew the 5 s timeout on CI); length plus memcmp proves identical bytes
    // in microseconds.
    expect(roundTripped.length).toBe(expected.length);
    expect(
      NodeBuffer.from(roundTripped).equals(NodeBuffer.from(expected)),
    ).toBe(true);
  });
});

describe("font registration", () => {
  it("registers stored fonts via FontFace from an ArrayBuffer", async () => {
    await addFont(fontBlob(), db);
    const added: { family: string; source: unknown }[] = [];
    const loaded: string[] = [];
    const fakeFace = function (this: unknown, family: string, source: unknown) {
      added.push({ family, source });
      return {
        load: () => {
          loaded.push(family);
          return Promise.resolve();
        },
      };
    };
    const faces = {
      add: () => undefined,
    };
    vi.stubGlobal("FontFace", fakeFace);
    Object.defineProperty(document, "fonts", {
      value: faces,
      configurable: true,
    });
    try {
      const { loaded, failed } = await registerStoredFonts(db);
      expect(loaded).toEqual(["TestFont"]);
      expect(failed).toEqual([]);
      expect(added).toHaveLength(1);
      // The source must be an ArrayBuffer, never a Blob (FontFace rejects
      // it). `instanceof` fails across vm realms, so check structurally.
      const source = added[0]?.source as {
        byteLength?: unknown;
        arrayBuffer?: unknown;
      };
      expect(typeof source?.byteLength).toBe("number");
      expect(source?.byteLength).toBe(fixtureBytes().length);
      expect(source?.arrayBuffer).toBeUndefined();
      expect(loaded).toEqual(["TestFont"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns false where the FontFace API is unavailable", async () => {
    vi.stubGlobal("FontFace", undefined);
    try {
      await expect(registerFontFace("TestFont", fontBlob())).resolves.toBe(
        false,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports stored fonts that fail to load instead of failing silently", async () => {
    await addFont(fontBlob(), db);
    const failingFace = function (this: unknown) {
      return {
        load: () => Promise.reject(new Error("corrupt tables")),
      };
    };
    vi.stubGlobal("FontFace", failingFace);
    try {
      const { loaded, failed } = await registerStoredFonts(db);
      expect(loaded).toEqual([]);
      expect(failed).toEqual(["TestFont"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not list an upload that fails to load, and names it", async () => {
    const failingFace = function (this: unknown) {
      return {
        load: () => Promise.reject(new Error("corrupt tables")),
      };
    };
    const faces = { add: () => undefined };
    vi.stubGlobal("FontFace", failingFace);
    Object.defineProperty(document, "fonts", {
      value: faces,
      configurable: true,
    });
    try {
      await expect(addFont(fontBlob(), db)).rejects.toThrow(
        /"TestFont" could not be loaded/,
      );
      expect(await listFonts(db)).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
