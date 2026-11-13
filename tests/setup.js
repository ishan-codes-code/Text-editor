// Plain JS on purpose: tsc skips .js files (allowJs is off), so no @types
// package is needed for this side-effect-only shim import.
// Exposes the IndexedDB globals that the storage module (phase 3) will use.
import "fake-indexeddb/auto";

// jsdom gaps covered by static stubs; real behavior is covered in Chromium:
// - matchMedia: read by sonner's Toaster on mount.
// - ResizeObserver: used by cmdk's Command list for height tracking.
// - scrollIntoView: called by cmdk to reveal the active item.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

if (
  typeof window !== "undefined" &&
  typeof window.ResizeObserver !== "function"
) {
  window.ResizeObserver = class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  };
}

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = () => undefined;
}
