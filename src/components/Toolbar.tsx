import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Columns3,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Languages,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo,
  Rows3,
  Save,
  Scissors,
  Search,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Trash2,
  Underline,
  Undo,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

interface ToolbarSnapshot {
  canUndo: boolean;
  canRedo: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  subscript: boolean;
  superscript: boolean;
  block: "p" | "h1" | "h2" | "h3";
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  align: "left" | "center" | "right" | "justify" | "";
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  link: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  table: boolean;
  canAddRow: boolean;
  canAddColumn: boolean;
  canDeleteTable: boolean;
}

const EMPTY_TOOLBAR: ToolbarSnapshot = {
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  subscript: false,
  superscript: false,
  block: "p",
  fontFamily: "",
  fontSize: "",
  lineHeight: "",
  align: "",
  bulletList: false,
  orderedList: false,
  taskList: false,
  link: false,
  blockquote: false,
  codeBlock: false,
  table: false,
  canAddRow: false,
  canAddColumn: false,
  canDeleteTable: false,
};

function selectToolbar(ctx: { editor: Editor | null }): ToolbarSnapshot {
  const { editor } = ctx;
  if (editor === null) return EMPTY_TOOLBAR;
  const textStyle = editor.getAttributes("textStyle") as {
    fontSize?: string;
    lineHeight?: string;
    fontFamily?: string;
  };
  return {
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    subscript: editor.isActive("subscript"),
    superscript: editor.isActive("superscript"),
    block: editor.isActive("heading", { level: 1 })
      ? "h1"
      : editor.isActive("heading", { level: 2 })
        ? "h2"
        : editor.isActive("heading", { level: 3 })
          ? "h3"
          : "p",
    fontFamily: textStyle.fontFamily ?? "",
    fontSize: textStyle.fontSize ?? "",
    lineHeight: textStyle.lineHeight ?? "",
    align: editor.isActive({ textAlign: "center" })
      ? "center"
      : editor.isActive({ textAlign: "right" })
        ? "right"
        : editor.isActive({ textAlign: "justify" })
          ? "justify"
          : editor.isActive({ textAlign: "left" })
            ? "left"
            : "",
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    taskList: editor.isActive("taskList"),
    link: editor.isActive("link"),
    blockquote: editor.isActive("blockquote"),
    codeBlock: editor.isActive("codeBlock"),
    table: editor.isActive("table"),
    canAddRow: editor.can().addRowAfter(),
    canAddColumn: editor.can().addColumnAfter(),
    canDeleteTable: editor.can().deleteTable(),
  };
}

export interface ToolbarProps {
  editor: Editor | null;
  onOpenLink: () => void;
  onOpenFind: () => void;
  onOpenPalette: () => void;
  onToggleFont: () => void;
  onManageFonts: () => void;
  onInsertImage: () => void;
  onSave: () => void;
  saveLabel: string;
  /** Uploaded font families for the font dropdown. */
  families: string[];
}

const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32"];
const LINE_HEIGHTS = ["1", "1.15", "1.5", "2"];

function ToolButton({
  label,
  title,
  active,
  disabled,
  onPress,
  children,
}: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant={active === true ? "secondary" : "ghost"}
      size="icon"
      className="size-11 shrink-0"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </Button>
  );
}

function Separator() {
  return <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />;
}

export function Toolbar({
  editor,
  onOpenLink,
  onOpenFind,
  onOpenPalette,
  onToggleFont,
  onManageFonts,
  onInsertImage,
  onSave,
  saveLabel,
  families,
}: ToolbarProps) {
  // Selector subscription: typing re-renders only this toolbar, never the
  // whole app tree. The snapshot is deep-compared, so unchanged state does
  // not re-render even though the selector builds a fresh object.
  const ui =
    useEditorState({ editor, selector: selectToolbar }) ?? EMPTY_TOOLBAR;
  if (editor === null) return null;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex items-center gap-0.5 overflow-x-auto px-4 py-1.5"
    >
      <ToolButton
        label="Undo (Ctrl+Z)"
        title="Undo (Ctrl+Z)"
        disabled={!ui.canUndo}
        onPress={() => editor.chain().focus().undo().run()}
      >
        <Undo />
      </ToolButton>
      <ToolButton
        label="Redo (Ctrl+Y)"
        title="Redo (Ctrl+Y)"
        disabled={!ui.canRedo}
        onPress={() => editor.chain().focus().redo().run()}
      >
        <Redo />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Bold (Ctrl+B)"
        title="Bold (Ctrl+B)"
        active={ui.bold}
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label="Italic (Ctrl+I)"
        title="Italic (Ctrl+I)"
        active={ui.italic}
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <ToolButton
        label="Underline (Ctrl+U)"
        title="Underline (Ctrl+U)"
        active={ui.underline}
        onPress={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolButton>
      <ToolButton
        label="Strikethrough (Alt+Shift+5)"
        title="Strikethrough (Alt+Shift+5)"
        active={ui.strike}
        onPress={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolButton>
      <ToolButton
        label="Subscript"
        title="Subscript"
        active={ui.subscript}
        onPress={() => editor.chain().focus().toggleSubscript().run()}
      >
        <Subscript />
      </ToolButton>
      <ToolButton
        label="Superscript"
        title="Superscript"
        active={ui.superscript}
        onPress={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <Superscript />
      </ToolButton>
      <ToolButton
        label="Clear formatting"
        title="Clear formatting"
        onPress={() =>
          editor.chain().focus().clearNodes().unsetAllMarks().run()
        }
      >
        <Scissors />
      </ToolButton>
      <Separator />
      <label className="sr-only" htmlFor="toolbar-block">
        Block style
      </label>
      <select
        id="toolbar-block"
        aria-label="Block style"
        className="h-11 rounded-md border border-input bg-background px-1 text-sm"
        value={ui.block}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "p") editor.chain().focus().setParagraph().run();
          else
            editor
              .chain()
              .focus()
              .toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
              .run();
        }}
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <label className="sr-only" htmlFor="toolbar-font">
        Font family
      </label>
      <select
        id="toolbar-font"
        aria-label="Font family"
        className="h-11 max-w-36 rounded-md border border-input bg-background px-1 text-sm"
        value={ui.fontFamily}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "") editor.chain().focus().unsetFontFamily().run();
          else if (value === "@manage") onManageFonts();
          else editor.chain().focus().setFontFamily(value).run();
        }}
      >
        <option value="">Font</option>
        <option value="Serif">Serif</option>
        <option value="Monospace">Monospace</option>
        {families.map((family) => (
          <option key={family} value={family}>
            {family}
          </option>
        ))}
        <option value="@manage">Manage fonts…</option>
      </select>
      <Button
        variant="outline"
        size="sm"
        aria-label="Toggle Hindi/English font (Ctrl+Shift+K)"
        title="Toggle Hindi/English font (Ctrl+Shift+K)"
        onClick={onToggleFont}
        className="shrink-0"
      >
        A/अ
      </Button>
      <label className="sr-only" htmlFor="toolbar-size">
        Font size
      </label>
      <select
        id="toolbar-size"
        aria-label="Font size"
        className="h-11 rounded-md border border-input bg-background px-1 text-sm"
        value={ui.fontSize.replace("px", "")}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "") editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(`${value}px`).run();
        }}
      >
        <option value="">Size</option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="toolbar-line-height">
        Line spacing
      </label>
      <select
        id="toolbar-line-height"
        aria-label="Line spacing"
        className="h-11 rounded-md border border-input bg-background px-1 text-sm"
        value={ui.lineHeight}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "") editor.chain().focus().unsetLineHeight().run();
          else editor.chain().focus().setLineHeight(value).run();
        }}
      >
        <option value="">Spacing</option>
        {LINE_HEIGHTS.map((height) => (
          <option key={height} value={height}>
            {height}
          </option>
        ))}
      </select>
      <label
        aria-label="Text color"
        title="Text color"
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
      >
        <span aria-hidden="true" className="font-bold text-sm">
          A
        </span>
        <input
          type="color"
          className="sr-only"
          aria-label="Text color picker"
          onChange={(event) =>
            editor.chain().focus().setColor(event.currentTarget.value).run()
          }
        />
      </label>
      <label
        aria-label="Highlight color"
        title="Highlight color"
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
      >
        <Highlighter className="size-4" />
        <input
          type="color"
          className="sr-only"
          aria-label="Highlight color picker"
          onChange={(event) =>
            editor
              .chain()
              .focus()
              .toggleHighlight({ color: event.currentTarget.value })
              .run()
          }
        />
      </label>
      <Separator />
      <ToolButton
        label="Align left (Ctrl+Shift+L)"
        title="Align left (Ctrl+Shift+L)"
        active={ui.align === "left"}
        onPress={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft />
      </ToolButton>
      <ToolButton
        label="Align center (Ctrl+Shift+E)"
        title="Align center (Ctrl+Shift+E)"
        active={ui.align === "center"}
        onPress={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter />
      </ToolButton>
      <ToolButton
        label="Align right (Ctrl+Shift+R)"
        title="Align right (Ctrl+Shift+R)"
        active={ui.align === "right"}
        onPress={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight />
      </ToolButton>
      <ToolButton
        label="Justify (Ctrl+Shift+J)"
        title="Justify (Ctrl+Shift+J)"
        active={ui.align === "justify"}
        onPress={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Bullet list (Ctrl+Shift+8)"
        title="Bullet list (Ctrl+Shift+8)"
        active={ui.bulletList}
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolButton>
      <ToolButton
        label="Numbered list (Ctrl+Shift+7)"
        title="Numbered list (Ctrl+Shift+7)"
        active={ui.orderedList}
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolButton>
      <ToolButton
        label="Checklist (Ctrl+Shift+9)"
        title="Checklist (Ctrl+Shift+9)"
        active={ui.taskList}
        onPress={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks />
      </ToolButton>
      <ToolButton
        label="Decrease indent"
        title="Decrease indent (Ctrl+[)"
        onPress={() => editor.chain().focus().outdent().run()}
      >
        <IndentDecrease />
      </ToolButton>
      <ToolButton
        label="Increase indent"
        title="Increase indent (Ctrl+])"
        onPress={() => editor.chain().focus().indent().run()}
      >
        <IndentIncrease />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Link (Ctrl+K)"
        title="Link (Ctrl+K)"
        active={ui.link}
        onPress={onOpenLink}
      >
        <LinkIcon />
      </ToolButton>
      <ToolButton
        label="Blockquote"
        title="Blockquote"
        active={ui.blockquote}
        onPress={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </ToolButton>
      <ToolButton
        label="Code block"
        title="Code block"
        active={ui.codeBlock}
        onPress={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code />
      </ToolButton>
      <ToolButton
        label="Horizontal rule"
        title="Horizontal rule"
        onPress={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus />
      </ToolButton>
      <ToolButton
        label="Page break (Ctrl+Enter)"
        title="Page break (Ctrl+Enter)"
        onPress={() => editor.chain().focus().insertPageBreak().run()}
      >
        <Pilcrow />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Insert table (3x3)"
        title="Insert table (3x3)"
        active={ui.table}
        onPress={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <Table />
      </ToolButton>
      <ToolButton
        label="Add row below"
        title="Add row below"
        disabled={!ui.canAddRow}
        onPress={() => editor.chain().focus().addRowAfter().run()}
      >
        <Rows3 />
      </ToolButton>
      <ToolButton
        label="Add column after"
        title="Add column after"
        disabled={!ui.canAddColumn}
        onPress={() => editor.chain().focus().addColumnAfter().run()}
      >
        <Columns3 />
      </ToolButton>
      <ToolButton
        label="Delete table"
        title="Delete table"
        disabled={!ui.canDeleteTable}
        onPress={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 />
      </ToolButton>
      <ToolButton
        label="Insert image"
        title="Insert image (resized to 1600 px, stored offline)"
        onPress={onInsertImage}
      >
        <ImagePlus />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Find and replace (Ctrl+F)"
        title="Find and replace (Ctrl+F)"
        onPress={onOpenFind}
      >
        <Search />
      </ToolButton>
      <ToolButton
        label="Special characters"
        title="Special characters (Ctrl+Shift+P)"
        onPress={onOpenPalette}
      >
        <Languages />
      </ToolButton>
      <Separator />
      <Button
        variant="outline"
        size="sm"
        aria-label={`Save (${saveLabel})`}
        title="Save now (Ctrl+S)"
        onClick={onSave}
        className="ml-1 h-11 shrink-0"
      >
        <Save className="size-4" /> {saveLabel}
      </Button>
    </div>
  );
}
