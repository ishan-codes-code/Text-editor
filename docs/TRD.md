# TRD: Offline PWA Text Editor (v1.1)

Nov 13, 2026 · @Ishan · supersedes v1 (Nov 12, 2026)

## Changelog v1 to v1.1

Changes are marked **[v1.1]** inline. Summary:

| #   | Change                                                                                  | Why                                                                            |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | All lazy chunks (Table, DOCX, mammoth, import) are precached after install              | v1 lazy-loaded them but did not cache them, so export failed offline           |
| 2   | `FontFace` is fed an `ArrayBuffer`, not a Blob; `font-display` note removed             | `FontFace` does not accept a Blob; descriptor does not apply to buffer sources |
| 3   | Character palette (F14) raised from Should to Must                                      | Alt+numpad codes do not exist on Android                                       |
| 4   | Backup is a `.zip` (binary fonts and images), not one base64 JSON                       | Base64 adds ~33% and can exhaust memory on mobile                              |
| 5   | Editor input attributes for Kruti Dev text (no autocorrect, spellcheck, autocapitalize) | Gboard can rewrite Latin-keystroke text                                        |
| 6   | Adaptive autosave, multi-tab lock, prompted SW updates, `persist()` result check        | Typing latency, data integrity                                                 |
| 7   | UI layer: shadcn/ui on Preact via `preact/compat`, Tailwind, lucide icons               | Ship faster; see UI layer section                                              |
| 8   | Tiptap used framework-agnostic (`@tiptap/core`), Tiptap 3 package layout                | No React wrapper needed with Preact                                            |
| 9   | Shortcut fixes, missing custom extensions listed, paste policy defined                  | Gaps found in review                                                           |
| 10  | Dev tooling and test strategy added; minimal backup moved to phase 3                    | Data loss is the top risk                                                      |
| 11  | Core JS budget proposed at 300 KB gzipped (was 250), measured in CI                     | Tiptap alone is ~100+ KB gzipped; see Goals. **Needs your confirmation**       |

## Overview

A lightweight, offline-first rich-text editor, built as a PWA for personal use on Android with a physical keyboard. Its defining feature is first-class support for non-Unicode Hindi fonts such as Kruti Dev, plus user-uploaded TTF fonts.

**Goals**

- Works fully offline after first load; installs to the Android home screen
- Small bundle: core JS under **300 KB gzipped** **[v1.1: was 250]**, enforced by `size-limit` in CI; editor extensions loaded only as needed; **all** chunks precached after install so nothing needs the network later
- Kruti Dev and any uploaded TTF/OTF font render correctly and persist offline
- Docs-style editing: formatting, lists, tables, images, find and replace, keyboard shortcuts
- Export to PDF, DOCX and TXT; full backup and restore

**Non-goals (v1)**

- Real-time collaboration, sharing, permissions, accounts
- Cloud sync, Play Store listing
- True page-by-page pagination (v1 uses a continuous page-width canvas with manual page breaks)
- On-screen Kruti Dev keyboard (typing is via physical keyboard)

**Constraints**

- Single user, single device; data lives in the browser, so backup is essential
- Target: Chrome on Android; desktop Chrome and Edge as secondary
- The Kruti Dev font is commercial: never committed to the repo, never bundled; the user supplies it

## Requirements

**Functional**

| ID  | Requirement                                                                                        | Priority |
| --- | -------------------------------------------------------------------------------------------------- | -------- |
| F1  | Create, open, rename, duplicate, delete documents; document list with search                       | Must     |
| F2  | Inline formatting: bold, italic, underline, strike, sub/superscript, text color, highlight         | Must     |
| F3  | Block formatting: headings 1-6, paragraph, alignment, line spacing, indent, blockquote, code block | Must     |
| F4  | Lists: bullet, numbered, checklist                                                                 | Must     |
| F5  | Font family and size control; custom TTF/OTF upload; Kruti Dev uploaded by user                    | Must     |
| F6  | Autosave on every change; undo/redo history                                                        | Must     |
| F7  | Full offline use after first load; installable PWA                                                 | Must     |
| F8  | Export to PDF, DOCX, TXT; import TXT, Markdown, DOCX                                               | Must     |
| F9  | Backup and restore of all documents and fonts as one file                                          | Must     |
| F10 | Hardware keyboard shortcuts matching Docs (Ctrl+B/I/U/Z/Y/F/S/K)                                   | Must     |
| F11 | Find and replace, word and character count                                                         | Should   |
| F12 | Tables, images, links, horizontal rule, manual page break                                          | Should   |
| F13 | Dark mode; page-width and zoom controls                                                            | Should   |
| F14 | Special-character palette for Kruti Dev symbols **[v1.1: Must]**                                   | Must     |
| F15 | Kruti Dev to Unicode converter                                                                     | Could    |
| F16 | Android share-sheet integration                                                                    | Could    |
| F17 | **[v1.1]** Paste policy: keep basic marks, drop foreign fonts/sizes; Ctrl+Shift+V pastes plain     | Must     |
| F18 | **[v1.1]** Single-editor lock: a doc open in another tab is read-only                              | Should   |

**Non-functional**

| Area           | Target                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Startup        | Interactive in under 1.5 s on a mid-range Android phone, cached                                   |
| Typing latency | Under 50 ms per keystroke on documents up to 50,000 words                                         |
| Bundle         | Under 300 KB gzipped core JS; export/import/table chunks lazy but precached                       |
| Offline        | Zero network requests required after install, including export, import and tables                 |
| Durability     | Request persistent storage and report the result; save within 500 ms of last edit for normal docs |
| Privacy        | No telemetry; no data leaves the device                                                           |

## Architecture and tech stack

A client-only PWA: no backend, no accounts. Everything runs in the browser and is stored on the device. The editor reads and writes IndexedDB; fonts and exports draw on the same stored data, and the service worker serves the whole app offline.

| Layer                      | Choice                                                                      | Why                                                                                |
| -------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| UI framework               | Preact + Vite + TypeScript (strict)                                         | About 4 KB runtime, fast builds, React-compatible                                  |
| Component layer **[v1.1]** | shadcn/ui components (copied in) on `preact/compat`, Tailwind, lucide icons | Fastest way to a polished, accessible toolbar/dialog/menu set; agents know it well |
| Editor engine              | Tiptap 3 **core** (`@tiptap/core`, ProseMirror), no React wrapper           | Framework-agnostic; thin Preact hook mounts the editor                             |
| Styling                    | Tailwind CSS (purged)                                                       | Small CSS output, fast iteration                                                   |
| Local database             | Dexie (IndexedDB)                                                           | Simple API for docs, fonts and images as Blobs                                     |
| Offline                    | vite-plugin-pwa (Workbox), prompt update mode                               | Precache every chunk, install prompt, safe update flow                             |
| Fonts                      | `FontFace` API with `ArrayBuffer` source                                    | Registers uploaded TTF/OTF at runtime, offline-safe                                |
| Export                     | Print CSS for PDF; `docx` and `mammoth.js` lazy-loaded and precached        | PDF costs nothing in bundle size                                                   |
| Backup **[v1.1]**          | `fflate` zip; `valibot` for schema validation                               | ~8 KB zip; tiny validator instead of zod                                           |
| Hosting                    | Any static host (GitHub Pages, Netlify, Cloudflare Pages)                   | HTTPS required for service workers                                                 |

The editor can be swapped later because documents are stored as editor JSON behind a small storage module.

## UI layer **[v1.1]**

Screens: document list, editor with toolbar, settings, font manager, backup/restore, find bar, character palette.

- **shadcn/ui** is copy-in source, not a package, so only components used are bundled. Radix primitives run on Preact through the `preact/compat` alias (`react` and `react-dom` aliased in `vite.config.ts` and `tsconfig` paths). Verify each component on a real device; if one misbehaves (portals, focus trap, refs), replace it with a native alternative rather than debugging Radix.
- Use: Button, Toggle/ToggleGroup, DropdownMenu, Popover, Dialog, Sheet (mobile drawers), Command (font picker, doc search), Tabs, Switch, Slider, Sonner toasts. Skip Tooltip on touch.
- Native fallbacks: `<dialog>`, the Popover API and CSS anchor positioning are available in current Chrome and can replace Radix for simple popovers and menus at zero JS cost.
- Do not depend on unofficial shadcn-for-Preact ports; use the standard CLI with aliases.
- Icons: import individual lucide icons only (tree-shaken inline SVG).
- Theming: shadcn CSS variables drive light and dark mode (F13).
- Lazy-load heavy dialogs (font manager, backup, table tools, palette) with dynamic `import()`.

## Data model and offline storage

All data lives in IndexedDB, accessed through Dexie. The service worker precaches the full build output (shell, core editor chunk and lazy chunks) so the app opens and every feature works with no network.

| Store     | Key fields                                                                   | Notes                                                                                                |
| --------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| docs      | id, title, titleFont, content (editor JSON), wordCount, createdAt, updatedAt | JSON, not HTML, so it round-trips losslessly; `titleFont` lets titles render in Kruti Dev **[v1.1]** |
| snapshots | id, docId, content, savedAt                                                  | Last 10 per document, every 5 minutes of editing; skipped for unchanged content                      |
| fonts     | id, family, format, blob, addedAt                                            | Uploaded TTF/OTF stored as Blob                                                                      |
| images    | id, docId, blob, mime                                                        | Doc JSON references image by id; resized to max 1600 px, re-encoded as WebP on insert                |
| settings  | key, value                                                                   | Theme, default font, default size, zoom, last-opened doc, last backup time                           |

**Save behavior**

- Debounced autosave 400 ms after the last keystroke, plus forced save on blur and `visibilitychange` **[v1.1]** For large docs (about 20,000+ words) lengthen the debounce, serialize inside `requestIdleCallback`, and keep the forced saves, so `getJSON()` cannot break the typing-latency target
- Writes are single transactions, so a crash cannot leave a half-saved document
- Call `navigator.storage.persist()` on first run and **check the returned value**; Chrome grants it heuristically (for example to installed PWAs), not via a prompt. Show the status in settings, and nudge the user to install the PWA and back up if it is `false` **[v1.1]**
- **Multi-tab lock [v1.1]:** take a Web Lock per document id; a second tab opens the doc read-only with a banner
- Show a quiet saved indicator in the toolbar

**Service worker updates [v1.1]**

Use prompt mode: when a new version is ready, show "Update available" and apply it only on user tap or when the editor is saved and idle. Never reload mid-edit.

## Font system: custom TTF and Kruti Dev

Kruti Dev is not Unicode. It maps ordinary Latin keystrokes to Devanagari glyphs inside the font file, so with a physical keyboard the font alone does the work: select Kruti Dev, type, and Hindi appears. The editor needs no input method; it needs reliable font loading, hostile-input protection against the Android keyboard, and clean handling of special characters.

**Loading fonts [v1.1: corrected]**

1. User picks a TTF or OTF file through a file input
2. App validates it: size under 5 MB, valid sfnt header, family name read with a minimal `name`-table reader (do not ship a full font parser in the core bundle; lazy-load one only if needed)
3. Store the Blob in the fonts store
4. On startup, for each stored font: `const buf = await blob.arrayBuffer(); const face = new FontFace(family, buf); await face.load(); document.fonts.add(face);` Await all fonts before first render of a document that uses them, so no wrong-glyph flash occurs (`font-display` does not apply to buffer-sourced faces)
5. The font appears in the dropdown immediately and works offline
6. Kruti Dev is added the same way; the user supplies the file (commercial, not bundled, never committed)

**Input attributes for Kruti Dev text [v1.1]**

Set `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="none"` (and `autocomplete="off"`) on the editable element. Test with Gboard and a hardware keyboard that no autocorrect, auto-capitalization or suggestion replaces Latin keystrokes.

**Mixed Hindi and English**

- Font is a text mark, so Kruti Dev and English fonts can mix in one line
- Shortcut to toggle the selection or typing position between the last-used Kruti Dev font and the default English font
- Setting to make a font the default for new documents

**Special characters (F14, Must)**

- Some Kruti Dev glyphs (half-letters, symbols such as `¼`, `ñ`) need Shift/Alt combinations; Alt+numpad codes are not available on Android
- The palette lists all needed glyphs rendered in the active font; tap to insert at the cursor; recently used row; reachable by shortcut

**Known limits**

- Copying Kruti Dev text into apps without the font shows Latin gibberish; the optional converter (F15) addresses this later
- DOCX files render correctly only where the font is installed; PDF export embeds the font and is always safe
- Doc list and search operate on raw text, so Kruti Dev titles are meaningless without `titleFont`

## Editor features and keyboard shortcuts

The editor is built on Tiptap 3 core with only the extensions in use. Tiptap 3 consolidated several extensions into shared packages (for example list, table, text-style) and ships ESM/CJS only: have the agent check names and exports against the installed version instead of assuming v2 names (for example the undo/redo extension and where Underline and Link live).

| Feature                                            | Shortcut                                 | Extension                                                |
| -------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Bold, italic, underline                            | Ctrl+B, I, U                             | StarterKit (check v3 contents)                           |
| Strikethrough                                      | Alt+Shift+5 (Docs-compatible) **[v1.1]** | StarterKit                                               |
| Undo, redo                                         | Ctrl+Z, Ctrl+Y                           | Undo/redo extension                                      |
| Headings 1-3                                       | Ctrl+Alt+1, 2, 3                         | StarterKit                                               |
| Bullet, numbered list                              | Ctrl+Shift+8, 7                          | List extensions                                          |
| Checklist                                          | Ctrl+Shift+9                             | TaskList                                                 |
| Align left, center, right, justify                 | Ctrl+Shift+L, E, R, J                    | TextAlign                                                |
| Link                                               | Ctrl+K                                   | Link                                                     |
| Find and replace                                   | Ctrl+F, Ctrl+H                           | Custom search plugin                                     |
| Save/backup/export                                 | Ctrl+S                                   | App command (`preventDefault`)                           |
| Plain paste                                        | Ctrl+Shift+V                             | Native; paste handler **[v1.1]**                         |
| Font family, size, color, highlight                | Toolbar                                  | TextStyle, FontFamily, custom FontSize, Color, Highlight |
| Line spacing, indent **[v1.1]**                    | Toolbar                                  | Custom LineHeight, Indent extensions                     |
| Subscript, superscript **[v1.1]**                  | Toolbar                                  | Subscript, Superscript                                   |
| Blockquote, code block, horizontal rule **[v1.1]** | Toolbar                                  | StarterKit                                               |
| Table                                              | Toolbar                                  | Table (lazy, precached)                                  |
| Image                                              | Toolbar, paste, drag                     | Custom image node backed by the images store             |
| Page break                                         | Ctrl+Enter                               | Custom node                                              |

Browser-reserved shortcuts (Ctrl+N/T/W) cannot be overridden; avoid them. Always `preventDefault` for Ctrl+S, F and H.

**Paste policy (F17) [v1.1]**

Keep bold, italic, underline, links, lists, headings and tables. Drop font-family and font-size from pasted content unless the family exists in the font store. Strip colors/backgrounds by default (setting to keep). Ctrl+Shift+V always pastes plain text.

**Layout**

- Page canvas: A4 width on a gray background, with zoom control and a mobile-fit mode
- Page breaks are manual in v1; the print stylesheet honors them in PDF output (`break-after: page`)
- Status bar shows word count, character count and save state

**Android specifics**

- Toolbar is horizontally scrollable and sticky above the keyboard
- Set `interactive-widget=resizes-content` in the viewport meta so the layout viewport resizes with the keyboard; keep the `visualViewport` handler only as a fallback and to scroll the cursor into view
- Touch selection handles and the virtual keyboard work through native `contenteditable`; no custom input handling
- Hardware-keyboard shortcuts work the same as desktop

## Export, import and backup

| Format            | Method                                                                                                                                                                    | Notes                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| PDF               | Print stylesheet plus `window.print()` (Save as PDF)                                                                                                                      | Zero bundle weight; the browser embeds loaded fonts                                 |
| DOCX              | `docx` library, lazy-loaded and precached                                                                                                                                 | Font names written into the file; the font must be installed on the reading machine |
| TXT               | Plain text from the editor JSON                                                                                                                                           | Kruti Dev text exports as raw Latin characters                                      |
| Markdown          | Editor JSON to Markdown and back                                                                                                                                          | Lossy for fonts and colors                                                          |
| Backup **[v1.1]** | One `.zip` (`fflate`): `manifest.json` (schema version, counts, timestamp), `docs.json`, `settings.json`, optional `snapshots.json`, `fonts/<id>.ttf`, `images/<id>.webp` | Binary entries avoid base64 bloat; build incrementally to keep memory low           |

**Getting the file off the device [v1.1]**

The File System Access save picker is not available on Android Chrome. Use a Blob download (`<a download>`) and the Web Share API with files where available. Desktop Chrome/Edge may use the save picker as an enhancement.

**Restore**

- Validate `manifest.json` and schema (valibot) before touching existing data
- Modes: merge (skip same-id docs with newer `updatedAt`) or replace, with an automatic pre-restore backup
- Restore is transactional per store

**Import**

- TXT and Markdown parse directly into the editor
- DOCX goes through `mammoth.js`; formatting is approximated and fonts are mapped by name to the font store where a match exists

**Backup reminders**

- Banner if no backup for 7 days, evaluated on app open (the app cannot run in the background)
- After first run, a prominent "Back up now" action in settings and Ctrl+S menu

## Testing and developer tooling **[v1.1]**

| Tool                                              | Purpose                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Biome (or ESLint + Prettier)                      | Lint and format, run on every agent edit                                                                                             |
| `tsc --noEmit` (strict)                           | Typecheck gate                                                                                                                       |
| Vitest + `fake-indexeddb`                         | Storage module, backup/restore round-trip, schema validation, save logic                                                             |
| Playwright                                        | E2E on Chromium with Android-like viewport: install, offline reload, typing, formatting, export, backup/restore                      |
| `size-limit`                                      | Fails the build when core JS passes budget                                                                                           |
| Lighthouse CI (PWA checks)                        | Installability and service worker sanity                                                                                             |
| GitHub Actions + Cloudflare Pages or GitHub Pages | CI on every push, auto deploy on main                                                                                                |
| Test font                                         | A free TTF renamed to a custom family for automated tests; the real Kruti Dev is used only in manual device checks and is gitignored |

Definition of done for every task: typecheck, lint, unit tests, `size-limit`, and relevant Playwright test pass; then a manual check on the Android device when the task touches input, fonts or layout.

## Performance, risks and build phases

**Performance tactics**

- Preact instead of React; Tiptap extensions imported individually; table, export and import code lazy-loaded (but precached)
- Lazy-load shadcn dialogs and heavy menus; icons imported individually
- Fonts and images read from IndexedDB lazily; ProseMirror's own efficient rendering for large docs

**Risks**

| Risk                                                  | Impact                              | Mitigation                                                                                                           |
| ----------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Browser clears IndexedDB                              | Total data loss                     | `persist()` with result check; install as PWA; weekly backup banner; one-tap backup; minimal backup built in phase 3 |
| Kruti Dev font missing or corrupt                     | Hindi text unreadable               | Validate on upload; keep font in the backup file                                                                     |
| Android keyboard rewrites or autocorrects Latin input | Corrupted Hindi text                | Input attributes above; device test in phase 4                                                                       |
| Lazy chunks not cached                                | Features fail offline               | Precache all chunks; Playwright offline test for export and tables                                                   |
| Android virtual keyboard shifts layout                | Toolbar hidden or cursor off-screen | `interactive-widget=resizes-content`, `visualViewport` fallback                                                      |
| Radix under `preact/compat` quirks                    | Broken menus/dialogs                | Per-component device check; native fallbacks                                                                         |
| Large backups exhaust memory                          | Backup/restore crash                | Zip with binary entries, incremental build, test with a large fixture                                                |
| Two tabs editing one doc                              | Overwritten edits                   | Web Lock per doc, read-only second tab                                                                               |
| SW update reloads mid-edit                            | Lost typing                         | Prompt mode, apply when idle                                                                                         |
| DOCX fidelity differs from Word                       | Formatting drift on export          | Limit v1 to supported marks; round-trip tests                                                                        |
| No true pagination                                    | PDF page count differs from screen  | Manual page breaks; revisit later                                                                                    |

**Build phases**

0. Agentic setup: repo, `CLAUDE.md`, project skills, tooling, CI, size budget (see agent setup guide)
1. Scaffold: Vite, Preact, TS, Tailwind, shadcn init with aliases, Tiptap core, PWA manifest and SW with full precache; installs and opens offline; `size-limit` baseline
2. Editor shell: toolbar, page canvas, core formatting and shortcuts, paste policy, input attributes
3. Storage: Dexie schema, adaptive autosave, document list, snapshots, Web Lock, persist check, **minimal backup/restore (zip)**
4. Fonts: TTF upload, `FontFace` from ArrayBuffer, Kruti Dev device test (typing, reload offline, PDF), character palette
5. Extras: tables, images, find
