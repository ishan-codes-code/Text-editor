import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  jsonToMarkdown,
  jsonToPlainText,
  markdownToJson,
  parseInlineMarkdown,
  textToJson,
} from "./formats";

const richDoc: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Title" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " and " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: " plus " },
        {
          type: "text",
          text: "link",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
        { type: "text", text: "." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "one" }] },
          ],
        },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "two" }] },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "first" }] },
          ],
        },
      ],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "done" }] },
          ],
        },
      ],
    },
    { type: "pageBreak" },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "A" }] },
              ],
            },
            {
              type: "tableHeader",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "B" }] },
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
                { type: "paragraph", content: [{ type: "text", text: "1" }] },
              ],
            },
            {
              type: "tableCell",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "2" }] },
              ],
            },
          ],
        },
      ],
    },
    { type: "horizontalRule" },
    {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "quoted" }] },
      ],
    },
    { type: "codeBlock", content: [{ type: "text", text: "const x = 1;" }] },
  ],
};

describe("txt converters", () => {
  it("exports blocks as text with list prefixes and form-feed page breaks", () => {
    const text = jsonToPlainText(richDoc);
    expect(text).toContain("Title");
    expect(text).toContain("Hello bold and italic plus link.");
    expect(text).toContain("- one");
    expect(text).toContain("1. first");
    expect(text).toContain("[x] done");
    expect(text).toContain("\f");
    expect(text).toContain("A\tB");
    expect(text).not.toContain("[image]");
  });

  it("round-trips text through paragraphs and page breaks", () => {
    const text = jsonToPlainText(richDoc);
    const back = textToJson(text);
    // Structure survives: heading degrades to a paragraph, lists stay as lines.
    expect(jsonToPlainText(back)).toBe(text);
    const types = (back.content ?? []).map((node) => node.type);
    expect(types).toContain("pageBreak");
  });

  it("maps form feeds to page breaks and blank-line groups to paragraphs", () => {
    const doc = textToJson("first para\n\nsecond para\fthird");
    expect(doc.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
      "pageBreak",
      "paragraph",
    ]);
  });

  it("never returns an empty doc", () => {
    expect(textToJson("   \n  ").content).toHaveLength(1);
  });
});

describe("markdown converters", () => {
  it("exports headings, marks, lists, tables, breaks and code", () => {
    const md = jsonToMarkdown(richDoc);
    expect(md).toContain("## Title");
    expect(md).toContain(
      "Hello **bold** and *italic* plus [link](https://example.com).",
    );
    expect(md).toContain("- one");
    expect(md).toContain("1. first");
    expect(md).toContain("- [x] done");
    expect(md).toContain('<div data-page-break=""></div>');
    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("> quoted");
    expect(md).toContain("const x = 1;");
  });

  it("round-trips markdown losslessly for the supported subset", () => {
    const md = jsonToMarkdown(richDoc);
    const back = markdownToJson(md);
    expect(jsonToMarkdown(back)).toBe(md);
  });

  it("parses nested inline marks and links", () => {
    const nodes = parseInlineMarkdown("**bold and *both*** and `code`");
    const texts = nodes.map((node) => node.text).join("|");
    expect(texts).toContain("bold and ");
    expect(texts).toContain("both");
    const both = nodes.find((node) => node.text === "both");
    expect(both?.marks?.map((mark) => mark.type).sort()).toEqual([
      "bold",
      "italic",
    ]);
    expect(nodes.find((node) => node.text === "code")?.marks).toMatchObject([
      { type: "code" },
    ]);
  });

  it("imports headings, quotes, code, tables and task lists", () => {
    const doc = markdownToJson(
      "# H\n\n> q\n\n- [ ] todo\n\n| A |\n| --- |\n| 1 |\n",
    );
    const types = (doc.content ?? []).map((node) => node.type);
    expect(types).toEqual(["heading", "blockquote", "taskList", "table"]);
  });

  it("degrades unknown constructs to paragraphs instead of dropping text", () => {
    const doc = markdownToJson("just some text");
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(jsonToPlainText(doc)).toContain("just some text");
  });
});
