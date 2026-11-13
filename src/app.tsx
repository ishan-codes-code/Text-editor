import type { Editor } from "@tiptap/core";
import {
  Download,
  FileText,
  Moon,
  RefreshCw,
  Settings,
  Sun,
} from "lucide-preact";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ExportFormat } from "./components/ExportSheet";
import { FindBar } from "./components/FindBar";
import {
  LAST_CUSTOM_FONT_KEY,
  MAX_RECENT_GLYPHS,
  PALETTE_RECENT_KEY,
} from "./components/paletteGlyphs";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { Button } from "./components/ui/button";
import { Toaster, toast } from "./components/ui/sonner";
import { sanitizePastedHTML } from "./editor/pastePolicy";
import { useTiptapEditor } from "./hooks/useTiptapEditor";
import { ensurePersistentStorage, initPwa } from "./pwa";
import {
  Autosave,
  acquireDocLock,
  addFont,
  addImage,
  backupFileName,
  createBackup,
  createDoc,
  type DocListItem,
  type DocLock,
  deleteDoc,
  deleteFont,
  deliverBackup,
  duplicateDoc,
  type FontRecord,
  FontValidationError,
  getDoc,
  getSetting,
  listDocs,
  listFonts,
  maybeSnapshot,
  prepareImage,
  recordBackupTime,
  registerStoredFonts,
  renameDoc,
  restoreBackup,
  type SaveState,
  SETTINGS_KEYS,
  saveDocContent,
  searchDocs,
  setDocTitleFont,
  setSetting,
} from "./storage";

// Heavy Radix dialogs load on demand, never in the core chunk: this also
// keeps Vitest's jsdom run (whose SSR externalizer bypasses the
// preact/compat alias for Radix's CJS deps) from executing Radix trees.
// Behavior is covered by the Playwright suite in real Chromium instead.
const DocsSheet = lazy(() =>
  import("./components/DocsSheet").then((module) => ({
    default: module.DocsSheet,
  })),
);
const SettingsSheet = lazy(() =>
  import("./components/SettingsSheet").then((module) => ({
    default: module.SettingsSheet,
  })),
);
const LinkDialog = lazy(() =>
  import("./components/LinkDialog").then((module) => ({
    default: module.LinkDialog,
  })),
);
const FontManager = lazy(() =>
  import("./components/FontManager").then((module) => ({
    default: module.FontManager,
  })),
);
const CharPalette = lazy(() =>
  import("./components/CharPalette").then((module) => ({
    default: module.CharPalette,
  })),
);
const ExportSheet = lazy(() =>
  import("./components/ExportSheet").then((module) => ({
    default: module.ExportSheet,
  })),
);

const THEME_KEY = "editor:theme";
const BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const ZOOM_OPTIONS = ["fit", "0.5", "0.75", "1", "1.25", "1.5", "2"];

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(currentTheme);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      const initial =
        stored === "light" || stored === "dark"
          ? stored
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      document.documentElement.classList.toggle("dark", initial === "dark");
      setTheme(initial);
    } catch {
      // Storage can throw in private mode; the default theme still applies.
    }
  }, []);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.classList.toggle("dark", next === "dark");
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Ignore; the toggle still works for this session.
        }
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

export function App() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [docQuery, setDocQuery] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
  const [zoom, setZoom] = useState<string>("1");
  const [keepColors, setKeepColors] = useState(false);
  const [fonts, setFonts] = useState<FontRecord[]>([]);
  const [fontError, setFontError] = useState<string | null>(null);
  const [fontManagerOpen, setFontManagerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteRecent, setPaletteRecent] = useState<string[]>([]);
  const [defaultFont, setDefaultFont] = useState("");
  const [findState, setFindState] = useState<{
    open: boolean;
    withReplace: boolean;
  }>({ open: false, withReplace: false });
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);

  const pwa = useMemo(() => initPwa(), []);
  const autosaveRef = useRef<Autosave | null>(null);
  const lockRef = useRef<DocLock | null>(null);
  const loadingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastSnapshotCheckRef = useRef(0);
  const backupFileRef = useRef<HTMLInputElement | null>(null);
  const imageFileRef = useRef<HTMLInputElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const refreshFonts = useCallback(async () => {
    setFonts(await listFonts());
  }, []);

  const refreshDocs = useCallback(async () => {
    const query = docQuery;
    const items =
      query.trim() === "" ? await listDocs() : await searchDocs(query);
    setDocs(items);
  }, [docQuery]);

  const openDoc = useCallback(
    async (id: string) => {
      const editor = editorRef.current;
      if (editor === null) return;
      // Lock the surface while switching: keystrokes typed between the
      // flush and setContent would otherwise be silently wiped by the load.
      const wasEditable = editor.isEditable;
      editor.setEditable(false);
      // Flush + release the previous document first: one transaction per
      // save means a crash here cannot corrupt either document.
      await autosaveRef.current?.flush();
      autosaveRef.current?.dispose();
      autosaveRef.current = null;
      lockRef.current?.release();
      lockRef.current = null;

      const doc = await getDoc(id);
      if (doc === undefined) {
        editor.setEditable(wasEditable);
        return;
      }
      const lock = await acquireDocLock(id);
      lockRef.current = lock;
      activeIdRef.current = id;

      loadingRef.current = true;
      editor.commands.setContent(doc.content);
      editor.setEditable(lock.held);
      loadingRef.current = false;

      const autosave = new Autosave(
        async (json, text) => {
          await saveDocContent(id, json, text);
          setSavedAt(Date.now());
          await refreshDocs();
        },
        { onStateChange: setSaveState },
      );
      autosaveRef.current = autosave;
      setReadOnly(!lock.held);
      setSaveState("saved");
      setActiveId(id);
      setWords(doc.wordCount);
      setChars(editor.getText().length);
      await setSetting(SETTINGS_KEYS.lastOpenedDoc, id);
      await refreshDocs();
    },
    [refreshDocs],
  );

  const recount = useCallback((editor: Editor) => {
    const text = editor.getText();
    const trimmed = text.trim();
    setWords(trimmed === "" ? 0 : trimmed.split(/\s+/).length);
    setChars(text.length);
  }, []);

  const handleUpdate = useCallback(
    (editor: Editor) => {
      if (loadingRef.current) return;
      recount(editor);
      const id = activeIdRef.current;
      if (id === null) return;
      autosaveRef.current?.schedule(editor.getJSON(), editor.getText());
      const now = Date.now();
      if (now - lastSnapshotCheckRef.current > 60_000) {
        lastSnapshotCheckRef.current = now;
        void maybeSnapshot(id, editor.getJSON(), now);
      }
    },
    [recount],
  );

  const openLinkDialog = useCallback(() => {
    const editor = editorRef.current;
    const attrs = editor?.getAttributes("link") as
      | { href?: string }
      | undefined;
    setLinkUrl(attrs?.href ?? "");
    setLinkOpen(true);
  }, []);

  const toggleFont = useCallback(async () => {
    const current = editorRef.current;
    if (current === null || current.isDestroyed) return;
    const uploaded = fonts.map((font) => font.family);
    if (uploaded.length === 0) {
      toast("No uploaded fonts", {
        description: "Upload a font (for example Kruti Dev) first.",
      });
      setFontManagerOpen(true);
      return;
    }
    const attrs = current.getAttributes("textStyle") as {
      fontFamily?: string;
    };
    const currentFamily = attrs.fontFamily ?? "";
    if (currentFamily !== "" && uploaded.includes(currentFamily)) {
      // On a Hindi font: remember it and switch to the default English font.
      await setSetting(LAST_CUSTOM_FONT_KEY, currentFamily);
      if (defaultFont === "") current.chain().focus().unsetFontFamily().run();
      else current.chain().focus().setFontFamily(defaultFont).run();
    } else {
      const lastCustom = await getSetting<string>(
        LAST_CUSTOM_FONT_KEY,
        uploaded[0] as string,
      );
      const target = uploaded.includes(lastCustom)
        ? lastCustom
        : (uploaded[0] as string);
      await setSetting(LAST_CUSTOM_FONT_KEY, target);
      current.chain().focus().setFontFamily(target).run();
    }
  }, [fonts, defaultFont]);

  const handleImageFile = useCallback(async (file: File, atPos?: number) => {
    const docId = activeIdRef.current;
    const current = editorRef.current;
    if (docId === null || current === null || current.isDestroyed) {
      toast("No document open", {
        description: "Open a document before adding images.",
      });
      return;
    }
    try {
      const prepared = await prepareImage(file);
      const record = await addImage(docId, prepared.blob, prepared.mime);
      const node = {
        type: "imageRef",
        attrs: { imageId: record.id },
      } as const;
      if (atPos !== undefined) {
        current.chain().focus().insertContentAt(atPos, node).run();
      } else {
        current.commands.insertImageRef(record.id);
      }
    } catch {
      toast("Image failed", {
        description: "That file could not be added.",
      });
    }
  }, []);

  const { mountRef, editor } = useTiptapEditor({
    // Mount non-editable: openDoc enables editing once the document is
    // loaded. Otherwise keystrokes typed between mount and setContent
    // would be silently wiped by the load.
    editable: false,
    onUpdate: handleUpdate,
    onOpenLink: openLinkDialog,
    onOpenFind: (withReplace) => setFindState({ open: true, withReplace }),
    onOpenPalette: () => setPaletteOpen(true),
    onToggleFont: () => void toggleFont(),
    onImageFile: (file, atPos) => void handleImageFile(file, atPos),
    getKnownFamilies: () => fonts.map((font) => font.family),
    getKeepColors: () => keepColors,
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Boot: ensure at least one document, then open the last-opened one.
  useEffect(() => {
    if (editor === null) return;
    let cancelled = false;
    const boot = async () => {
      // Register uploaded fonts BEFORE rendering any document that uses
      // them, so there is no wrong-glyph flash (and offline reloads render).
      // Load failures used to be silent; name them so the user re-adds the
      // file instead of staring at fallback glyphs.
      const { failed: failedFonts } = await registerStoredFonts();
      if (cancelled) return;
      if (failedFonts.length > 0) {
        toast("Some fonts could not load", {
          description: `${failedFonts.join(", ")} — text in these fonts falls back until the file is re-added.`,
        });
      }
      const [
        lastOpened,
        storedZoom,
        storedColors,
        storedBackup,
        storedFonts,
        storedDefaultFont,
        storedRecent,
      ] = await Promise.all([
        getSetting<string | null>(SETTINGS_KEYS.lastOpenedDoc, null),
        getSetting<string>(SETTINGS_KEYS.zoom, "1"),
        getSetting<boolean>(SETTINGS_KEYS.keepPastedColors, false),
        getSetting<number | null>(SETTINGS_KEYS.lastBackup, null),
        listFonts(),
        getSetting<string>(SETTINGS_KEYS.defaultFont, ""),
        getSetting<string[]>(PALETTE_RECENT_KEY, []),
      ]);
      if (cancelled) return;
      setZoom(storedZoom);
      setKeepColors(storedColors);
      setLastBackup(storedBackup);
      setFonts(storedFonts);
      setDefaultFont(storedDefaultFont);
      setPaletteRecent(storedRecent.slice(0, MAX_RECENT_GLYPHS));
      let items = await listDocs();
      if (items.length === 0) {
        const doc = await createDoc("Untitled");
        items = [
          {
            id: doc.id,
            title: doc.title,
            titleFont: doc.titleFont,
            wordCount: doc.wordCount,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          },
        ];
      }
      setDocs(items);
      const target =
        items.some((item) => item.id === lastOpened) || lastOpened === null
          ? (lastOpened ?? items[0]?.id)
          : (items[0]?.id ?? null);
      if (target !== undefined && target !== null) await openDoc(target);
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [editor, openDoc]);

  // Flush on unmount; release the Web Lock.
  useEffect(
    () => () => {
      void autosaveRef.current?.flush();
      lockRef.current?.release();
    },
    [],
  );

  // Forced saves: blur, hidden tab, pagehide (reload/close). The tab can be
  // killed right after typing, so every path flushes the debounce window.
  useEffect(() => {
    const flush = () => {
      void autosaveRef.current?.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  // Ctrl+S saves now (preventDefault always — never let the browser dialog
  // steal the keystroke) and gives quiet feedback.
  const flushNow = useCallback(async () => {
    await autosaveRef.current?.flush();
    if (activeIdRef.current !== null) {
      toast("Saved", { description: "All changes are stored on this device." });
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        void flushNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushNow]);

  useEffect(
    () =>
      pwa.subscribe((status) => {
        setUpdateAvailable(status.state === "ready" && status.updateAvailable);
      }),
    [pwa],
  );

  useEffect(() => {
    ensurePersistentStorage()
      .then(setPersisted)
      .catch(() => setPersisted(false));
  }, []);

  // visualViewport fallback: the meta tag handles layout resizing; this
  // only scrolls the caret back into view.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.classList.contains("tiptap")) {
        active.scrollIntoView({ block: "nearest" });
      }
    };
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    void refreshDocs();
  }, [refreshDocs]);

  const handleNew = useCallback(async () => {
    const doc = await createDoc("Untitled");
    await refreshDocs();
    await openDoc(doc.id);
    // New documents start in the default font when one is set.
    if (defaultFont !== "" && editorRef.current !== null) {
      editorRef.current.chain().focus().setFontFamily(defaultFont).run();
    }
    setDocsOpen(false);
  }, [openDoc, refreshDocs, defaultFont]);

  const handleDelete = useCallback(
    async (id: string) => {
      const target = docs.find((doc) => doc.id === id);
      if (
        !window.confirm(`Delete "${target?.title ?? "document"}" permanently?`)
      ) {
        return;
      }
      if (id === activeIdRef.current) {
        await autosaveRef.current?.flush();
        autosaveRef.current?.dispose();
        autosaveRef.current = null;
        lockRef.current?.release();
        lockRef.current = null;
        activeIdRef.current = null;
      }
      await deleteDoc(id);
      const items = await listDocs();
      setDocs(items);
      if (items.length === 0) {
        const doc = await createDoc("Untitled");
        await openDoc(doc.id);
      } else if (id === activeId) {
        await openDoc(items[0]?.id as string);
      }
    },
    [activeId, docs, openDoc],
  );

  const handleUploadFont = useCallback(
    async (file: File) => {
      setFontError(null);
      try {
        const record = await addFont(file);
        await refreshFonts();
        await setSetting(LAST_CUSTOM_FONT_KEY, record.family);
        toast("Font added", {
          description: `${record.family} is ready and works offline.`,
        });
      } catch (error) {
        const message =
          error instanceof FontValidationError
            ? error.message
            : "That file could not be added.";
        setFontError(message);
      }
    },
    [refreshFonts],
  );

  const handleDeleteFont = useCallback(
    async (id: string) => {
      await deleteFont(id);
      await refreshFonts();
      toast("Font deleted", {
        description:
          "Existing text keeps the font name and falls back until the font is re-added.",
      });
    },
    [refreshFonts],
  );

  const handleDefaultFontChange = useCallback((family: string) => {
    setDefaultFont(family);
    void setSetting(SETTINGS_KEYS.defaultFont, family);
  }, []);

  const activeTitleFont =
    docs.find((doc) => doc.id === activeId)?.titleFont ?? null;

  const handleTitleFontChange = useCallback(
    async (family: string | null) => {
      const id = activeIdRef.current;
      if (id === null) return;
      await setDocTitleFont(id, family);
      await refreshDocs();
    },
    [refreshDocs],
  );

  const handleInsertGlyph = useCallback((glyph: string) => {
    editorRef.current?.chain().focus().insertContent(glyph).run();
    setPaletteRecent((previous) => {
      const next = [glyph, ...previous.filter((item) => item !== glyph)].slice(
        0,
        MAX_RECENT_GLYPHS,
      );
      void setSetting(PALETTE_RECENT_KEY, next);
      return next;
    });
  }, []);

  const handleBackup = useCallback(async () => {
    try {
      const blob = await createBackup({ includeSnapshots: true });
      const filename = backupFileName();
      await recordBackupTime();
      setLastBackup(Date.now());
      const via = await deliverBackup(blob, filename);
      toast("Backup ready", {
        description:
          via === "share"
            ? "Choose where to save your backup file."
            : "Your backup file is downloading.",
      });
    } catch {
      toast("Backup failed", {
        description: "Try again; your documents are still safe.",
      });
    }
  }, []);

  const handleRestoreFile = useCallback(
    async (file: File) => {
      setRestoring(true);
      try {
        const { report, preRestoreBackup } = await restoreBackup(
          file,
          restoreMode,
        );
        // The automatic pre-restore backup is handed to the user first, so a
        // bad restore never strands them without the previous state.
        const date = new Date().toISOString().slice(0, 10);
        await deliverBackup(preRestoreBackup, `pre-restore-backup-${date}.zip`);
        const items = await listDocs();
        setDocs(items);
        const current =
          items.some((item) => item.id === activeIdRef.current) ||
          activeIdRef.current === null
            ? activeIdRef.current
            : (items[0]?.id ?? null);
        if (current !== null) await openDoc(current);
        else if (items.length > 0) await openDoc(items[0]?.id as string);
        toast("Restore complete", {
          description: `${report.docsRestored} docs, ${report.fontsRestored} fonts, ${report.imagesRestored} images (${report.mode}). Your pre-restore backup was downloaded first.`,
        });
      } catch (error) {
        toast("Restore failed", {
          description:
            error instanceof Error
              ? error.message
              : "That file could not be restored.",
        });
      } finally {
        setRestoring(false);
      }
    },
    [openDoc, restoreMode],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const current = editorRef.current;
      if (
        current === null ||
        current.isDestroyed ||
        activeIdRef.current === null
      ) {
        toast("Nothing to export", {
          description: "Open a document first.",
        });
        return;
      }
      // PDF costs nothing in bundle size: the print stylesheet does the work.
      if (format === "pdf") {
        setExportOpen(false);
        window.print();
        return;
      }
      setExportBusy(format);
      try {
        await autosaveRef.current?.flush();
        const json = current.getJSON();
        const title =
          docs.find((doc) => doc.id === activeIdRef.current)?.title ??
          "document";
        if (format === "txt" || format === "md") {
          const { jsonToMarkdown, jsonToPlainText } = await import(
            "./export/formats"
          );
          const { deliverFile, exportFileName } = await import(
            "./export/deliver"
          );
          const text =
            format === "txt" ? jsonToPlainText(json) : jsonToMarkdown(json);
          const mime = format === "txt" ? "text/plain" : "text/markdown";
          await deliverFile(
            new Blob([text], { type: `${mime};charset=utf-8` }),
            exportFileName(title, format),
            mime,
          );
        } else {
          const { jsonToDocxBlob } = await import("./export/docxExport");
          const { deliverFile, exportFileName } = await import(
            "./export/deliver"
          );
          const blob = await jsonToDocxBlob(json, {
            defaultFont: defaultFont === "" ? undefined : defaultFont,
          });
          await deliverFile(
            blob,
            exportFileName(title, "docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          );
        }
        toast("Export ready", {
          description: "Choose where to save your file.",
        });
      } catch {
        toast("Export failed", {
          description: "Try again; your document is still safe.",
        });
      } finally {
        setExportBusy(null);
      }
    },
    [defaultFont, docs],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      setExportBusy("import");
      try {
        const { importFile, titleForImport } = await import("./export/import");
        const result = await importFile(file);
        const doc = await createDoc(titleForImport(file.name));
        await openDoc(doc.id);
        const current = editorRef.current;
        if (result.kind === "json") {
          current?.commands.setContent(result.content);
        } else {
          // DOCX via mammoth: the paste policy + schema apply, fonts match
          // by name where the family is in the font store.
          current?.commands.setContent(
            sanitizePastedHTML(result.html, {
              knownFamilies: fonts.map((font) => font.family),
              keepColors,
            }),
          );
        }
        await autosaveRef.current?.flush();
        await refreshDocs();
        toast("Import complete", {
          description: `"${doc.title}" was created from ${file.name}.`,
        });
      } catch (error) {
        toast("Import failed", {
          description:
            error instanceof Error
              ? error.message
              : "That file could not be imported.",
        });
      } finally {
        setExportBusy(null);
      }
    },
    [fonts, keepColors, openDoc, refreshDocs],
  );

  const applyLink = useCallback(() => {
    const current = editorRef.current;
    const href = linkUrl.trim();
    if (current !== null) {
      if (href === "") current.chain().focus().unsetLink().run();
      else current.chain().focus().setLink({ href }).run();
    }
    setLinkOpen(false);
  }, [linkUrl]);

  const backupStale =
    lastBackup !== null && Date.now() - lastBackup > BACKUP_STALE_MS;
  const neverBackedUp = lastBackup === null;
  const zoomValue = zoom === "fit" ? undefined : Number(zoom);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {updateAvailable && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground print:hidden"
        >
          <span>Update available.</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
            onClick={() => {
              pwa.update().catch(() => {
                toast("Update failed", {
                  description: "Try again once your edits are saved.",
                });
              });
            }}
          >
            <RefreshCw className="size-4" /> Update now
          </button>
        </div>
      )}
      {(backupStale || neverBackedUp) && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 bg-secondary px-4 py-2 text-sm text-secondary-foreground print:hidden"
        >
          <span>
            {neverBackedUp
              ? "Back up your documents to keep them safe."
              : "No backup for over 7 days — your documents live only on this device."}
          </span>
          <button
            type="button"
            className="font-medium underline underline-offset-4"
            onClick={() => void handleBackup()}
          >
            Back up now
          </button>
        </div>
      )}
      {readOnly && (
        <div
          role="alert"
          className="flex items-center justify-center gap-2 bg-secondary px-4 py-2 text-sm text-secondary-foreground print:hidden"
        >
          <FileText className="size-4" />
          <span>
            Read-only — this document is open in another tab. Close the other
            tab, then reopen here to edit.
          </span>
        </div>
      )}

      <header className="sticky top-0 z-10 border-b bg-background/95 print:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Documents"
            onClick={() => setDocsOpen(true)}
          >
            <FileText className="size-4" /> Docs
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Export or import"
            onClick={() => setExportOpen(true)}
          >
            <Download className="size-4" /> Export
          </Button>
          <h1 className="truncate text-base font-semibold">
            {docs.find((doc) => doc.id === activeId)?.title ??
              "Offline text editor"}
          </h1>
          <div className="ml-auto flex items-center gap-1">
            <label className="sr-only" htmlFor="zoom-select">
              Zoom
            </label>
            <select
              id="zoom-select"
              aria-label="Zoom"
              value={zoom}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setZoom(value);
                void setSetting(SETTINGS_KEYS.zoom, value);
              }}
              className="h-9 rounded-md border border-input bg-background px-1 text-sm"
            >
              {ZOOM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "fit" ? "Fit" : `${Number(option) * 100}%`}
                </option>
              ))}
            </select>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
          </div>
        </div>

        <div className="border-t">
          <div className="mx-auto max-w-3xl">
            <Toolbar
              editor={editor}
              onOpenLink={openLinkDialog}
              onOpenFind={() =>
                setFindState((state) => ({
                  open: !state.open,
                  withReplace: state.withReplace,
                }))
              }
              onOpenPalette={() => setPaletteOpen(true)}
              onToggleFont={() => void toggleFont()}
              onManageFonts={() => setFontManagerOpen(true)}
              onInsertImage={() => imageFileRef.current?.click()}
              onSave={() => void flushNow()}
              saveLabel={
                saveState === "saving"
                  ? "Saving…"
                  : saveState === "dirty"
                    ? "Save*"
                    : saveState === "error"
                      ? "Retry"
                      : "Saved"
              }
              families={fonts.map((font) => font.family)}
            />
            <input
              ref={imageFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Choose image"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file !== undefined) void handleImageFile(file);
              }}
            />
          </div>
        </div>
      </header>

      {findState.open && editor !== null && (
        <FindBar
          editor={editor}
          withReplace={findState.withReplace}
          onClose={() => setFindState((state) => ({ ...state, open: false }))}
        />
      )}

      <main className="bg-muted/60 px-4 py-6 print:bg-white print:p-0">
        <div className="mx-auto w-full max-w-[210mm]">
          <section
            aria-label="Editor"
            className="rounded-sm bg-card px-6 py-8 text-card-foreground shadow-sm print:rounded-none print:shadow-none sm:px-10"
            style={
              zoomValue === undefined
                ? undefined
                : ({ zoom: zoomValue } as React.CSSProperties)
            }
          >
            <div ref={mountRef} />
          </section>

          <StatusBar
            words={words}
            chars={chars}
            saveState={saveState}
            savedAt={savedAt}
            readOnly={readOnly}
          />
          <p data-testid="persist-status" className="sr-only">
            {persisted === null
              ? "Storage: checking…"
              : persisted
                ? "Storage: persistent"
                : "Storage: not persistent"}
          </p>
        </div>
      </main>

      {docsOpen && (
        <Suspense fallback={null}>
          <DocsSheet
            open={docsOpen}
            onOpenChange={setDocsOpen}
            docs={docs}
            activeId={activeId}
            query={docQuery}
            onQueryChange={(value) => void setDocQuery(value)}
            onOpen={(id) => {
              setDocsOpen(false);
              void openDoc(id);
            }}
            onNew={() => void handleNew()}
            onRename={(id, title) => {
              void renameDoc(id, title).then(() => refreshDocs());
            }}
            onDuplicate={(id) => {
              void duplicateDoc(id).then(() => refreshDocs());
            }}
            onDelete={(id) => void handleDelete(id)}
          />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsSheet
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            persisted={persisted}
            keepColors={keepColors}
            onKeepColorsChange={(value) => {
              setKeepColors(value);
              void setSetting(SETTINGS_KEYS.keepPastedColors, value);
            }}
            lastBackup={lastBackup}
            onBackup={() => void handleBackup()}
            onRestoreClick={() => backupFileRef.current?.click()}
            restoring={restoring}
            restoreMode={restoreMode}
            onRestoreModeChange={setRestoreMode}
            backupFileRef={backupFileRef}
            onRestoreFile={(file) => void handleRestoreFile(file)}
          />
        </Suspense>
      )}
      {linkOpen && (
        <Suspense fallback={null}>
          <LinkDialog
            open={linkOpen}
            onOpenChange={setLinkOpen}
            url={linkUrl}
            onUrlChange={setLinkUrl}
            onApply={applyLink}
          />
        </Suspense>
      )}
      {fontManagerOpen && (
        <Suspense fallback={null}>
          <FontManager
            open={fontManagerOpen}
            onOpenChange={setFontManagerOpen}
            fonts={fonts}
            defaultFont={defaultFont}
            onDefaultFontChange={handleDefaultFontChange}
            titleFont={activeTitleFont}
            onTitleFontChange={(family) => void handleTitleFontChange(family)}
            error={fontError}
            onUpload={(file) => void handleUploadFont(file)}
            onDelete={(id) => void handleDeleteFont(id)}
          />
        </Suspense>
      )}
      {paletteOpen && (
        <Suspense fallback={null}>
          <CharPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            activeFamily={
              (
                editor?.getAttributes("textStyle") as
                  | { fontFamily?: string }
                  | undefined
              )?.fontFamily ?? null
            }
            recent={paletteRecent}
            onInsert={handleInsertGlyph}
          />
        </Suspense>
      )}

      {exportOpen && (
        <Suspense fallback={null}>
          <ExportSheet
            open={exportOpen}
            onOpenChange={setExportOpen}
            docTitle={
              docs.find((doc) => doc.id === activeId)?.title ?? "document"
            }
            busy={exportBusy}
            onExport={(format) => void handleExport(format)}
            importFileRef={importFileRef}
            onImportClick={() => importFileRef.current?.click()}
            onImportFile={(file) => void handleImportFile(file)}
          />
        </Suspense>
      )}

      <Toaster />
    </div>
  );
}
