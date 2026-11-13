import type { JSONContent } from "@tiptap/core";
// Type-only imports are erased at build time; the runtime `docx` module loads
// lazily inside `jsonToDocxBlob` so the core chunk stays small. The service
// worker precaches the lazy chunk, so export works fully offline.
import type {
  AlignmentType,
  Paragraph as DocxParagraph,
  Table as DocxTable,
} from "docx";
import { inlineSegments } from "./formats";

const TWIPS_PER_INDENT = 720;

type RunStyle = {
  bold: boolean;
  italics: boolean;
  underline: boolean;
  strike: boolean;
  subScript: boolean;
  superScript: boolean;
  font: string | undefined;
  size: number | undefined;
  color: string | undefined;
  link: string | null;
};

function styleOf(node: JSONContent): RunStyle {
  const style: RunStyle = {
    bold: false,
    italics: false,
    underline: false,
    strike: false,
    subScript: false,
    superScript: false,
    font: undefined,
    size: undefined,
    color: undefined,
    link: null,
  };
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        style.bold = true;
        break;
      case "italic":
        style.italics = true;
        break;
      case "underline":
        style.underline = true;
        break;
      case "strike":
        style.strike = true;
        break;
      case "subscript":
        style.subScript = true;
        break;
      case "superscript":
        style.superScript = true;
        break;
      case "link": {
        const href = (mark.attrs as { href?: unknown } | undefined)?.href;
        if (typeof href === "string" && href !== "") style.link = href;
        break;
      }
      case "textStyle": {
        // Font names are written into the file so Word uses them where the
        // font is installed (Kruti Dev must be installed on the reader).
        const attrs = (mark.attrs ?? {}) as {
          fontFamily?: unknown;
          fontSize?: unknown;
          color?: unknown;
        };
        if (typeof attrs.fontFamily === "string" && attrs.fontFamily !== "") {
          style.font = attrs.fontFamily;
        }
        if (typeof attrs.fontSize === "string") {
          const px = Number.parseFloat(attrs.fontSize);
          if (Number.isFinite(px) && px > 0) style.size = Math.round(px * 1.5);
        }
        if (typeof attrs.color === "string") {
          const hex = attrs.color.replace(/^#/, "");
          if (/^[0-9a-fA-F]{6}$/.test(hex)) style.color = hex.toUpperCase();
        }
        break;
      }
      default:
        // highlight and anything unknown: lossy in DOCX v1.
        break;
    }
  }
  return style;
}

/**
 * Editor JSON -> DOCX Blob. Loads the `docx` library on first call (its own
 * precached chunk). v1 limits, documented in the export dialog: images become
 * a placeholder line, ordered lists use typed numbers (Word numbering
 * definitions are out of scope), highlight colors are dropped.
 */
export async function jsonToDocxBlob(
  doc: JSONContent,
  options: { defaultFont?: string } = {},
): Promise<Blob> {
  const {
    AlignmentType: Align,
    BorderStyle,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    Packer,
    PageBreak,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const heading = (
    level: number,
  ): (typeof HeadingLevel)[keyof typeof HeadingLevel] => {
    const levels = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ];
    return levels[
      Math.min(6, Math.max(1, level)) - 1
    ] as (typeof HeadingLevel)[keyof typeof HeadingLevel];
  };

  const alignmentOf = (
    name: unknown,
  ): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined => {
    switch (name) {
      case "left":
        return Align.LEFT;
      case "center":
        return Align.CENTER;
      case "right":
        return Align.RIGHT;
      case "justify":
        return Align.JUSTIFIED;
      default:
        return undefined;
    }
  };

  const runsFor = (
    children: JSONContent[] | undefined,
    forceBold = false,
  ): (
    | InstanceType<typeof TextRun>
    | InstanceType<typeof ExternalHyperlink>
  )[] => {
    const runs: (
      | InstanceType<typeof TextRun>
      | InstanceType<typeof ExternalHyperlink>
    )[] = [];
    for (const child of children ?? []) {
      if (child.type === "hardBreak") {
        runs.push(new TextRun({ break: 1 }));
        continue;
      }
      if (child.type !== "text" || typeof child.text !== "string") continue;
      const style = styleOf(child);
      const runOptions = {
        text: child.text,
        bold: style.bold || forceBold || undefined,
        italics: style.italics || undefined,
        underline: style.underline ? {} : undefined,
        strike: style.strike || undefined,
        subScript: style.subScript || undefined,
        superScript: style.superScript || undefined,
        font: style.font ?? options.defaultFont,
        size: style.size,
        color: style.color,
      };
      if (style.link !== null) {
        runs.push(
          new ExternalHyperlink({
            link: style.link,
            children: [new TextRun({ ...runOptions, style: "Hyperlink" })],
          }),
        );
      } else {
        runs.push(new TextRun(runOptions));
      }
    }
    return runs;
  };

  const inlineText = (children: JSONContent[] | undefined): string =>
    inlineSegments(children)
      .map((segment) => segment.text)
      .join("");

  const paraOptions = (
    node: JSONContent,
  ): {
    alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
    indentLeft: number | undefined;
    line: number | undefined;
  } => {
    const attrs = (node.attrs ?? {}) as {
      textAlign?: unknown;
      indent?: unknown;
      lineHeight?: unknown;
    };
    const indent = typeof attrs.indent === "number" ? attrs.indent : 0;
    const lineHeight =
      typeof attrs.lineHeight === "string"
        ? Number(attrs.lineHeight)
        : Number.NaN;
    return {
      alignment: alignmentOf(attrs.textAlign),
      indentLeft: indent > 0 ? indent * TWIPS_PER_INDENT : undefined,
      line:
        Number.isFinite(lineHeight) && lineHeight > 0
          ? Math.round(lineHeight * 240)
          : undefined,
    };
  };

  const blocks: (DocxParagraph | DocxTable)[] = [];

  const pushBlocks = (
    nodes: JSONContent[] | undefined,
    listLevel: number,
  ): void => {
    for (const node of nodes ?? []) {
      switch (node.type) {
        case "heading": {
          const level = Number(
            (node.attrs as { level?: unknown } | undefined)?.level ?? 1,
          );
          const { alignment, indentLeft, line } = paraOptions(node);
          blocks.push(
            new Paragraph({
              heading: heading(level),
              alignment,
              indent:
                indentLeft === undefined ? undefined : { left: indentLeft },
              spacing: line === undefined ? undefined : { line },
              children: runsFor(node.content),
            }),
          );
          break;
        }
        case "paragraph": {
          const { alignment, indentLeft, line } = paraOptions(node);
          blocks.push(
            new Paragraph({
              alignment,
              indent:
                indentLeft === undefined ? undefined : { left: indentLeft },
              spacing: line === undefined ? undefined : { line },
              children: runsFor(node.content),
            }),
          );
          break;
        }
        case "blockquote": {
          const { line } = paraOptions(node);
          for (const child of node.content ?? []) {
            if (child.type === "paragraph" || child.type === "heading") {
              blocks.push(
                new Paragraph({
                  indent: { left: TWIPS_PER_INDENT },
                  spacing: line === undefined ? undefined : { line },
                  children: runsFor(child.content),
                }),
              );
            } else {
              pushBlocks([child], listLevel);
            }
          }
          break;
        }
        case "codeBlock": {
          for (const lineText of inlineText(node.content).split("\n")) {
            blocks.push(
              new Paragraph({
                children: [new TextRun({ text: lineText, font: "Consolas" })],
              }),
            );
          }
          break;
        }
        case "horizontalRule": {
          blocks.push(
            new Paragraph({
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, space: 1 },
              },
              children: [],
            }),
          );
          break;
        }
        case "pageBreak": {
          blocks.push(new Paragraph({ children: [new PageBreak()] }));
          break;
        }
        case "imageRef": {
          // v1 does not embed image bytes in DOCX; the backup zip is the
          // offline-safe carrier for images.
          blocks.push(
            new Paragraph({
              children: [new TextRun({ text: "[image]", italics: true })],
            }),
          );
          break;
        }
        case "bulletList": {
          for (const item of node.content ?? []) {
            for (const child of item.content ?? []) {
              if (child.type === "paragraph") {
                blocks.push(
                  new Paragraph({
                    bullet: { level: Math.min(9, listLevel) },
                    children: runsFor(child.content),
                  }),
                );
              } else {
                pushBlocks([child], listLevel + 1);
              }
            }
          }
          break;
        }
        case "orderedList": {
          let number = 1;
          for (const item of node.content ?? []) {
            for (const child of item.content ?? []) {
              if (child.type === "paragraph") {
                blocks.push(
                  new Paragraph({
                    indent: { left: (listLevel + 1) * TWIPS_PER_INDENT },
                    children: [
                      new TextRun({ text: `${number}. `, bold: true }),
                      ...runsFor(child.content),
                    ],
                  }),
                );
                number += 1;
              } else {
                pushBlocks([child], listLevel + 1);
              }
            }
          }
          break;
        }
        case "taskList": {
          for (const item of node.content ?? []) {
            const checked =
              (item.attrs as { checked?: unknown } | undefined)?.checked ===
              true;
            for (const child of item.content ?? []) {
              if (child.type === "paragraph") {
                blocks.push(
                  new Paragraph({
                    indent: { left: (listLevel + 1) * TWIPS_PER_INDENT },
                    children: [
                      new TextRun({ text: checked ? "☒ " : "☐ " }),
                      ...runsFor(child.content),
                    ],
                  }),
                );
              } else {
                pushBlocks([child], listLevel + 1);
              }
            }
          }
          break;
        }
        case "table": {
          const rows = node.content ?? [];
          blocks.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: rows.map((row, rowIndex) => {
                const cells = row.content ?? [];
                return new TableRow({
                  children: cells.map((cell) => {
                    const paragraphs: InstanceType<typeof Paragraph>[] = [];
                    for (const child of cell.content ?? []) {
                      if (
                        child.type === "paragraph" ||
                        child.type === "heading"
                      ) {
                        paragraphs.push(
                          new Paragraph({
                            // The first row is the header: bold in Word.
                            children: runsFor(child.content, rowIndex === 0),
                          }),
                        );
                      }
                    }
                    if (paragraphs.length === 0) {
                      paragraphs.push(new Paragraph({ children: [] }));
                    }
                    return new TableCell({ children: paragraphs });
                  }),
                });
              }),
            }),
          );
          break;
        }
        default: {
          // Unknown blocks degrade to their text, never silently dropped.
          const text = inlineText(node.content);
          if (text !== "") {
            blocks.push(new Paragraph({ children: [new TextRun({ text })] }));
          }
          pushBlocks(node.content, listLevel);
          break;
        }
      }
    }
  };

  pushBlocks(doc.content, 0);
  if (blocks.length === 0) {
    blocks.push(new Paragraph({ children: [] }));
  }

  const file = new Document({
    sections: [{ children: blocks }],
  });
  return Packer.toBlob(file);
}
