import type { Editor } from "@tiptap/core";
import { FileText, Moon, RefreshCw, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { PalettePanel } from "./components/CharPalette";
import { DocsPanel } from "./components/DocsSheet";
import { FindBar } from "./components/FindBar";
import { FontPanel } from "./components/FontManager";
import { LinkForm } from "./components/LinkDialog";
import { LAST_CUSTOM_FONT_KEY } from "./components/paletteGlyphs";
import { SettingsPanel } from "./components/SettingsSheet";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import {
  remeasureAfterFontsLoad,
  resolveOpenContent,
  setContentWhenReady,
} from "./editor/applyContent";
import { useTiptapEditor } from "./hooks/useTiptapEditor";
import { useOverlayStore } from "./overlays/store";
import { ensurePersistentStorage, initPwa } from "./pwa";
import { useSessionStore } from "./session/store";
import {
  acquireDocLock,
  addImage,
  backupFileName,
  createBackup,
  createDoc,
  type DocListItem,
  type DocLock,
  deleteDoc,
  deliverBackup,
  duplicateDoc,
  type FontRecord,
  getDoc,
  getSetting,
  listDocs,
  listFonts,
  maybeSnapshot,
  prepareImage,
  recordBackupTime,
  registerStoredFonts,
  restoreBackup,
  SaveQueue,
  type SaveState,
  SETTINGS_KEYS,
  saveDocContent,
  setDocTitleFont,
  setSetting,
} from "./storage";

// The Radix/vaul overlay shells stay out of the core chunk: panels are
// light, but Dialog/Sheet/Drawer mount only when an overlay opens. The
// service worker precaches the chunk so sheets work offline.
const OverlayHost = lazy(() =>
  import("./overlays/OverlayHost").then((module) => ({
    default: module.OverlayHost,
  })),
);

const BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const ZOOM_OPTIONS = ["fit", "0.5", "0.75", "1", "1.25", "1.5", "2"];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function App() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [keepColors, setKeepColors] = useState(false);
  const [fonts, setFonts] = useState<FontRecord[]>([]);
  const [defaultFont, setDefaultFont] = useState("");
  const [findState, setFindState] = useState<{
    open: boolean;
    withReplace: boolean;
  }>({ open: false, withReplace: false });
  const [lastBackup, setLastBackup] = useState<number | null>(null);

  const pwa = useMemo(() => initPwa(), []);
  const autosaveRef = useRef<SaveQueue | null>(null);
  const lockRef = useRef<DocLock | null>(null);
  const loadingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastSnapshotCheckRef = useRef(0);
  const imageFileRef = useRef<HTMLInputElement | null>(null);
  const canvasWrapRef = useRef<HTMLElement | null>(null);

  const refreshFonts = useCallback(async () => {
    setFonts(await listFonts());
  }, []);

  const refreshDocs = useCallback(async () => {
    setDocs(await listDocs());
  }, []);

  const openDoc = useCallback(
    async (id: string) => {
      const editor = editorRef.current;
      if (editor === null || editor.isDestroyed) return;
      const session = useSessionStore.getState();
      session.transition("switching");
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

      try {
        const doc = await getDoc(id);
        if (doc === undefined) {
          editor.setEditable(wasEditable);
          session.transition("ready");
          return;
        }
        const lock = await acquireDocLock(id);
        lockRef.current = lock;
        activeIdRef.current = id;

        // A corrupt stored doc falls back to its newest loadable snapshot
        // (or blank); the editor stays enabled and the failure is reported.
        const { content, recovered } = await resolveOpenContent(id);
        loadingRef.current = true;
        await setContentWhenReady(editor, content);
        editor.setEditable(lock.held);
        loadingRef.current = false;
        if (recovered) {
          session.transition("error", {
            error: "Stored content was corrupt; restored from snapshot.",
          });
          toast("Document recovered", {
            description:
              "The saved copy was unreadable, so the newest snapshot was opened instead.",
          });
          session.transition("ready");
        }

        const autosave = new SaveQueue(
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
        session.setActiveId(id);
        session.transition("ready");
        await setSetting(SETTINGS_KEYS.lastOpenedDoc, id);
        await refreshDocs();
      } catch {
        editor.setEditable(wasEditable);
        session.transition("error", { error: "Could not open the document." });
        toast("Open failed", {
          description: "That document could not be opened. Try again.",
        });
        session.transition("ready");
      }
    },
    [refreshDocs],
  );

  const handleUpdate = useCallback((editor: Editor) => {
    if (loadingRef.current) return;
    // Word counts subscribe via StatusBar's useEditorState selector, so
    // typing never re-renders this tree — only the autosave is scheduled.
    const id = activeIdRef.current;
    if (id === null) return;
    autosaveRef.current?.schedule(
      () => editor.getJSON(),
      () => editor.getText(),
    );
    const now = Date.now();
    if (now - lastSnapshotCheckRef.current > 60_000) {
      lastSnapshotCheckRef.current = now;
      void maybeSnapshot(id, editor.getJSON(), now);
    }
  }, []);

  const openLinkDialog = useCallback(() => {
    const editor = editorRef.current;
    const attrs = editor?.getAttributes("link") as
      | { href?: string }
      | undefined;
    const initialUrl = attrs?.href ?? "";
    useOverlayStore.getState().openOverlay({
      id: "link",
      kind: "dialog",
      title: "Add link",
      description: "Enter the URL for the selected text (Ctrl+K).",
      render: () => (
        <LinkForm
          initialUrl={initialUrl}
          onApply={(url) => void applyLink(url)}
        />
      ),
    });
  }, []);

  const toggleFont = useCallback(async () => {
    const current = editorRef.current;
    if (current === null || current.isDestroyed) return;
    const uploaded = fonts.map((font) => font.family);
    if (uploaded.length === 0) {
      toast("No uploaded fonts", {
        description: "Upload a font (for example Kruti Dev) first.",
      });
      openFontManager();
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

  const { editor, EditorContent } = useTiptapEditor({
    // Mount non-editable: openDoc enables editing once the document is
    // loaded. Otherwise keystrokes typed between mount and setContent
    // would be silently wiped by the load.
    editable: false,
    onUpdate: handleUpdate,
    onOpenLink: openLinkDialog,
    onOpenFind: (withReplace) => setFindState({ open: true, withReplace }),
    onOpenPalette: () => openPalette(),
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
      useSessionStore.getState().transition("loading");
      // Register uploaded fonts BEFORE rendering any document that uses
      // them, so there is no wrong-glyph flash (and offline reloads render).
      await registerStoredFonts();
      if (cancelled) return;
      // Fonts arriving later change glyph metrics: re-measure the layout
      // once they finish so line breaks and cursor geometry settle.
      if (editorRef.current !== null) {
        remeasureAfterFontsLoad(editorRef.current);
      }
      const [
        lastOpened,
        storedZoom,
        storedColors,
        storedBackup,
        storedFonts,
        storedDefaultFont,
      ] = await Promise.all([
        getSetting<string | null>(SETTINGS_KEYS.lastOpenedDoc, null),
        getSetting<string>(SETTINGS_KEYS.zoom, "fit"),
        getSetting<boolean>(SETTINGS_KEYS.keepPastedColors, false),
        getSetting<number | null>(SETTINGS_KEYS.lastBackup, null),
        listFonts(),
        getSetting<string>(SETTINGS_KEYS.defaultFont, ""),
      ]);
      if (cancelled) return;
      setZoom(storedZoom);
      setKeepColors(storedColors);
      setLastBackup(storedBackup);
      setFonts(storedFonts);
      setDefaultFont(storedDefaultFont);
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
    useOverlayStore.getState().closeAllOverlays();
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

  const handleKeepColorsChange = useCallback((value: boolean) => {
    setKeepColors(value);
    void setSetting(SETTINGS_KEYS.keepPastedColors, value);
  }, []);

  const handleDefaultFontChange = useCallback((family: string) => {
    setDefaultFont(family);
    void setSetting(SETTINGS_KEYS.defaultFont, family);
  }, []);

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
    async (file: File, restoreMode: "merge" | "replace") => {
      const editor = editorRef.current;
      const session = useSessionStore.getState();
      session.transition("switching");
      // Exclusive operation: flush pending saves and freeze the surface so
      // no keystroke can land mid-restore.
      await autosaveRef.current?.flush();
      const wasEditable = editor?.isEditable ?? true;
      editor?.setEditable(false);
      try {
        const { report } = await restoreBackup(file, restoreMode, undefined, {
          // The pre-restore backup is delivered BEFORE the wipe, so a
          // failed or regretted restore can always be undone.
          onPreRestoreBackup: async (preRestoreBackup) => {
            await deliverBackup(
              preRestoreBackup,
              `pre-restore-${backupFileName()}`,
            );
          },
        });
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
          description: `${report.docsRestored} docs, ${report.fontsRestored} fonts, ${report.imagesRestored} images (${report.mode}). The previous state was downloaded first.`,
        });
      } catch (error) {
        session.transition("error", {
          error: error instanceof Error ? error.message : "Restore failed.",
        });
        toast("Restore failed", {
          description:
            error instanceof Error
              ? error.message
              : "That file could not be restored.",
        });
        session.transition("ready");
        // The failed restore never touched the editor content: unfreeze it.
        if (editor !== null && !editor.isDestroyed) {
          editor.setEditable(wasEditable);
        }
      }
    },
    [openDoc],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      const session = useSessionStore.getState();
      session.transition("switching");
      // Flush first so the copy includes the latest keystrokes.
      await autosaveRef.current?.flush();
      try {
        await duplicateDoc(id);
        await refreshDocs();
      } finally {
        session.transition("ready");
      }
    },
    [refreshDocs],
  );

  const applyLink = useCallback((url: string) => {
    const current = editorRef.current;
    const href = url.trim();
    if (current !== null) {
      if (href === "") current.chain().focus().unsetLink().run();
      else current.chain().focus().setLink({ href }).run();
    }
    useOverlayStore.getState().closeOverlay("link");
  }, []);

  const openDocs = useCallback(() => {
    useOverlayStore.getState().openOverlay({
      id: "docs",
      kind: "sheet",
      side: "left",
      title: "Documents",
      description: "Create, open, rename, duplicate, delete and search.",
      render: () => (
        <DocsPanel
          activeId={activeIdRef.current}
          onOpen={(id) => {
            useOverlayStore.getState().closeAllOverlays();
            void openDoc(id);
          }}
          onNew={() => void handleNew()}
          onDuplicate={(id) => void handleDuplicate(id)}
          onDelete={(id) => void handleDelete(id)}
          onChanged={() => void refreshDocs()}
        />
      ),
    });
  }, [handleDelete, handleDuplicate, handleNew, openDoc, refreshDocs]);

  const openSettings = useCallback(() => {
    useOverlayStore.getState().openOverlay({
      id: "settings",
      kind: "sheet",
      side: "right",
      title: "Settings",
      description: "Storage, appearance and backup.",
      render: () => (
        <SettingsPanel
          persisted={persisted}
          keepColors={keepColors}
          onKeepColorsChange={handleKeepColorsChange}
          lastBackup={lastBackup}
          onBackup={() => void handleBackup()}
          onRestoreFile={(file, mode) => handleRestoreFile(file, mode)}
        />
      ),
    });
  }, [
    handleBackup,
    handleKeepColorsChange,
    handleRestoreFile,
    keepColors,
    lastBackup,
    persisted,
  ]);

  const openFontManager = useCallback(() => {
    const titleFont =
      docs.find((doc) => doc.id === activeIdRef.current)?.titleFont ?? null;
    useOverlayStore.getState().openOverlay({
      id: "fonts",
      kind: "sheet",
      side: "right",
      title: "Fonts",
      description:
        "Uploaded TTF/OTF fonts work offline. Kruti Dev is added like any other font.",
      render: () => (
        <FontPanel
          defaultFont={defaultFont}
          onDefaultFontChange={handleDefaultFontChange}
          titleFont={titleFont}
          onTitleFontChange={(family) => void handleTitleFontChange(family)}
          onChanged={() => void refreshFonts()}
        />
      ),
    });
  }, [
    defaultFont,
    docs,
    handleDefaultFontChange,
    handleTitleFontChange,
    refreshFonts,
  ]);

  const openPalette = useCallback(() => {
    const activeFamily =
      (
        editorRef.current?.getAttributes("textStyle") as
          | { fontFamily?: string }
          | undefined
      )?.fontFamily ?? null;
    useOverlayStore.getState().openOverlay({
      id: "palette",
      kind: "sheet",
      side: "right",
      title: "Special characters",
      description: "Tap to insert at the cursor.",
      render: () => (
        <PalettePanel
          activeFamily={activeFamily}
          onInsert={(glyph) => handleInsertGlyph(glyph)}
        />
      ),
    });
  }, [handleInsertGlyph]);

  const backupStale =
    lastBackup !== null && Date.now() - lastBackup > BACKUP_STALE_MS;
  const neverBackedUp = lastBackup === null;

  // Fit-to-width (default): scale the A4 canvas to its container, capped at
  // 1 so wide screens never upscale. Fixed percentages skip measuring.
  useEffect(() => {
    if (zoom !== "fit") return;
    const target = canvasWrapRef.current;
    if (target === null) return;
    const measure = () => {
      setFitScale(Math.min(1, target.clientWidth / 794));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [zoom]);
  const zoomFactor = zoom === "fit" ? fitScale : Number(zoom);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground print:h-auto print:overflow-visible">
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
              // "Update now" reloads the page: flush every pending save
              // first so no keystroke is lost to the reload.
              void (async () => {
                await autosaveRef.current?.flush();
                try {
                  await pwa.update();
                } catch {
                  toast("Update failed", {
                    description: "Try again once your edits are saved.",
                  });
                }
              })();
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

      <header className="z-10 shrink-0 border-b bg-background/95 print:hidden">
        <div className="flex items-center gap-2 px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            className="h-11 landscape:lg:hidden"
            aria-label="Documents"
            onClick={() => openDocs()}
          >
            <FileText className="size-4" /> Docs
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
              className="h-11 rounded-md border border-input bg-background px-1 text-sm"
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
              className="size-11"
              aria-label="Open settings"
              onClick={() => openSettings()}
            >
              <Settings />
            </Button>
          </div>
        </div>

        <div className="border-t">
          <div>
            <Toolbar
              editor={editor}
              onOpenLink={openLinkDialog}
              onOpenFind={() =>
                setFindState((state) => ({
                  open: !state.open,
                  withReplace: state.withReplace,
                }))
              }
              onOpenPalette={() => openPalette()}
              onToggleFont={() => void toggleFont()}
              onManageFonts={() => openFontManager()}
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

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Documents panel"
          className="hidden min-h-0 w-72 shrink-0 overflow-y-auto overscroll-contain border-r bg-background px-3 py-4 landscape:lg:block print:hidden"
        >
          <DocsPanel
            activeId={activeId}
            onOpen={(id) => {
              void openDoc(id);
            }}
            onNew={() => void handleNew()}
            onDuplicate={(id) => void handleDuplicate(id)}
            onDelete={(id) => void handleDelete(id)}
            onChanged={() => void refreshDocs()}
          />
        </aside>

        <main
          style={{ scrollbarGutter: "stable" }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/60 px-4 py-6 print:overflow-visible print:bg-white print:p-0"
        >
          <div className="mx-auto w-full max-w-[210mm]">
            <section
              aria-label="Editor"
              ref={canvasWrapRef}
              className="rounded-sm bg-card px-6 py-8 text-card-foreground shadow-sm print:rounded-none print:shadow-none sm:px-10"
              style={{ zoom: zoomFactor } as React.CSSProperties}
            >
              <EditorContent editor={editor} />
            </section>

            <StatusBar
              editor={editor}
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
      </div>

      <Suspense fallback={null}>
        <OverlayHost />
      </Suspense>

      <Toaster />
    </div>
  );
}
