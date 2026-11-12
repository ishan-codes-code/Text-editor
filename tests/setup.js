// Plain JS on purpose: tsc skips .js files (allowJs is off), so no @types
// package is needed for this side-effect-only shim import.
// Exposes the IndexedDB globals that the storage module (phase 3) will use.
import "fake-indexeddb/auto";
