---

name: offline-pwa
description: Use when touching vite-plugin-pwa, Workbox config, the manifest, service worker updates, lazy chunks, install behavior, or anything that must work with no network. Ensures every feature works offline.
---

# Offline PWA rules

## Precache everything

All build output is precached, including lazy chunks (table, `docx`, `mammoth`, import, heavy dialogs). A lazy chunk that is not precached breaks the feature offline. After any change to chunking or dynamic imports:

1. `npm run build`
2. Inspect the generated precache manifest and confirm every `import()` target is listed.
3. Run the Playwright offline test: load once online, go offline, reload, then exercise export (DOCX/PDF), table insert and import.

Raise `workbox.maximumFileSizeToCacheInBytes` only deliberately and note why.

## Updates

Use `registerType: 'prompt'`. Show "Update available" and apply only on user tap or when the editor is saved and idle. Never call `location.reload()` automatically, and never `skipWaiting` while a document has unsaved changes.

## Storage persistence

On first run call `navigator.storage.persist()` and store the returned boolean. Chrome grants it heuristically (installed PWA, engagement), not via a prompt. Show status in settings; if `false`, suggest installing and backing up.

## Viewport and keyboard

Viewport meta includes `interactive-widget=resizes-content`. Keep a `visualViewport` handler only as fallback and to scroll the caret into view.

## Manifest

`display: standalone`, icons 192 and 512 (maskable included), `start_url` and `scope` relative so any static host works.

## Budget

`npm run size` must pass (core JS 300 KB gzipped). Report the delta in your final message when a task changes bundle size by more than 5 KB.
