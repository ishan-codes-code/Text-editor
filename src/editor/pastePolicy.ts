/**
 * Paste policy (TRD F17). Keeps basic marks, links, lists, headings and
 * tables; drops font-family/font-size unless the family exists in the font
 * store; strips colors/backgrounds by default (setting). Ctrl+Shift+V pastes
 * plain text natively (the browser only offers text/plain), so no code is
 * needed for that path.
 */
import { quoteFontFamily } from "../lib/fontCss";

export interface PastePolicyOptions {
  /** Families registered in the font store (case-insensitive match). */
  knownFamilies: string[];
  /** When false (default), pasted colors/highlights are stripped. */
  keepColors: boolean;
}

const KEEP_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "sub",
  "sup",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "hr",
  "mark",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
]);

const DROP_TAGS = new Set([
  "script",
  "style",
  "form",
  "input",
  "button",
  "iframe",
  "object",
  "embed",
  "meta",
  "link",
]);

const SAFE_LINK_SCHEMES = ["http://", "https://", "mailto:"];

function normalizeFamily(value: string): string {
  return value.replace(/["']/g, "").trim().toLowerCase();
}

function familyAllowed(raw: string, knownFamilies: Set<string>): string | null {
  // font-family lists fall back left to right; keep the first known one.
  for (const part of raw.split(",")) {
    const family = normalizeFamily(part);
    if (family !== "" && knownFamilies.has(family)) return part.trim();
  }
  return null;
}

/**
 * Sanitizes pasted HTML according to the policy. Pure function over a string
 * so it is unit-testable; the editor wires it as `transformPastedHTML`.
 */
export function sanitizePastedHTML(
  html: string,
  options: PastePolicyOptions,
): string {
  const knownFamilies = new Set(
    options.knownFamilies.map((f) => f.toLowerCase()),
  );
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;

  const scrubAttributes = (el: HTMLElement, keptStyle: string[]): void => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "id" || name === "class") {
        el.removeAttribute(attr.name);
      }
    }
    if (keptStyle.length > 0) el.setAttribute("style", keptStyle.join("; "));
    else el.removeAttribute("style");
  };

  const process = (root: ParentNode): void => {
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (DROP_TAGS.has(tag)) {
        el.remove();
        continue;
      }

      const kept: string[] = [];
      let fontFamily: string | null = null;
      let hasFontSize = false;
      for (const declaration of (el.getAttribute("style") ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part !== "")) {
        const colon = declaration.indexOf(":");
        if (colon === -1) continue;
        const prop = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim();
        if (prop === "font-family") {
          const allowed = familyAllowed(value, knownFamilies);
          if (allowed !== null) {
            fontFamily = allowed;
            // Quote so digit/space names stay valid CSS (same helper as the
            // editor's own rendering); the stored mark keeps the plain name.
            kept.push(`font-family: ${quoteFontFamily(allowed)}`);
          }
        } else if (prop === "font-size") {
          hasFontSize = true;
          kept.push(`font-size: ${value}`);
        } else if (
          prop === "color" ||
          prop === "background" ||
          prop === "background-color"
        ) {
          if (options.keepColors) kept.push(`${prop}: ${value}`);
        } else if (prop === "font-weight" && /bold|700|800|900/.test(value)) {
          kept.push("font-weight: bold");
        } else if (prop === "font-style" && value === "italic") {
          kept.push("font-style: italic");
        } else if (
          prop === "text-decoration" &&
          /underline|line-through/.test(value)
        ) {
          kept.push(`text-decoration: ${value}`);
        }
      }
      // Font-size survives only alongside a known family (TRD F17).
      if (hasFontSize && fontFamily === null) {
        for (let i = kept.length - 1; i >= 0; i--) {
          if (kept[i]?.startsWith("font-size:")) kept.splice(i, 1);
        }
      }

      process(el);

      // Manual page breaks round-trip through our schema; keep the node.
      if (tag === "div" && el.hasAttribute("data-page-break")) {
        scrubAttributes(el, kept);
        continue;
      }

      if (!KEEP_TAGS.has(tag)) {
        // Unwrap spans, divs, fonts and sectioning wrappers: keep the
        // content, drop the wrapper. A known-family span keeps a styled
        // span so the font survives; style-only bold/italic/underline is
        // re-tagged so the mark survives unwrapping.
        const parent = el.parentNode;
        if (parent === null) continue;
        if (tag === "span" || tag === "font") {
          const wraps: string[] = [];
          if (kept.includes("font-weight: bold")) wraps.push("strong");
          if (kept.includes("font-style: italic")) wraps.push("em");
          const decoration = kept.find((d) => d.startsWith("text-decoration:"));
          if (decoration !== undefined) {
            wraps.push(decoration.includes("line-through") ? "s" : "u");
          }
          if (fontFamily !== null && kept.length > 0) {
            const span = document.createElement("span");
            span.setAttribute("style", kept.join("; "));
            while (el.firstChild !== null) span.append(el.firstChild);
            parent.replaceChild(span, el);
            let inner: ParentNode = span;
            for (const name of wraps) {
              const wrapper = document.createElement(name);
              while (inner.firstChild !== null)
                wrapper.append(inner.firstChild);
              inner.append(wrapper);
              inner = wrapper;
            }
            continue;
          }
          if (wraps.length > 0) {
            const outer = document.createElement(wraps[0] as string);
            let inner: HTMLElement = outer;
            for (const name of wraps.slice(1)) {
              const wrapper = document.createElement(name);
              inner.append(wrapper);
              inner = wrapper;
            }
            while (el.firstChild !== null) inner.append(el.firstChild);
            parent.replaceChild(outer, el);
            continue;
          }
        }
        while (el.firstChild !== null) parent.insertBefore(el.firstChild, el);
        el.remove();
        continue;
      }

      if (tag === "a") {
        const href = el.getAttribute("href") ?? "";
        const ok = SAFE_LINK_SCHEMES.some((scheme) =>
          href.toLowerCase().startsWith(scheme),
        );
        if (!ok) el.removeAttribute("href");
      }
      scrubAttributes(el, kept);
    }
  };

  process(fragment);
  const wrap = document.createElement("div");
  wrap.append(fragment.cloneNode(true));
  return wrap.innerHTML;
}
