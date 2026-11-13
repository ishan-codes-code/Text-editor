/**
 * Single quoting helper for `font-family` CSS.
 *
 * A bare family name is only valid CSS when it parses as identifiers
 * (`font-family: Kruti Dev` works, `font-family: Kruti Dev 010` does not —
 * a bare `010` is not an identifier, so the browser drops the whole
 * declaration and the text silently renders in the fallback font). Quoting
 * every name is always valid, so every render site uses this one helper.
 */

/** Strips one layer of surrounding quotes (no unescaping — quoting re-escapes). */
function stripOuterQuotes(family: string): string {
  const match = /^(['"])(.*)\1$/.exec(family);
  return match !== null ? (match[2] ?? family) : family;
}

/** `"Family Name"` — escaped and always quoted, safe for any name. */
export function quoteFontFamily(family: string): string {
  const unquoted = stripOuterQuotes(family.trim());
  return `"${unquoted.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** `"Family Name", <fallback>` for inline-style previews and titles. */
export function fontFamilyWithFallback(
  family: string,
  fallback = "sans-serif",
): string {
  return `${quoteFontFamily(family)}, ${fallback}`;
}
