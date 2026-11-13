import { blobToBytes } from "./blob";
import { type EditorDatabase, getDb } from "./db";
import { type FontFormat, type FontRecord, newId, now } from "./types";

/** Upload cap (TRD): larger files are rejected before parsing. */
export const MAX_FONT_BYTES = 5 * 1024 * 1024;

const SFNT_TTF = 0x00010000;
const SFNT_OTTO = 0x4f54544f; // "OTTO" — CFF-flavoured OpenType
const SFNT_TRUE = 0x74727565; // "true" — legacy Mac TrueType

export class FontValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FontValidationError";
  }
}

/** High half of MacRoman (0x80–0xFF) as Unicode code points. */
const MAC_ROMAN_HIGH: number[] = [
  0x00c4, 0x00c5, 0x00c7, 0x00c9, 0x00d1, 0x00d6, 0x00dc, 0x00e1, 0x00e0,
  0x00e2, 0x00e4, 0x00e3, 0x00e5, 0x00e7, 0x00e9, 0x00e8, 0x00ea, 0x00eb,
  0x00ed, 0x00ec, 0x00ee, 0x00ef, 0x00f1, 0x00f3, 0x00f2, 0x00f4, 0x00f6,
  0x00f5, 0x00fa, 0x00f9, 0x00fb, 0x00fc, 0x2020, 0x00b0, 0x00a2, 0x00a3,
  0x00a7, 0x2022, 0x00b6, 0x00df, 0x00ae, 0x00a9, 0x2122, 0x00b4, 0x00a8,
  0x2260, 0x00c6, 0x00d8, 0x221e, 0x00b1, 0x2264, 0x2265, 0x00a5, 0x00b5,
  0x2202, 0x2211, 0x220f, 0x03c0, 0x222b, 0x00aa, 0x00ba, 0x03a9, 0x00e6,
  0x00f8, 0x00bf, 0x00a1, 0x00ac, 0x221a, 0x0192, 0x2248, 0x2206, 0x00ab,
  0x00bb, 0x2026, 0x00a0, 0x00c0, 0x00c3, 0x00d5, 0x0152, 0x0153, 0x2013,
  0x2014, 0x201c, 0x201d, 0x2018, 0x2019, 0x00f7, 0x25ca, 0x00ff, 0x0178,
  0x2044, 0x20ac, 0x2039, 0x203a, 0xfb01, 0xfb02, 0x2021, 0x00b7, 0x201a,
  0x201e, 0x2030, 0x00c2, 0x00ca, 0x00c1, 0x00cb, 0x00c8, 0x00cd, 0x00ce,
  0x00cf, 0x00cc, 0x00d3, 0x00d4, 0xf8ff, 0x00d2, 0x00da, 0x00db, 0x00d9,
  0x0131, 0x02c6, 0x02dc, 0x00af, 0x02d8, 0x02d9, 0x02da, 0x00b8, 0x02dd,
  0x02db, 0x02c7,
];

function decodeMacRoman(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out +=
      byte < 0x80
        ? String.fromCharCode(byte)
        : String.fromCharCode(MAC_ROMAN_HIGH[byte - 0x80] ?? 0xfffd);
  }
  return out;
}

function decodeUTF16BE(bytes: Uint8Array): string {
  // DataView avoids the spread-argument stack limit of String.fromCharCode.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(view.getUint16(i, false));
  }
  return out;
}

interface NameRecord {
  platform: number;
  encoding: number;
  language: number;
  nameID: number;
  bytes: Uint8Array;
}

/**
 * Minimal sfnt `name`-table reader (no full font parser in the bundle).
 * Accepts TrueType (0x00010000, "true") and CFF OpenType ("OTTO") files and
 * returns the family name: nameID 1, falling back to 16 (typographic family).
 * Windows entries win over Macintosh over Unicode, English over others.
 */
export function readFontFamily(data: Uint8Array): string {
  if (data.length < 12) {
    throw new FontValidationError("Not a font file: too short for a header.");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const sfnt = view.getUint32(0, false);
  if (sfnt !== SFNT_TTF && sfnt !== SFNT_OTTO && sfnt !== SFNT_TRUE) {
    throw new FontValidationError("Not a font file: bad sfnt header.");
  }
  const numTables = view.getUint16(4, false);
  let nameOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const entry = 12 + i * 16;
    if (entry + 16 > data.length) break;
    const tag =
      String.fromCharCode(data[entry] ?? 0) +
      String.fromCharCode(data[entry + 1] ?? 0) +
      String.fromCharCode(data[entry + 2] ?? 0) +
      String.fromCharCode(data[entry + 3] ?? 0);
    if (tag === "name") {
      nameOffset = view.getUint32(entry + 8, false);
    }
  }
  if (nameOffset < 0 || nameOffset + 6 > data.length) {
    throw new FontValidationError("Font has no readable name table.");
  }
  const count = view.getUint16(nameOffset + 2, false);
  const stringBase = nameOffset + view.getUint16(nameOffset + 4, false);
  const records: NameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const entry = nameOffset + 6 + i * 12;
    if (entry + 12 > data.length) break;
    const length = view.getUint16(entry + 8, false);
    const offset = view.getUint16(entry + 10, false);
    const start = stringBase + offset;
    if (start + length > data.length) {
      continue;
    }
    records.push({
      platform: view.getUint16(entry, false),
      encoding: view.getUint16(entry + 2, false),
      language: view.getUint16(entry + 4, false),
      nameID: view.getUint16(entry + 6, false),
      bytes: data.subarray(start, start + length),
    });
  }

  const decode = (record: NameRecord): string => {
    if (record.platform === 3 || record.platform === 0) {
      return decodeUTF16BE(record.bytes);
    }
    return decodeMacRoman(record.bytes);
  };
  const rank = (record: NameRecord): number => {
    // Lower is better: Windows English first, then any Windows, then Mac.
    let score = record.platform === 3 ? 0 : record.platform === 1 ? 20 : 40;
    if (record.language === 0x0409) score -= 5;
    return score;
  };

  for (const wantID of [1, 16]) {
    const candidates = records
      .filter((r) => r.nameID === wantID)
      .sort((a, b) => rank(a) - rank(b));
    for (const candidate of candidates) {
      const family = decode(candidate).replace(/\0+$/, "").trim();
      if (family !== "") return family;
    }
  }
  throw new FontValidationError("Font has no family name.");
}

export function sniffFontFormat(data: Uint8Array): FontFormat {
  if (data.length < 4) {
    throw new FontValidationError("Not a font file: too short for a header.");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const sfnt = view.getUint32(0, false);
  if (sfnt === SFNT_OTTO) return "otf";
  if (sfnt === SFNT_TTF || sfnt === SFNT_TRUE) return "ttf";
  throw new FontValidationError("Not a font file: bad sfnt header.");
}

export interface ValidatedFont {
  family: string;
  format: FontFormat;
  bytes: Uint8Array;
}

/** Validates an uploaded file: under 5 MB, valid sfnt header, named family. */
export async function validateFontFile(file: Blob): Promise<ValidatedFont> {
  if (file.size > MAX_FONT_BYTES) {
    throw new FontValidationError(
      `Font is too large (${(file.size / 1024 / 1024).toFixed(1)} MB); the limit is 5 MB.`,
    );
  }
  const bytes = await blobToBytes(file);
  const format = sniffFontFormat(bytes);
  const family = readFontFamily(bytes);
  return { family, format, bytes };
}

export async function addFont(
  file: Blob,
  db: EditorDatabase = getDb(),
): Promise<FontRecord> {
  const { family, format } = await validateFontFile(file);
  const record: FontRecord = {
    id: newId(),
    family,
    format,
    blob: file.slice(0, file.size, format === "otf" ? "font/otf" : "font/ttf"),
    addedAt: now(),
  };
  await db.transaction("rw", db.fonts, async () => {
    await db.fonts.add(record);
  });
  // A file can pass validation yet fail to load on the device (truncated or
  // corrupt tables the name reader tolerates). Never list such a font as
  // usable: remove the stored row and name the font in the error so the UI
  // can toast it. Where the FontFace API is unavailable there is nothing to
  // verify, so the font stays listed as before.
  if (fontFaceAvailable()) {
    const loaded = await registerFontFace(family, record.blob);
    if (!loaded) {
      await db.transaction("rw", db.fonts, async () => {
        await db.fonts.delete(record.id);
      });
      throw new FontValidationError(
        `"${family}" could not be loaded on this device, so it was not added.`,
      );
    }
  }
  return record;
}

export async function listFonts(
  db: EditorDatabase = getDb(),
): Promise<FontRecord[]> {
  // Small single-user library: sort in memory rather than adding an index.
  const fonts = await db.fonts.toArray();
  return fonts.sort((a, b) => a.addedAt - b.addedAt);
}

/**
 * Deletes the stored file. Text keeps its family mark and falls back until
 * the font is re-added — callers must warn the user (the manager dialog does).
 */
export async function deleteFont(
  id: string,
  db: EditorDatabase = getDb(),
): Promise<void> {
  await db.transaction("rw", db.fonts, async () => {
    await db.fonts.delete(id);
  });
}

/**
 * Whether the FontFace API exists here (older WebViews, jsdom tests).
 * Extracted so callers can distinguish "cannot verify" from "load failed".
 */
export function fontFaceAvailable(): boolean {
  const faces = (document as Document & { fonts?: FontFaceSet }).fonts;
  const Face = (window as Window & { FontFace?: typeof FontFace }).FontFace;
  return faces !== undefined && Face !== undefined;
}

/**
 * Registers one font with the document. `FontFace` takes an `ArrayBuffer`
 * source — never a Blob — and `font-display` does not apply to such faces.
 * Returns false instead of throwing: `addFont` turns a load failure into a
 * named error, and startup collects failures for one summary toast.
 */
export async function registerFontFace(
  family: string,
  blob: Blob,
): Promise<boolean> {
  try {
    if (!fontFaceAvailable()) return false;
    const faces = (document as Document & { fonts?: FontFaceSet }).fonts;
    const Face = (window as Window & { FontFace?: typeof FontFace })
      .FontFace as typeof FontFace;
    const buf = await blob.arrayBuffer();
    const face = new Face(family, buf);
    await face.load();
    faces?.add(face);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers every stored font at startup. Await this before rendering a
 * document that uses custom fonts so there is no wrong-glyph flash.
 * Corrupt-but-stored fonts used to fail silently; they are now reported so
 * the UI can toast them by name.
 */
export async function registerStoredFonts(
  db: EditorDatabase = getDb(),
): Promise<{ loaded: string[]; failed: string[] }> {
  const fonts = await listFonts(db);
  const loaded: string[] = [];
  const failed: string[] = [];
  for (const font of fonts) {
    // Skip faces already registered and loaded this session (upload
    // registers immediately, so a reload would otherwise double-add).
    let already = false;
    try {
      const faces = (
        document as unknown as {
          fonts?: { values?: () => Iterable<FontFace> };
        }
      ).fonts;
      if (faces !== undefined && typeof faces.values === "function") {
        for (const face of faces.values()) {
          if (face.family === font.family && face.status === "loaded") {
            already = true;
            break;
          }
        }
      }
    } catch {
      // FontFaceSet enumeration unavailable: fall through and register.
    }
    if (already) {
      loaded.push(font.family);
      continue;
    }
    if (await registerFontFace(font.family, font.blob))
      loaded.push(font.family);
    else failed.push(font.family);
  }
  return { loaded, failed };
}
