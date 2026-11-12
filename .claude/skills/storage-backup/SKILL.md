---

name: storage-backup
description: Use when working on Dexie schema, autosave, snapshots, document locking, backup zip creation, restore, or import/export of stored data. Covers durability rules and the backup file format.
---

# Storage and backup rules

## Schema (Dexie)

Stores: `docs` (id, title, titleFont, content JSON, wordCount, createdAt, updatedAt), `snapshots` (id, docId, content, savedAt), `fonts` (id, family, format, blob, addedAt), `images` (id, docId, blob, mime), `settings` (key, value). Any schema change needs a Dexie version bump with an upgrade function and a test that opens a database created at the previous version.

All access goes through `src/storage/`. UI code never imports Dexie.

## Saving

- Debounce 400 ms after the last edit; force a save on blur and `visibilitychange` (hidden).
- Large docs (about 20,000+ words): lengthen the debounce and serialize in `requestIdleCallback`; measure typing latency against the 50 ms target.
- One Dexie transaction per save.
- Snapshots: every 5 minutes of editing, keep the last 10 per doc, skip if content is unchanged.
- Per-document Web Lock; a second tab opens read-only with a banner.

## Backup format (`.zip`, via `fflate`)

```
manifest.json     { schemaVersion, createdAt, counts: { docs, fonts, images } }
docs.json
settings.json
snapshots.json    (optional, user toggle)
fonts/<id>.<ext>  binary
images/<id>.webp  binary
```

Do not use one base64 JSON file; it inflates size about 33% and can exhaust mobile memory. Build the zip incrementally.

## Restore

1. Validate `manifest.json` and every JSON file with `valibot` before writing anything.
2. Create an automatic pre-restore backup.
3. Modes: merge (keep newer `updatedAt` per id) or replace.
4. Write per store in a transaction; on failure, leave existing data untouched.

## Delivery on Android

The save picker (`showSaveFilePicker`) is not available on Android Chrome. Use an `<a download>` Blob link and the Web Share API with files when supported; desktop may use the picker as an enhancement.

## Tests

Round-trip: create docs, fonts and images, back up, wipe, restore, compare. Corrupt-file cases (bad manifest, missing font file, wrong schema version). A large fixture (for example 200 docs plus 20 fonts) must not crash.
