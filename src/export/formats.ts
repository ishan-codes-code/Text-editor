import type { JSONContent } from "@tiptap/core";

/**
 * Pure document converters (core chunk, no heavy deps).
 *
 * TXT is plain text: Kruti Dev exports as raw Latin characters (known limit).
 * Markdown is lossy for fonts, sizes and colors (TRD): marks outside the
 * basic set are dropped, underline round-trips as `__text__`, page breaks as
 * a raw `<div data-page-break="">` line (preserved by the paste policy).
 */

export interface InlineSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link: string | null;
}

interface BlockMarkState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link: string | null;
}

function markState(marks: JSONContent["marks"]): BlockMarkState {
  const state: BlockMarkState = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
    link: null,
  };
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        state.bold = true;
        break;
      case "italic":
        state.italic = true;
        break;
      case "underline":
        state.underline = true;
        break;
      case "strike":
        state.strike = true;
        break;
      case "code":
        state.code = true;
        break;
      case "link": {
        const href = (mark.attrs as { href?: unknown } | undefined)?.href;
        if (typeof href === "string" && href !== "") state.link = href;
        break;
      }
      default:
        // subscript, superscript, textStyle (font/size/color), highlight:
        // lossy in TXT/Markdown by design (TRD).
        break;
    }
  }
  return state;
}

/** Inline nodes (text + marks) flattened into segments. */
export function inlineSegments(content: JSONContent[] | undefined): InlineSegment[] {
  const out: InlineSegment[] = [];
  for (const node of content ?? []) {
    if (node.type === "hardBreak") {
      out.push({
        text: "\n",
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        code: false,
        link: null,
      });
      continue;
    }
    if (node.type !== "text" || typeof node.text !== "string") continue;
    const marks = markState(node.marks);
    out.push({ text: node.text, ...marks });
  }
  return out;
}

export function plainTextOf(content: JSONContent[] | undefined): string {
  let out = "";
  for (const node of content ?? []) {
    if (node.type === "hardBreak") {
      out += "\n";
      continue;
    }
    if (node.type === "text" && typeof node.text === "string") {
      out += node.text;
      continue;
    }
    // Block wrappers (paragraphs in table cells, nested lists): recurse so
    // tables and quotes degrade to their text instead of empty strings.
    out += plainTextOf(node.content);
  }
  return out;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_~[\]])/g, "\\$1");
}

function segmentsToMarkdown(segments: InlineSegment[]): string {
  let out = "";
  for (const segment of segments) {
    if (segment.text === "\n") {
      out += "  \n";
      continue;
    }
    if (segment.code) {
      out += `\`${segment.text}\``;
      continue;
    }
    let open = "";
    let close = "";
    if (segment.bold) {
      open += "**";
      close = `**${close}`;
    }
    if (segment.italic) {
      open += "*";
      close = `*${close}`;
    }
    if (segment.underline) {
      open += "__";
      close = `__${close}`;
    }
    if (segment.strike) {
      open += "~~";
      close = `~~${close}`;
    }
    const body = `${open}${escapeMarkdown(segment.text)}${close}`;
    out += segment.link !== null ? `[${body}](${segment.link})` : body;
  }
  return out;
}

function tableToMarkdown(node: JSONContent): string[] {
  const rows = node.content ?? [];
  const lines: string[] = [];
  rows.forEach((row, index) => {
    const cells = (row.content ?? []).map((cell) =>
      plainTextOf(cell.content).replace(/\|/g, "\\|").replace(/\n/g, " "),
    );
    lines.push(`| ${cells.join(" | ")} |`);
    if (index === 0) lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
  });
  return lines;
}

function blockToMarkdown(node: JSONContent, lines: string[]): void {
  switch (node.type) {
    case "heading": {
      const level = Math.min(
        6,
        Math.max(1, Number((node.attrs as { level?: unknown } | undefined)?.level ?? 1)),
      );
      lines.push(`${"#".repeat(level)} ${segmentsToMarkdown(inlineSegments(node.content))}`);
      return;
    }
    case "paragraph": {
      lines.push(segmentsToMarkdown(inlineSegments(node.content)));
      return;
    }
    case "blockquote": {
      for (const child of node.content ?? []) {
        const inner: string[] = [];
        blockToMarkdown(child, inner);
        for (const line of inner) lines.push(line === "" ? ">" : `> ${line}`);
      }
      return;
    }
    case "codeBlock": {
      lines.push("```", plainTextOf(node.content), "```");
      return;
    }
    case "horizontalRule": {
      lines.push("---");
      return;
    }
    case "pageBreak": {
      // Raw HTML line: survives our Markdown import and the paste policy.
      lines.push('<div data-page-break=""></div>');
      return;
    }
    case "imageRef": {
      const id = (node.attrs as { imageId?: unknown } | undefined)?.imageId;
      lines.push(typeof id === "string" && id !== "" ? `![image](image:${id})` : "![image]()");
      return;
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const ordered = node.type === "orderedList";
      let number = 1;
      for (const item of node.content ?? []) {
        const prefix =
          node.type === "taskList"
            ? `- [${(item.attrs as { checked?: unknown } | undefined)?.checked === true ? "x" : " "}] `
            : ordered
              ? `${number}. `
              : "- ";
        if (ordered) number += 1;
        const itemLines: string[] = [];
        for (const child of item.content ?? []) {
          if (child.type === "paragraph") {
            itemLines.push(segmentsToMarkdown(inlineSegments(child.content)));
          } else {
            // Nested list: indent two spaces per level.
            const nested: string[] = [];
            blockToMarkdown(child, nested);
            for (const line of nested) itemLines.push(`  ${line}`);
          }
        }
        const first = itemLines.shift() ?? "";
        lines.push(`${prefix}${first}`);
        for (const rest of itemLines) lines.push(`  ${rest}`);
      }
      return;
    }
    case "table": {
      for (const line of tableToMarkdown(node)) lines.push(line);
      return;
    }
    default: {
      // Unknown/custom blocks degrade to their text (never silently dropped).
      const text = plainTextOf(node.content);
      if (text !== "") lines.push(text);
      for (const child of node.content ?? []) {
        if (child.content !== undefined) blockToMarkdown(child, lines);
      }
    }
  }
}

/** Editor JSON -> Markdown (lossy for fonts/colors, by design). */
export function jsonToMarkdown(doc: JSONContent): string {
  const lines: string[] = [];
  for (const node of doc.content ?? []) blockToMarkdown(node, lines);
  // Collapse 3+ blank runs to the canonical one blank line between blocks.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function blockToPlainText(node: JSONContent, lines: string[]): void {
  switch (node.type) {
    case "heading":
    case "paragraph": {
      lines.push(plainTextOf(node.content));
      return;
    }
    case "blockquote": {
      for (const child of node.content ?? []) blockToPlainText(child, lines);
      return;
    }
    case "codeBlock": {
      lines.push(plainTextOf(node.content));
      return;
    }
    case "horizontalRule": {
      lines.push("---");
      return;
    }
    case "pageBreak": {
      lines.push("\f");
      return;
    }
    case "imageRef": {
      lines.push("[image]");
      return;
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      let number = 1;
      for (const item of node.content ?? []) {
        const prefix =
          node.type === "taskList"
            ? (item.attrs as { checked?: unknown } | undefined)?.checked === true
              ? "[x] "
              : "[ ] "
            : node.type === "orderedList"
              ? `${number}. `
              : "- ";
        if (node.type === "orderedList") number += 1;
        for (const child of item.content ?? []) {
          if (child.type === "paragraph") {
            lines.push(`${prefix}${plainTextOf(child.content)}`);
          } else {
            blockToPlainText(child, lines);
          }
        }
      }
      return;
    }
    case "table": {
      for (const row of node.content ?? []) {
        const cells = (row.content ?? []).map((cell) => plainTextOf(cell.content));
        lines.push(cells.join("\t"));
      }
      return;
    }
    default: {
      const text = plainTextOf(node.content);
      if (text !== "") lines.push(text);
      for (const child of node.content ?? []) {
        if (child.content !== undefined) blockToPlainText(child, lines);
      }
    }
  }
}

/** Editor JSON -> plain text. */
export function jsonToPlainText(doc: JSONContent): string {
  const lines: string[] = [];
  for (const node of doc.content ?? []) blockToPlainText(node, lines);
  return `${lines.join("\n\n").trim()}\n`;
}

// ---- Import: text/markdown -> editor JSON ----

function textNode(text: string, marks: JSONContent["marks"] = undefined): JSONContent {
  return marks === undefined || marks.length === 0
    ? { type: "text", text }
    : { type: "text", text, marks };
}

interface InlineMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** Parses `**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `` `code` ``, `[text](href)`. */
export function parseInlineMarkdown(source: string): JSONContent[] {
  const out: JSONContent[] = [];
  const stack: InlineMark[] = [];
  let buffer = "";
  const flush = (): void => {
    if (buffer === "") return;
    const marks: JSONContent["marks"] = stack.map((mark) =>
      mark.attrs === undefined ? { type: mark.type } : { type: mark.type, attrs: mark.attrs },
    );
    out.push(textNode(buffer, marks.length === 0 ? undefined : marks));
    buffer = "";
  };
  const toggle = (type: string): void => {
    const index = stack.map((mark) => mark.type).lastIndexOf(type);
    if (index === -1) stack.push({ type });
    else stack.splice(index, 1);
  };

  let i = 0;
  while (i < source.length) {
    // Escaped punctuation stays literal.
    if (source[i] === "\\" && i + 1 < source.length) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }
    // Inline code runs to the next backtick; nothing nests inside.
    if (source[i] === "`") {
      const end = source.indexOf("`", i + 1);
      if (end === -1) {
        buffer += "`";
        i += 1;
        continue;
      }
      flush();
      const marks: JSONContent["marks"] = stack.map((mark) =>
        mark.attrs === undefined ? { type: mark.type } : { type: mark.type, attrs: mark.attrs },
      );
      marks.push({ type: "code" });
      out.push(textNode(source.slice(i + 1, end), marks));
      i = end + 1;
      continue;
    }
    // Links [text](href).
    if (source[i] === "[") {
      const closeText = source.indexOf("]", i + 1);
      const openHref = closeText === -1 ? -1 : source.indexOf("(", closeText + 1);
      const closeHref = openHref === -1 ? -1 : source.indexOf(")", openHref + 1);
      if (closeText !== -1 && openHref === closeText + 1 && closeHref !== -1) {
        flush();
        stack.push({ type: "link", attrs: { href: source.slice(openHref + 1, closeHref) } });
        const inner = parseInlineMarkdown(source.slice(i + 1, closeText));
        stack.pop();
        // Re-mark inner nodes with the link (inner parser ran without it).
        for (const node of inner) {
          const marks = [...(node.marks ?? []), { type: "link", attrs: { href: source.slice(openHref + 1, closeHref) } }];
          out.push(textNode(node.text ?? "", marks));
        }
        i = closeHref + 1;
        continue;
      }
      buffer += "[";
      i += 1;
      continue;
    }
    const three = source.slice(i, i + 3);
    const two = source.slice(i, i + 2);
    if (three === "***" || three === "___") {
      flush();
      toggle("bold");
      toggle("italic");
      i += 3;
      continue;
    }
    if (two === "**") {
      flush();
      toggle("bold");
      i += 2;
      continue;
    }
    if (two === "__") {
      flush();
      toggle("underline");
      i += 2;
      continue;
    }
    if (two === "~~") {
      flush();
      toggle("strike");
      i += 2;
      continue;
    }
    if (source[i] === "*" || source[i] === "_") {
      flush();
      toggle("italic");
      i += 1;
      continue;
    }
    if (source[i] === "~") {
      buffer += "~";
      i += 1;
      continue;
    }
    buffer += source[i];
    i += 1;
  }
  flush();
  return out;
}

function paragraphNode(source: string): JSONContent {
  const content = parseInlineMarkdown(source);
  return { type: "paragraph", content };
}

interface ListFrame {
  node: JSONContent;
  indent: number;
}

function pushListItem(
  stack: ListFrame[],
  top: JSONContent[],
  kind: "bulletList" | "orderedList" | "taskList",
  indent: number,
  item: JSONContent,
): void {
  while (stack.length > 0 && (stack[stack.length - 1] as ListFrame).indent > indent) {
    stack.pop();
  }
  const parent = stack.length === 0 ? null : (stack[stack.length - 1] as ListFrame);
  // A different list kind at the same level starts a sibling list; without
  // this, `- a` followed by `1. b` would nest the ordered list inside the
  // bullet item and break round-trips.
  if (parent !== null && parent.indent === indent && parent.node.type !== kind) {
    stack.pop();
  }
  const target = stack.length === 0 ? null : (stack[stack.length - 1] as ListFrame);
  if (
    target !== null &&
    target.node.type === kind &&
    target.indent === indent
  ) {
    (target.node.content as JSONContent[]).push(item);
    return;
  }
  const list: JSONContent = { type: kind, content: [item] };
  if (target === null) {
    top.push(list);
  } else {
    // Nested: attach to the last item of the parent list.
    const siblings = target.node.content as JSONContent[];
    const last = siblings[siblings.length - 1] as JSONContent;
    (last.content as JSONContent[]).push(list);
  }
  stack.push({ node: list, indent });
}

function isTableSeparator(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, "").split("|");
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Markdown -> editor JSON. Foreign/unknown constructs degrade to paragraphs. */
export function markdownToJson(markdown: string): JSONContent {
  const top: JSONContent[] = [];
  const listStack: ListFrame[] = [];
  const closeLists = (): void => {
    listStack.length = 0;
  };

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    closeLists();
    top.push(paragraphNode(paragraph.join(" ").trim()));
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as string;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        top.push({ type: "codeBlock", content: [{ type: "text", text: codeLines.join("\n") }] });
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        closeLists();
        inCode = true;
      }
      index += 1;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      index += 1;
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      index += 1;
      continue;
    }
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      flushParagraph();
      closeLists();
      top.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }
    if (trimmed === '<div data-page-break=""></div>' || trimmed === "<div data-page-break></div>") {
      flushParagraph();
      closeLists();
      top.push({ type: "pageBreak" });
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading !== null) {
      flushParagraph();
      closeLists();
      top.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: parseInlineMarkdown(heading[2]),
      });
      index += 1;
      continue;
    }
    // Pipe table: header row + separator row, then body rows.
    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1] as string)
    ) {
      flushParagraph();
      closeLists();
      const headerCells = splitTableRow(trimmed);
      const rows: JSONContent[] = [
        {
          type: "tableRow",
          content: headerCells.map((cell) => ({
            type: "tableHeader",
            content: [paragraphNode(cell)],
          })),
        },
      ];
      index += 2;
      while (index < lines.length && (lines[index] as string).includes("|")) {
        rows.push({
          type: "tableRow",
          content: splitTableRow(lines[index] as string).map((cell) => ({
            type: "tableCell",
            content: [paragraphNode(cell)],
          })),
        });
        index += 1;
      }
      top.push({ type: "table", content: rows });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote !== null) {
      flushParagraph();
      closeLists();
      const inner = markdownToJson(quote[1]);
      top.push({ type: "blockquote", content: inner.content ?? [paragraphNode(quote[1])] });
      index += 1;
      continue;
    }
    const task = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task !== null) {
      flushParagraph();
      const indent = Math.floor(task[1].length / 2);
      pushListItem(listStack, top, "taskList", indent, {
        type: "taskItem",
        attrs: { checked: task[2].toLowerCase() === "x" },
        content: [paragraphNode(task[3])],
      });
      index += 1;
      continue;
    }
    const ordered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (ordered !== null) {
      flushParagraph();
      const indent = Math.floor(ordered[1].length / 2);
      pushListItem(listStack, top, "orderedList", indent, {
        type: "listItem",
        content: [paragraphNode(ordered[2])],
      });
      index += 1;
      continue;
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet !== null) {
      flushParagraph();
      const indent = Math.floor(bullet[1].length / 2);
      pushListItem(listStack, top, "bulletList", indent, {
        type: "listItem",
        content: [paragraphNode(bullet[2])],
      });
      index += 1;
      continue;
    }
    // Image placeholder from our own export.
    const image = /^!\[image\]\(image:(.*)\)$/.exec(trimmed);
    if (image !== null) {
      flushParagraph();
      closeLists();
      top.push({ type: "imageRef", attrs: { imageId: image[1] } });
      index += 1;
      continue;
    }
    // Continuation of a paragraph block.
    paragraph.push(trimmed);
    index += 1;
  }
  flushParagraph();

  if (top.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };
  return { type: "doc", content: top };
}

/** Plain text -> editor JSON. Blank-line groups are paragraphs, `\f` is a page break. */
export function textToJson(text: string): JSONContent {
  const content: JSONContent[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const chunks = normalized.split("\f");
  chunks.forEach((chunk, chunkIndex) => {
    const groups = chunk.split(/\n\s*\n/);
    for (const group of groups) {
      const merged = group
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .join(" ");
      if (merged !== "")
        content.push({ type: "paragraph", content: [{ type: "text", text: merged }] });
    }
    if (chunkIndex < chunks.length - 1) content.push({ type: "pageBreak" });
  });
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}
