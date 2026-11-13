import type { JSONContent } from "@tiptap/core";
import { markdownToJson, textToJson } from "./formats";

export type ImportResult =
  | { kind: "json"; content: JSONContent }
  | { kind: "html"; html: string };

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/**
 * Import dispatcher (TRD): TXT and Markdown parse directly into editor JSON;
 * DOCX goes through mammoth (lazy chunk, precached) to HTML, which the caller
 * feeds to the editor so the schema + paste policy apply. Font names in the
 * HTML survive only where the family exists in the font store (matched by
 * name); images from DOCX are dropped in v1.
 */
export async function importFile(
  file: File,
  options: { keepColors?: boolean } = {},
): Promise<ImportResult> {
  void options;
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) {
    return { kind: "json", content: textToJson(await file.text()) };
  }
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return { kind: "json", content: markdownToJson(await file.text()) };
  }
  if (name.endsWith(".docx")) {
    const { convertToHtml } = await import("mammoth");
    let html: string;
    try {
      const result = await convertToHtml({
        arrayBuffer: await file.arrayBuffer(),
      });
      html = result.value;
    } catch {
      throw new ImportError("That DOCX file could not be read.");
    }
    if (html.trim() === "")
      throw new ImportError("That DOCX file has no readable text.");
    return { kind: "html", html };
  }
  throw new ImportError("Unsupported file type. Choose TXT, Markdown or DOCX.");
}

/** Document title for an import: file name without its extension. */
export function titleForImport(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  // A leading dot is not an extension separator (".md" has no stem).
  const stem = dot > 0 ? base.slice(0, dot) : dot === 0 ? "" : base;
  return stem.trim() === "" ? "Imported" : stem;
}
