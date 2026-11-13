import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDoc,
  EditorDatabase,
  maybeSnapshot,
  saveDocContent,
} from "../storage";
import {
  BLANK_DOC,
  isLoadableContent,
  resolveOpenContent,
  setContentWhenReady,
} from "./applyContent";

let db: EditorDatabase;

beforeEach(() => {
  db = new EditorDatabase(`apply-${Date.now()}-${Math.random()}`);
});

afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});

describe("isLoadableContent", () => {
  it("accepts doc nodes and rejects anything else", () => {
    expect(isLoadableContent({ type: "doc" })).toBe(true);
    expect(
      isLoadableContent({ type: "doc", content: [{ type: "paragraph" }] }),
    ).toBe(true);
    expect(isLoadableContent({ type: "paragraph" })).toBe(false);
    expect(isLoadableContent(null)).toBe(false);
    expect(isLoadableContent("doc")).toBe(false);
    expect(isLoadableContent(undefined)).toBe(false);
  });
});

describe("resolveOpenContent", () => {
  it("returns stored content untouched when it is loadable", async () => {
    const doc = await createDoc("Good", db);
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    };
    await saveDocContent(doc.id, content, "hi", db);
    const resolved = await resolveOpenContent(doc.id, db);
    expect(resolved.recovered).toBe(false);
    expect(resolved.content).toEqual(content);
  });

  it("falls back to the newest loadable snapshot for corrupt docs", async () => {
    const doc = await createDoc("Corrupt", db);
    const good = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "saved" }] },
      ],
    };
    await maybeSnapshot(doc.id, good, Date.now(), db);
    // Corrupt the stored row directly (production cause: disk-level damage
    // or a half-migrated schema the validator cannot express).
    await db.docs.update(doc.id, {
      content: { type: "paragraph" } as never,
    });
    const resolved = await resolveOpenContent(doc.id, db);
    expect(resolved.recovered).toBe(true);
    expect(resolved.content).toEqual(good);
  });

  it("falls back to a blank doc when nothing loadable exists", async () => {
    const doc = await createDoc("Empty", db);
    await db.docs.update(doc.id, { content: null as never });
    const resolved = await resolveOpenContent(doc.id, db);
    expect(resolved.recovered).toBe(true);
    expect(resolved.content).toEqual(BLANK_DOC);
  });
});

describe("setContentWhenReady", () => {
  it("waits out an in-progress IME composition instead of clobbering it", async () => {
    const applied: unknown[] = [];
    const dom = document.createElement("div");
    const fakeEditor = {
      view: { composing: true, dom },
      commands: {
        setContent: (content: unknown) => {
          applied.push(content);
        },
      },
    } as never;
    const content = { type: "doc" };
    const promise = setContentWhenReady(fakeEditor, content);
    // Still composing: nothing applied yet.
    await Promise.resolve();
    expect(applied).toHaveLength(0);
    dom.dispatchEvent(new Event("compositionend"));
    await promise;
    expect(applied).toEqual([content]);
  });

  it("applies immediately when nothing is composing", async () => {
    const applied: unknown[] = [];
    const fakeEditor = {
      view: { composing: false, dom: document.createElement("div") },
      commands: {
        setContent: (content: unknown) => {
          applied.push(content);
        },
      },
    } as never;
    await setContentWhenReady(fakeEditor, { type: "doc" });
    expect(applied).toHaveLength(1);
  });
});
