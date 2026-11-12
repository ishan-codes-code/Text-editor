# Offline PWA Text Editor

Offline-first rich-text editor PWA for one user on Android Chrome with a physical keyboard. Defining feature: non-Unicode Hindi fonts (Kruti Dev) and user-uploaded TTF/OTF fonts. The spec is `docs/TRD.md` (v1.1). Read the relevant section before starting any task; if code and TRD disagree, stop and ask.

## Stack

Preact + Vite + TypeScript (strict), Tailwind, shadcn/ui (copied-in components, `react` aliased to `preact/compat`), lucide icons (individual imports), Tiptap 3 core (`@tiptap/core`, no React wrapper), Dexie, vite-plugin-pwa (Workbox, prompt update), `fflate` for backup zip, `valibot` for schema validation, lazy `docx` and `mammoth`.

## Commands

- `npm run dev` start dev server
- `npm run typecheck` tsc --noEmit
- `npm run lint` Biome check
- `npm test` Vitest (use `fake-indexeddb`)
- `npm run e2e` Playwright
- `npm run size` size-limit (core JS budget 300 KB gzipped)
- `npm run build` production build + service worker

## Definition of done

A task is done only when typecheck, lint, tests, `npm run size` and any relevant e2e pass. Tasks touching input, fonts, layout or the service worker also need a manual Android check; list what to verify on the device in your final message.

## Hard rules

- No backend, no telemetry, no network calls at runtime. Everything works offline, including export, import and tables: every lazy chunk must be precached.
- Documents are stored as editor JSON in IndexedDB behind `src/storage/`. UI code never touches Dexie directly.
- Fonts: register with `new FontFace(family, await blob.arrayBuffer())`, then `await face.load()`. Never pass a Blob. Never rely on `font-display`.
- The editable element always has `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="none"`.
- Never commit, bundle or fetch the Kruti Dev font. Tests use a free TTF under `tests/fixtures/`. `*.ttf`/`*.otf` outside fixtures are gitignored.
- Writes are single Dexie transactions. Autosave debounce 400 ms plus forced save on blur and `visibilitychange`.
- Never reload the page automatically on a service worker update.
- Add a dependency only if it is needed; state its gzipped size. Ask before adding anything over 10 KB gzipped.
- No `any`, no silenced TypeScript errors, no commented-out code.
- Tiptap 3 differs from v2 in package layout and extension names: check the installed version's exports and docs (use the Context7 MCP if available) instead of guessing.

## Workflow

1. For non-trivial tasks, plan first (plan mode), list files you will change and tests you will add.
2. One phase of the TRD per branch (`phase-N-name`), small commits, conventional messages.
3. Write the test with the feature, not after.
4. Finish with a short summary: what changed, what was verified, what the user must check on the Android device, open questions.

## Project skills

`.claude/skills/` holds `font-system`, `offline-pwa` and `storage-backup`. They load when the task matches; use them for anything touching fonts, the service worker/precache, or storage and backup.
