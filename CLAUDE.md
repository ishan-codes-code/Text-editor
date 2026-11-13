# Offline PWA Text Editor

Offline-first rich-text editor PWA, tablet-first (Android tablet portrait 800x1280 and landscape 1280x800; also 600x960 split-screen, desktop Chrome/Edge and phone). Defining feature: non-Unicode Hindi fonts (Kruti Dev) and user-uploaded TTF/OTF fonts. The spec is `docs/TRD.md` (v2). Read the relevant section before starting any task; if code and TRD disagree, stop and ask.

## Stack

React 19 + Vite + TypeScript (strict), Tailwind v4, official Tiptap 3 extensions (individual packages; `@tiptap/react` adapter with `useEditorState` selectors so typing only re-renders subscribed subtrees), Dexie behind `src/storage/`, Zustand for the session state machine and overlay stack, `fflate` for backup zip, `valibot` for schema validation, lazy `docx` and `mammoth`. UI is real shadcn/ui (Radix nova, via the shadcn CLI) plus vaul Drawer for bottom sheets, cmdk Command, sonner Toaster, next-themes; lucide-react icons (individual imports). Tokens in `docs/DESIGN.md`, wired into Tailwind/shadcn CSS variables in `src/index.css`.

## Commands

- `npm run dev` start dev server
- `npm run typecheck` tsc --noEmit
- `npm run lint` Biome check (vendored `.agents/**` skills are ignored; upstream `input-group` a11y notes are waived in `biome.json`)
- `npm test` Vitest (use `fake-indexeddb`; jsdom stubs for matchMedia/ResizeObserver/scrollIntoView live in `tests/setup.js`)
- `npm run e2e` Playwright (Pixel 7 project; rebuilds + serves prod)
- `npm run size` size-limit (fails over 450 KB gzipped total JS)
- `npm run size:budget` per-chunk table; warn over 350 KB, fail over 450 KB
- `npm run build` production build + service worker

## Definition of done

A task is done only when typecheck, lint, tests, `npm run size` and any relevant e2e pass, plus the screenshot matrix (`viewport-matrix` spec) is run, its images looked at, and committed baselines updated. Tasks touching input, fonts, layout or the service worker also need a manual Android check; list what to verify on the device in your final message.

## Hard rules

- No backend, no telemetry, no network calls at runtime. Everything works offline, including export, import and tables: every lazy chunk must be precached.
- Documents are stored as editor JSON in IndexedDB behind `src/storage/`. UI code never touches Dexie directly.
- Fonts: register with `new FontFace(family, await blob.arrayBuffer())`, then `await face.load()`. Never pass a Blob. Never rely on `font-display`. Re-measure layout after `document.fonts.ready` (see `remeasureAfterFontsLoad`).
- The editable element always has `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="none"`.
- Never commit, bundle or fetch the Kruti Dev font. Tests use a free TTF under `tests/fixtures/`. `*.ttf`/`*.otf` outside fixtures are gitignored.
- Writes are single Dexie transactions. Saves go through one `SaveQueue` per open document (generation tokens, lazy serialization at write time, 400 ms debounce, forced save on blur/`visibilitychange`/`pagehide`).
- Never reload the page automatically on a service worker update. "Update now" flushes saves before reloading.
- Never `setContent` while composing (IME guard in `applyContent.ts`); a corrupt stored doc falls back to the newest loadable snapshot, never read-only.
- Overlays open only through `src/overlays/store.ts`. One overlay renders at a time (single scroll lock, Esc/back close the top, focus returns). Dialogs ≥768px, bottom sheets below; every overlay max-height 100dvh with its own inner scroll.
- The document list reads the content-free `docMeta` projection, never editor JSON. Every docs write syncs meta in the same transaction.
- Restore: validate, deliver the pre-restore backup to the user, then write in ONE transaction. Duplicate copies images under new ids and rewrites `imageRef` ids.
- Add a dependency only if it is needed; state its gzipped size and the `npm run size` delta. Ask only for genuinely user decisions; when the task authorizes a library set, proceed and report sizes in the final summary instead of pausing.
- No `any`, no silenced TypeScript errors, no commented-out code, no non-null assertions (Biome enforced).
- Tiptap 3 differs from v2 in package layout and extension names: check the installed version's exports and docs (use the Context7 MCP) instead of guessing.
- Touch targets ≥44px, nothing hover-only; respond to size/input capability (container queries, `(hover)`, `(pointer)`), never device detection.

## Workflow

1. For non-trivial work, plan once at the start, then implement the whole chunk end to end; commit logically but do not pause between commits.
2. One branch per phase (for example `phase-a-foundation`); small commits, conventional messages.
3. Libraries first: use official Tiptap extensions, Radix/shadcn primitives, Dexie, `fflate`, and `valibot`. Hand-roll only when no suitable library fits budget/compat, and say which with size numbers.
4. Write the test with the feature, not after. Relevant only: cover behavior that can break users (save queue ordering/generations, session transitions, restore safety, duplicate-with-images, corrupt recovery, overlay stack + back button, offline, typing, locks, schema validation, paste policy); do not add trivial rendering tests.
5. While working, run the relevant tests for each change; run the full suite once before the final summary.
6. Ask only for genuinely user decisions.
7. Finish with a short summary: what changed, what was verified, size delta, what the user must check on the Android device, open questions.

## Project skills and MCP

- `.claude/skills/` holds `font-system`, `offline-pwa` and `storage-backup`: use for fonts, service worker/precache, storage and backup.
- `.agents/skills/` (project scope): `shadcn` + `migrate-radix-to-base` (shadcn/ui work), `ui-ux-pro-max` + `design-system`/`ui-styling`/`design`/`brand`/`slides`/`banner-design` (design checklist only — never a code generator; its `search.py` is stdlib-local, but do NOT run its `fetch-background`, `sync-brand`, `shadcn_add` or `setup.sh` helpers: they hit the network/run shell).
- `.mcp.json`: `shadcn` MCP server (`npx shadcn@latest mcp`). Context7 and Playwright MCPs are provided by the environment — verify before reinstalling.
