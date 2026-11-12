import { registerSW } from "virtual:pwa-register";

export type PwaStatus =
  | { state: "unsupported" }
  | { state: "ready"; updateAvailable: boolean; offlineReady: boolean };

export interface PwaControls {
  update: () => Promise<void>;
  subscribe: (listener: (status: PwaStatus) => void) => () => void;
}

/**
 * Registers the service worker in prompt mode. The worker never reloads the
 * page on its own: when a new version is waiting, `updateAvailable` flips to
 * true and the UI offers an "Update available" action. Applying the update
 * (updateSW) reloads once, on explicit user tap.
 */
export function initPwa(): PwaControls {
  let status: PwaStatus = {
    state: "ready",
    updateAvailable: false,
    offlineReady: false,
  };
  const listeners = new Set<(status: PwaStatus) => void>();
  const setStatus = (next: PwaStatus) => {
    status = next;
    for (const listener of listeners) listener(status);
  };

  if (!("serviceWorker" in navigator)) {
    setStatus({ state: "unsupported" });
    return {
      update: () => Promise.resolve(),
      subscribe: () => () => undefined,
    };
  }

  let offlineReady = false;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setStatus({ state: "ready", updateAvailable: true, offlineReady });
    },
    onOfflineReady() {
      offlineReady = true;
      if (status.state === "ready") {
        setStatus({ ...status, offlineReady: true });
      }
    },
  });

  return {
    update: () => updateSW(true),
    subscribe: (listener) => {
      listeners.add(listener);
      listener(status);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const PERSIST_KEY = "pwa:persisted";

/** Asks for persistent storage once and reports the granted result. */
export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    const stored = localStorage.getItem(PERSIST_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    // Private mode etc: fall through and try the live request.
  }
  let granted = false;
  try {
    granted = await navigator.storage.persist();
  } catch {
    granted = false;
  }
  try {
    localStorage.setItem(PERSIST_KEY, String(granted));
  } catch {
    // Ignore write failures; the status line just reports `granted`.
  }
  return granted;
}
