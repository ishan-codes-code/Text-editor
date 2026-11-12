---

name: font-system
description: Use when working on font upload, FontFace registration, the font dropdown, Kruti Dev handling, the special-character palette, title fonts, or editor input attributes. Encodes the rules for loading non-Unicode and custom fonts offline.
---

# Font system rules

Kruti Dev is non-Unicode: Latin keystrokes map to Devanagari glyphs inside the font. The editor needs no input method, only reliable font loading and protection from the Android keyboard.

## Loading

1. Validate on upload: file under 5 MB, valid sfnt header (`0x00010000`, `OTTO`, `true`), family read from the `name` table (IDs 1 and 16) with a small custom reader. Do not add a full font parser to the core bundle.
2. Store `{ family, format, blob, addedAt }` in the `fonts` store.
3. Register on startup:

   ````ts
      const buf = await blob.arrayBuffer();
         const face = new FontFace(family, buf);
            await face.load();
               document.fonts.add(face);
                  ```
                     `FontFace` does not accept a Blob. `font-display` does not apply to buffer sources. Await all registrations before rendering a document that uses them.
                     4. Deleting a font must not delete text; text keeps its family mark and falls back until the font is re-added. Warn the user.

                     ## Editor input

                     The editable element must have `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="none"`, `autocomplete="off"`. Verify on a device with Gboard and a hardware keyboard that Latin keystrokes are never autocorrected or capitalized.

                     ## Palette (F14, Must)

                     Alt+numpad codes do not work on Android, so the palette is the only way to reach some glyphs. Render glyphs in the active font, insert at the cursor with one tap, keep a recently-used row, bind a shortcut to open it.

                     ## Titles

                     Documents have `titleFont`. List and search UI render titles with it. Do not run text normalization on Kruti Dev titles.

                     ## Tests

                     Use a free TTF renamed to a test family in `tests/fixtures/`. Never commit Kruti Dev. Cover: upload validation (bad header, oversize), register on startup, reload offline still renders, PDF export keeps the font.
   ````
