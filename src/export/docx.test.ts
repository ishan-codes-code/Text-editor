import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import type { JSONContent } from "@tiptap/core";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { jsonToDocxBlob } from "./docxExport";
import { importFile, titleForImport } from "./import";

// jsdom's Blob/File lack arrayBuffer/text and do not survive structured
// clone; Node's round-trip byte-identically. Production Chrome implements the
// full API (same swap as src/storage/storage.test.ts).
(globalThis as { Blob: unknown }).Blob = NodeBlob;
(globalThis as { File: unknown }).File = NodeFile;

const doc: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1, textAlign: "center" },
      content: [{ type: "text", text: "Export Test" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world", marks: [{ type: "bold" }] },
        {
          type: "text",
          text: "Kruti",
          marks: [{ type: "textStyle", attrs: { fontFamily: "Kruti Dev" } }],
        },
      ],
    },
    { type: "pageBreak" },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "item one" }],
            },
          ],
        },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Head" }],
                },
              ],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Cell" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("docx export", () => {
  it("produces a valid .docx zip with text, fonts and a page break", async () => {
    const blob = await jsonToDocxBlob(doc);
    expect(blob.type).toContain("officedocument");
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = new TextDecoder().decode(entries["word/document.xml"]);
    expect(xml).toContain("Export Test");
    expect(xml).toContain("world");
    // Font names are written into runs so Word uses installed fonts.
    expect(xml).toContain("Kruti Dev");
    // Manual page break survives as a Word page break.
    expect(xml).toContain('w:type="page"');
    // List item and table cell text survive.
    expect(xml).toContain("item one");
    expect(xml).toContain("Cell");
  });

  it("round-trips text through mammoth", async () => {
    const blob = await jsonToDocxBlob(doc);
    // Vitest resolves mammoth's node entry (browser remap applies only to the
    // client build), so the node `{buffer}` input shape is used here; the app
    // passes `{arrayBuffer}`, which the browser entry accepts.
    const { convertToHtml } = await import("mammoth");
    const html = (
      await convertToHtml({ buffer: new Uint8Array(await blob.arrayBuffer()) })
    ).value;
    expect(html).toContain("Export Test");
    expect(html).toContain("world");
    expect(html).toContain("item one");
  });

  it("never emits an empty document", async () => {
    const blob = await jsonToDocxBlob({ type: "doc", content: [] });
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(entries["word/document.xml"]).toBeDefined();
  });
});

describe("file import", () => {
  it("parses txt into paragraphs and page breaks", async () => {
    const file = new File(["first\n\nsecond\fthird"], "notes.txt", {
      type: "text/plain",
    });
    const result = await importFile(file);
    expect(result.kind).toBe("json");
    if (result.kind !== "json") return;
    const types = (result.content.content ?? []).map((node) => node.type);
    expect(types).toEqual(["paragraph", "paragraph", "pageBreak", "paragraph"]);
  });

  it("parses markdown into editor JSON", async () => {
    const file = new File(["# H\n\n- a\n"], "notes.md", {
      type: "text/markdown",
    });
    const result = await importFile(file);
    expect(result.kind).toBe("json");
    if (result.kind !== "json") return;
    expect(result.content.content?.[0]?.type).toBe("heading");
  });

  it("rejects unsupported types without touching data", async () => {
    const file = new File(["x"], "photo.png", { type: "image/png" });
    await expect(importFile(file)).rejects.toThrow("Unsupported file type");
  });

  it("derives titles from file names", () => {
    expect(titleForImport("my notes.docx")).toBe("my notes");
    expect(titleForImport("a.md")).toBe("a");
    expect(titleForImport(".md")).toBe("Imported");
  });
});
