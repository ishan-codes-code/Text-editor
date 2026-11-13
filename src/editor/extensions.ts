import type { AnyExtension } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { BulletList } from "@tiptap/extension-bullet-list";
import { CharacterCount } from "@tiptap/extension-character-count";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Color } from "@tiptap/extension-color";
import { Document } from "@tiptap/extension-document";
import { FontFamily } from "@tiptap/extension-font-family";
import { Heading } from "@tiptap/extension-heading";
import { Highlight } from "@tiptap/extension-highlight";
import { History } from "@tiptap/extension-history";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { ListItem } from "@tiptap/extension-list-item";
import { OrderedList } from "@tiptap/extension-ordered-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Text } from "@tiptap/extension-text";
import { TextAlign } from "@tiptap/extension-text-align";
import { FontSize, LineHeight, TextStyle } from "@tiptap/extension-text-style";
import { Underline } from "@tiptap/extension-underline";
import { ImageRef } from "./imageRef";
import { Indent } from "./indent";
import { PageBreak } from "./pageBreak";
import { Search } from "./search";
import { AppShortcuts, type AppShortcutsOptions } from "./shortcuts";

export interface EditorExtensionOptions {
  shortcuts: AppShortcutsOptions;
}

/**
 * The full phase-2 extension set, plus phase-5 extras that stay in the core
 * chunk: the store-backed image node and the find/replace search plugin are
 * small and synchronous. FontSize and LineHeight ship inside
 * `@tiptap/extension-text-style` in v3, so no custom code was needed for them;
 * Indent, PageBreak, ImageRef and Search are the hand-rolled extensions.
 * Tables arrive lazily (see `loadTableExtensions`) to keep the core small.
 */
export function createEditorExtensions(
  options: EditorExtensionOptions,
): AnyExtension[] {
  return [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    Underline,
    Strike,
    Subscript,
    Superscript,
    History,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    BulletList,
    OrderedList,
    ListItem,
    TaskList,
    TaskItem,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TextStyle,
    FontFamily,
    // Official v3 text-style extensions (no custom code needed).
    FontSize,
    LineHeight,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    Blockquote,
    CodeBlock,
    HorizontalRule,
    CharacterCount,
    ImageRef,
    Search,
    Indent,
    PageBreak,
    AppShortcuts.configure(options.shortcuts),
  ];
}
