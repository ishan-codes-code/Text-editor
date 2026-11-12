# Agentic development setup (Claude Code)

How to run this project with Claude Code: repo layout, what goes where, installs, and a prompt for each build phase. Verify exact commands against the docs when you run them: https://docs.claude.com/en/docs/claude-code/overview

## 1. What goes where

| Mechanism                       | Use it for in this project                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                     | Always-on rules: stack, commands, definition of done, hard rules (offline, fonts, no Kruti Dev in repo)  |
| Skills (`.claude/skills/`)      | On-demand knowledge: `font-system`, `offline-pwa`, `storage-backup`; loaded only when a task matches     |
| Subagents (`.claude/agents/`)   | Isolated work: a read-only `reviewer` after each phase, a `pwa-auditor` that checks precache and offline |
| Hooks (`.claude/settings.json`) | Automation: format and typecheck after edits, block edits to `*.ttf`, block `git push` to main           |
| MCP servers                     | External tools: current library docs (Context7), real-browser testing (Playwright)                       |

Rule of thumb: if it must be true on every task, it is `CLAUDE.md`; if it is only needed for some tasks, it is a skill.

## 2. One-time setup

1. Install Node LTS, git, and Claude Code (see the docs link above).
2. Create the repo:

   ````bash
      npm create vite@latest typing-editor -- --template preact-ts
         cd typing-editor && git init
            ```
            3. Copy in this kit: `CLAUDE.md`, `.claude/skills/*`, and `docs/TRD.md` (the v1.1 file, renamed).
            4. Add a `.gitignore` that includes `*.ttf` and `*.otf` with exceptions for `tests/fixtures/`.
            5. Create a private GitHub repo, then Cloudflare Pages or GitHub Pages for hosting.
            6. Optional MCP servers (check each project's README for the current command):
               ```bash
                  claude mcp add context7 -- npx -y @upstash/context7-mcp
                     claude mcp add playwright -- npx -y @playwright/mcp@latest
                        ```
                           Context7 gives the agent up-to-date docs for Tiptap 3, shadcn, Workbox and Dexie, which matters because Tiptap 3 differs from v2.
                           7. Start Claude Code in the repo and run your first prompt (Phase 0 below).

                           ## 3. Working loop (every phase)

                           1. Start a fresh session per phase; `CLAUDE.md` and skills reload automatically.
                           2. Use plan mode first: ask for a plan, read it, correct it, then approve.
                           3. Branch `phase-N-name`; let the agent commit in small steps.
                           4. The agent must run typecheck, lint, tests, `size-limit` and e2e before saying done.
                           5. You test on the Android device whatever the agent lists under "check on device".
                           6. Run the reviewer subagent, fix findings, merge.

                           ## 4. Prompt template

                           ```
                           Goal: <one sentence>
                           Read first: docs/TRD.md section "<name>", skill <name> if relevant
                           Scope: <what is in> / Not in scope: <what is out>
                           Acceptance: <observable checks, including tests to add>
                           Constraints: follow CLAUDE.md. Ask before adding dependencies over 10 KB gzipped.
                           Finish with: summary, test results, size delta, what I must check on the Android device.
                           ```

                           ## 5. Phase prompts

                           **Phase 0: tooling**
                           ```
                           Goal: set up the project toolchain, no features yet.
                           Read first: docs/TRD.md "Testing and developer tooling", CLAUDE.md.
                           Do: Tailwind, Biome, strict TS, Vitest + fake-indexeddb, Playwright (Chromium, Android-like viewport), size-limit (300 KB gzipped core), npm scripts named in CLAUDE.md, GitHub Actions CI running all of them, deploy to <host>.
                           Acceptance: CI green on an empty app; each script runs locally.
                           ```

                           **Phase 1: scaffold**
                           ```
                           Goal: installable offline PWA shell with the UI layer in place.
                           Read first: TRD "Architecture", "UI layer", skill offline-pwa.
                           Do: vite-plugin-pwa (prompt mode, manifest, icons), full precache of all chunks, shadcn/ui init with react -> preact/compat aliases (vite.config and tsconfig paths), add Button, Dropdown Menu, Dialog, Sheet, Command, Sonner, lucide icons, Tiptap core mounted via a small Preact hook with a bare paragraph editor, dark mode variables.
                           Acceptance: Playwright test loads online, goes offline, reloads, app works; installs; size-limit baseline recorded; every shadcn component used renders and focus-traps correctly under compat (report any that do not and propose native fallbacks).
                           ```

                           **Phase 2: editor shell**
                           ```
                           Goal: formatting toolbar, page canvas, shortcuts.
                           Read first: TRD "Editor features and keyboard shortcuts", "Paste policy".
                           Do: extensions per the table (check Tiptap 3 exports via Context7), custom FontSize, LineHeight, Indent, PageBreak, paste handler (F17), input attributes, sticky scrollable toolbar, interactive-widget viewport meta, A4 canvas, zoom, status bar.
                           Acceptance: Playwright covers each shortcut and paste cases; list of device checks (keyboard resize, selection handles).
                           ```

                           **Phase 3: storage and minimal backup**
                           ```
                           Goal: documents persist; backup exists early.
                           Read first: TRD "Data model", skill storage-backup.
                           Do: src/storage module (Dexie schema v1), doc list (create, open, rename, duplicate, delete, search), adaptive autosave, snapshots, Web Lock, persist() with status, backup and restore as zip with schema validation.
                           Acceptance: unit tests for save, snapshot pruning, backup/restore round trip incl. corrupt files; crash test (kill tab mid-typing, at most ~500 ms lost).
                           ```

                           **Phase 4: fonts**
                           ```
                           Goal: Kruti Dev and any TTF work offline.
                           Read first: TRD "Font system", skill font-system.
                           Do: upload and validation, store, FontFace from ArrayBuffer at startup, font dropdown, default font setting, Hindi/English toggle shortcut, titleFont, character palette.
                           Acceptance: tests with a fixture TTF; offline reload still renders; PDF print preserves font. Device checklist for me: install my Kruti Dev, type with the hardware keyboard, confirm no autocorrect, use the palette for special glyphs.
                           ```

                           **Phase 5: extras**
                           ```
                           Goal: tables, images, find and replace, line spacing, indent, dark mode polish.
                           Do: table (lazy and precached), image node backed by the images store (resize to 1600 px, WebP), search plugin with replace.
                           Acceptance: offline test inserts a table and an image; backup includes images.
                           ```

                           **Phase 6: export, import, backup UX**
                           ```
                           Goal: PDF, DOCX, TXT, Markdown, import, reminders, restore modes.
                           Do: print stylesheet honoring page breaks, lazy docx and mammoth (precached), Blob download plus Web Share, 7-day backup banner, merge/replace restore with automatic pre-restore backup.
                           Acceptance: round-trip tests; offline export test.
                           ```

                           **Phase 7: hardening**
                           ```
                           Goal: device and performance pass.
                           Do: 50,000-word fixture and typing latency measurement, large-backup test, SW update flow test, Lighthouse PWA check, fix findings.
                           Acceptance: all NFR targets in the TRD measured and reported in a table.
                           ```

                           ## 6. Subagents and hooks worth adding (ask Claude Code to draft them)

                           - `reviewer` (read-only tools): reviews the diff against TRD and CLAUDE.md rules, reports blockers and nits.
                           - `pwa-auditor`: builds, inspects the precache manifest, runs the offline Playwright test.
                           - Hook: after edits run Biome format and `tsc --noEmit`; block writes to `*.ttf` and `*.otf` outside `tests/fixtures/`.

                           Keep the set small; add one only when you repeat the same instruction three times.

                           ## 7. Habits that save time

                           - Keep tasks small and testable; one prompt should fit in one commit or two.
                           - When the agent is wrong about a library, give it the docs (Context7 or a pasted snippet) instead of arguing.
                           - Put every repeated correction into `CLAUDE.md` or a skill so you only say it once.
                           - Review the diff, not the explanation.
   ````
