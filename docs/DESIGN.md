# DESIGN.md — Offline Text Editor (Phase A foundation)

Tablet-first, offline PWA. All UI work uses these tokens via Tailwind v4 /
shadcn CSS variables (`src/index.css`). Do not introduce raw values in
components; use the semantic utilities (`bg-background`, `text-foreground`,
`border-border`, …).

Checklist source: `ui-ux-pro-max` skill (design-system + ux domains), used as
a checklist only. Deliberate deviations, with reasons:

- **No webfont.** The skill suggests Google Fonts (Plus Jakarta Sans); a
  runtime font fetch violates the offline hard rule, and bundling Geist adds
  ~100 KB+ to the precache. UI type is the system stack
  (`--font-sans: ui-sans-serif, system-ui, …`). User-uploaded TTF/OTF fonts
  are document content, not chrome.
- **Neutral palette kept.** The skill's teal/orange suggestion is a rebrand
  decision, not a foundation need; the installed shadcn `radix-nova`
  neutrals stay until a rebrand is explicitly requested.

## Color tokens (light / dark)

Defined in `src/index.css` (`:root` / `.dark`), exposed via `@theme inline`
as `bg-*/text-*/border-*` utilities.

| Token                                  | Light                     | Dark                          | Use                                                                                                         |
| -------------------------------------- | ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--background`                         | oklch(1 0 0)              | oklch(0.145 0 0)              | App shell, canvas surround                                                                                  |
| `--workspace`                          | oklch(0.94 0 0)           | oklch(0.1 0 0)                | Document workspace surround (darker than the shell in both themes, so the page reads as a distinct surface) |
| `--foreground`                         | oklch(0.145 0 0)          | oklch(0.985 0 0)              | Body text                                                                                                   |
| `--card` / `--card-foreground`         | white / near-black        | oklch(0.205 0 0) / white      | Page canvas, toasts                                                                                         |
| `--popover` / `--popover-foreground`   | white / near-black        | oklch(0.205 0 0) / white      | Menus, command palette                                                                                      |
| `--primary` / `--primary-foreground`   | oklch(0.205 0 0) / white  | oklch(0.922 0 0) / near-black | Save, CTAs, update banner                                                                                   |
| `--secondary` / `--muted` / `--accent` | oklch(0.97 0 0) family    | oklch(0.269 0 0) family       | Toolbars, wells, hover                                                                                      |
| `--destructive`                        | oklch(0.577 0.245 27.325) | oklch(0.704 0.191 22.216)     | Delete                                                                                                      |
| `--border` / `--input` / `--ring`      | oklch(0.922 0 0)…         | white 10–15%                  | Borders, inputs, focus                                                                                      |
| `--chart-*`, `--sidebar-*`             | shadcn defaults           | shadcn defaults               | Reserved for Phase B                                                                                        |

Contrast target: 4.5:1 body text (skill checklist §1). Destructive-on-white
pairs are checked in both themes before use on text.

## Spacing scale

Tailwind default scale, density **standard** (skill dial: mid). Gaps between
adjacent touch targets ≥ 8px (`gap-2` minimum). Page canvas padding
`px-4 sm:px-10`, section stacks `gap-4`.

## Type scale

- UI: system stack; base 16px (`text-sm` 14px for chrome labels, never below
  12px for body copy); headings `text-base`/`text-lg` semibold; line-height
  ≥ 1.5 for reading surfaces.
- Document content type is user-controlled (font family/size extensions).

## Radii

`--radius: 0.625rem`; `--radius-sm/md/lg` derived (`calc(var(--radius) -
4px/2px)`), `xl–4xl` multiples in `@theme`. Buttons `rounded-lg` per shadcn
nova; canvas `rounded-sm` (prints square).

## Elevation

Flat-first (skill: Flat Design, low cost): `shadow-sm` toolbar/canvas,
`shadow-md` popovers, `shadow-lg` dialogs/sheets/toasts. No decorative
gradients.

## Motion

150–200ms ease for feedback (hover/press/selection); overlays use Radix/vaul
defaults. `prefers-reduced-motion` disables non-essential animation (overlay
transitions, toasts). Never 0ms state flips without feedback; never
hover-only affordances.

## Breakpoints (tablet-first, container/input-driven)

Breakpoints respond to **viewport size and input capability**, never device
detection. Tablet portrait 800×1280 and landscape 1280×800 are the primary
targets; 600×960 split-screen, 1440×900 desktop and 390×844 phone must work.

| Token                      | Width                | Shell behavior                                              |
| -------------------------- | -------------------- | ----------------------------------------------------------- |
| phone                      | < 640px              | Bottom sheets (vaul Drawer), single column, toolbar scrolls |
| tablet portrait            | 640–1023px           | Bottom sheets, canvas max A4, side panel is slide-over      |
| tablet landscape / desktop | ≥ 1024px + landscape | Side panel docks; dialogs (Radix) centered                  |
| wide                       | ≥ 1440px             | Canvas stays A4 centered, no line-length growth             |

Media features used: `min-width`, `orientation: landscape`,
`(hover: hover)` + `(pointer: fine)` to gate hover-only affordances
(hover styles are enhancement only — everything is tappable/clickable).

## Touch targets

Minimum **44×44px** for all interactive elements (prompt floor; Android
recommends 48dp where space allows). Toolbar and header controls are 44px
(`size-11`/`h-11`); panel action buttons are `h-11`; checkbox/radio rows are
`min-h-11` labels so the whole row is the target. Spacing between targets
≥ 8px. Nothing hover-only; keyboard operable with visible focus
(`focus-visible` ring via `--ring`).

## Shell rules (see App)

- Root is `h-dvh flex flex-col overflow-hidden`; exactly ONE scroll container
  (`main`, `overflow-y-auto`, `min-h-0`, `overscroll-behavior: contain`,
  `scrollbar-gutter: stable`).
- Regions: alert banners → top bar → formatting toolbar → canvas → status
  bar; side panel docks `landscape:lg:block` and collapses to zero width via
  the Documents toggle (choice persisted in settings), otherwise slide-over
  via overlay manager. The canvas (`main`, `bg-workspace`) is the one document
  scroll container; the docked panel scrolls internally only when its own list
  overflows. The page section (`bg-card`, bordered, elevated) must stay
  visually distinct from the workspace surround in both themes.
- Formatting toolbar: labeled `fieldset` groups (text, style, paragraph,
  lists, insert, tools) that wrap onto multiple rows on narrow screens —
  never one endlessly scrolling row. Toolbar buttons suppress the mousedown
  default so formatting never destroys the editor selection.
- Every overlay: `max-height: 100dvh` with its own inner scroll; single
  scroll lock (only the top overlay is modal); Esc and Android back close
  the top item; focus returns when the stack empties.
