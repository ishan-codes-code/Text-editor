import type { Editor } from "@tiptap/core";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo,
  Save,
  Scissors,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo,
} from "lucide-preact";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

function useEditorTick(editor: Editor | null): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (editor === null) return;
    const bump = () => {
      setTick((tick) => tick + 1);
    };
    editor.on("transaction", bump);
    return () => {
      editor.off("transaction", bump);
    };
  }, [editor]);
}

export interface ToolbarProps {
  editor: Editor | null;
  onOpenLink: () => void;
  onSave: () => void;
  saveLabel: string;
}

const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32"];
const LINE_HEIGHTS = ["1", "1.15", "1.5", "2"];
const SYSTEM_FONTS = ["", "System default", "Serif", "Monospace"];

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
  children: preact.ComponentChildren;
}) {
  return (
    <Button
      variant={active === true ? "secondary" : "ghost"}
      size="icon"
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
  onSave,
  saveLabel,
}: ToolbarProps) {
  useEditorTick(editor);
  if (editor === null) return null;
  const textStyle = editor.getAttributes("textStyle") as {
    fontSize?: string;
    lineHeight?: string;
    fontFamily?: string;
  };
  const currentBlock = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex items-center gap-0.5 overflow-x-auto px-4 py-1.5"
    >
      <ToolButton
        label="Undo (Ctrl+Z)"
        title="Undo (Ctrl+Z)"
        disabled={!editor.can().undo()}
        onPress={() => editor.chain().focus().undo().run()}
      >
        <Undo />
      </ToolButton>
      <ToolButton
        label="Redo (Ctrl+Y)"
        title="Redo (Ctrl+Y)"
        disabled={!editor.can().redo()}
        onPress={() => editor.chain().focus().redo().run()}
      >
        <Redo />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Bold (Ctrl+B)"
        title="Bold (Ctrl+B)"
        active={editor.isActive("bold")}
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label="Italic (Ctrl+I)"
        title="Italic (Ctrl+I)"
        active={editor.isActive("italic")}
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <ToolButton
        label="Underline (Ctrl+U)"
        title="Underline (Ctrl+U)"
        active={editor.isActive("underline")}
        onPress={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolButton>
      <ToolButton
        label="Strikethrough (Alt+Shift+5)"
        title="Strikethrough (Alt+Shift+5)"
        active={editor.isActive("strike")}
        onPress={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolButton>
      <ToolButton
        label="Subscript"
        title="Subscript"
        active={editor.isActive("subscript")}
        onPress={() => editor.chain().focus().toggleSubscript().run()}
      >
        <Subscript />
      </ToolButton>
      <ToolButton
        label="Superscript"
        title="Superscript"
        active={editor.isActive("superscript")}
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
        className="h-9 rounded-md border border-input bg-background px-1 text-sm"
        value={currentBlock}
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
        className="h-9 rounded-md border border-input bg-background px-1 text-sm"
        value={textStyle.fontFamily ?? ""}
        onChange={(event) => {
          const value = event.currentTarget.value;
          // Phase 4 populates uploaded families; system fonts pass through.
          if (value === "") editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(value).run();
        }}
      >
        {SYSTEM_FONTS.map((font) => (
          <option key={font} value={font === "System default" ? "" : font}>
            {font === "" ? "Font" : font}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="toolbar-size">
        Font size
      </label>
      <select
        id="toolbar-size"
        aria-label="Font size"
        className="h-9 rounded-md border border-input bg-background px-1 text-sm"
        value={(textStyle.fontSize ?? "").replace("px", "")}
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
        className="h-9 rounded-md border border-input bg-background px-1 text-sm"
        value={textStyle.lineHeight ?? ""}
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
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
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
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
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
        active={editor.isActive({ textAlign: "left" })}
        onPress={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft />
      </ToolButton>
      <ToolButton
        label="Align center (Ctrl+Shift+E)"
        title="Align center (Ctrl+Shift+E)"
        active={editor.isActive({ textAlign: "center" })}
        onPress={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter />
      </ToolButton>
      <ToolButton
        label="Align right (Ctrl+Shift+R)"
        title="Align right (Ctrl+Shift+R)"
        active={editor.isActive({ textAlign: "right" })}
        onPress={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight />
      </ToolButton>
      <ToolButton
        label="Justify (Ctrl+Shift+J)"
        title="Justify (Ctrl+Shift+J)"
        active={editor.isActive({ textAlign: "justify" })}
        onPress={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Bullet list (Ctrl+Shift+8)"
        title="Bullet list (Ctrl+Shift+8)"
        active={editor.isActive("bulletList")}
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolButton>
      <ToolButton
        label="Numbered list (Ctrl+Shift+7)"
        title="Numbered list (Ctrl+Shift+7)"
        active={editor.isActive("orderedList")}
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolButton>
      <ToolButton
        label="Checklist (Ctrl+Shift+9)"
        title="Checklist (Ctrl+Shift+9)"
        active={editor.isActive("taskList")}
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
        active={editor.isActive("link")}
        onPress={onOpenLink}
      >
        <LinkIcon />
      </ToolButton>
      <ToolButton
        label="Blockquote"
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onPress={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </ToolButton>
      <ToolButton
        label="Code block"
        title="Code block"
        active={editor.isActive("codeBlock")}
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
      <Button
        variant="outline"
        size="sm"
        aria-label={`Save (${saveLabel})`}
        title="Save now (Ctrl+S)"
        onClick={onSave}
        className="ml-1 shrink-0"
      >
        <Save className="size-4" /> {saveLabel}
      </Button>
    </div>
  );
}
