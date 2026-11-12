/**
 * Per-document Web Lock: the tab that holds `lock:<docId>` may edit;
 * a second tab sees the lock as held and opens the doc read-only.
 */

export interface DocLock {
  /** True when this tab holds the lock and may edit. */
  held: boolean;
  /** Releases a held lock. */
  release: () => void;
}

export function locksSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    navigator.locks !== undefined
  );
}

export function docLockName(docId: string): string {
  return `doc:${docId}`;
}

/**
 * Tries to take the lock without waiting. When granted, the request callback
 * stays pending (holding the lock) until `release()` is called. When another
 * tab holds it, resolves promptly with `held: false`.
 */
export async function acquireDocLock(docId: string): Promise<DocLock> {
  if (!locksSupported()) {
    // Single-tab fallback (jsdom, old browsers): allow editing.
    return { held: true, release: () => undefined };
  }
  const name = docLockName(docId);
  let releaseGrant: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseGrant = resolve;
  });
  let decide: (granted: boolean) => void = () => undefined;
  const decided = new Promise<boolean>((resolve) => {
    decide = resolve;
  });
  const request = navigator.locks.request(
    name,
    { ifAvailable: true },
    (lock) => {
      if (lock === null) {
        decide(false);
        return;
      }
      decide(true);
      return held;
    },
  );
  // A declined `ifAvailable` lock still resolves; only real errors reject.
  request.catch(() => decide(false));
  const granted = await decided;
  if (!granted) return { held: false, release: () => undefined };
  let released = false;
  return {
    held: true,
    release: () => {
      if (released) return;
      released = true;
      releaseGrant();
    },
  };
}
