import type { JSONContent } from "@tiptap/core";

export type SaveState = "saved" | "saving" | "dirty" | "error";

export interface AutosaveCallbacks {
  onStateChange?: (state: SaveState) => void;
}

/**
 * Adaptive autosave: debounces content snapshots, then serializes and writes.
 *
 * - Small docs: 400 ms debounce after the last edit.
 * - Large docs (~20,000+ words): 1200 ms debounce and serialization inside
 *   `requestIdleCallback` (setTimeout fallback) so `getJSON()` cannot break
 *   the 50 ms typing-latency target.
 * - `flush()` forces an immediate save; call it on blur, `visibilitychange`
 *   (hidden) and `pagehide` so a killed tab loses at most the debounce
 *   window (~500 ms worst case for normal docs).
 */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: { json: JSONContent; text: string } | null = null;
  private saving = false;
  private disposed = false;
  private readonly onStateChange: ((state: SaveState) => void) | undefined;

  constructor(
    private readonly save: (json: JSONContent, text: string) => Promise<void>,
    callbacks: AutosaveCallbacks = {},
  ) {
    this.onStateChange = callbacks.onStateChange;
  }

  private setState(state: SaveState): void {
    this.onStateChange?.(state);
  }

  static largeDocThresholdWords = 20_000;
  static debounceMs = 400;
  static largeDocDebounceMs = 1200;

  private delayFor(text: string): number {
    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    return words >= Autosave.largeDocThresholdWords
      ? Autosave.largeDocDebounceMs
      : Autosave.debounceMs;
  }

  /** Queue a save of the latest content; restarts the debounce window. */
  schedule(json: JSONContent, text: string): void {
    if (this.disposed) return;
    this.pending = { json, text };
    if (this.timer !== null) clearTimeout(this.timer);
    this.setState("dirty");
    const delay = this.delayFor(text);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.writePending();
    }, delay);
  }

  private async writePending(): Promise<void> {
    const work = this.pending;
    this.pending = null;
    if (work === null || this.disposed) return;
    this.saving = true;
    this.setState("saving");
    try {
      // Large serializations yield to the event loop first so typing stays
      // responsive; normal docs write immediately.
      const words =
        work.text.trim() === "" ? 0 : work.text.trim().split(/\s+/).length;
      if (words >= Autosave.largeDocThresholdWords) {
        await new Promise<void>((resolve) => {
          const idle = (
            globalThis as {
              requestIdleCallback?: (cb: () => void) => void;
            }
          ).requestIdleCallback;
          if (typeof idle === "function") idle(() => resolve());
          else setTimeout(resolve, 0);
        });
        if (this.disposed) return;
      }
      await this.save(work.json, work.text);
      this.setState(this.pending === null ? "saved" : "dirty");
    } catch {
      // Keep the failed payload so the next schedule/flush retries it.
      this.pending = work;
      this.setState("error");
    } finally {
      this.saving = false;
    }
  }

  /** True while a debounce is pending or a write is in flight. */
  get hasPending(): boolean {
    return this.pending !== null || this.saving || this.timer !== null;
  }

  /** Writes any queued content now (blur / hidden tab / pagehide). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.writePending();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
