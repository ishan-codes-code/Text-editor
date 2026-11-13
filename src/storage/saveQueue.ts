import type { JSONContent } from "@tiptap/core";

export type SaveState = "saved" | "saving" | "dirty" | "error";

export interface SaveQueueCallbacks {
  onStateChange?: (state: SaveState) => void;
}

/** Lazy serializers: the document is serialized at write time, not per keystroke. */
export interface SavePayload {
  getContent: () => JSONContent;
  getText: () => string;
}

/**
 * Single-writer save queue with a generation token.
 *
 * - `schedule()` bumps the generation and stashes the latest lazy getters;
 *   rapid keystrokes coalesce so only the newest generation is ever written.
 * - Writes run strictly sequentially; a write serializes its getters when it
 *   starts, so an older save can never overwrite newer content: the last
 *   writer always holds the newest generation.
 * - A failed write keeps the payload for retry unless a newer generation has
 *   already superseded it.
 * - Adaptive debounce: 400 ms for normal docs, 1200 ms past ~20,000 words,
 *   with large serializations yielding via `requestIdleCallback` first.
 * - `flush()` drains the queue (debounce + in-flight write); call it on blur,
 *   `visibilitychange` (hidden) and `pagehide` so a killed tab loses at most
 *   the debounce window.
 */
export class SaveQueue {
  private generation = 0;
  private written = 0;
  private pending: (SavePayload & { generation: number }) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;
  private inflight: Promise<void> | null = null;
  private disposed = false;
  private readonly onStateChange: ((state: SaveState) => void) | undefined;

  constructor(
    private readonly save: (json: JSONContent, text: string) => Promise<void>,
    callbacks: SaveQueueCallbacks = {},
  ) {
    this.onStateChange = callbacks.onStateChange;
  }

  private setState(state: SaveState): void {
    this.onStateChange?.(state);
  }

  static largeDocThresholdWords = 20_000;
  static debounceMs = 400;
  static largeDocDebounceMs = 1200;

  /** Generation of the latest scheduled (possibly unwritten) save. */
  get scheduledGeneration(): number {
    return this.generation;
  }

  /** Generation of the latest fully written save. */
  get writtenGeneration(): number {
    return this.written;
  }

  private static wordsOf(text: string): number {
    const trimmed = text.trim();
    return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  }

  private delayForWords(words: number): number {
    return words >= SaveQueue.largeDocThresholdWords
      ? SaveQueue.largeDocDebounceMs
      : SaveQueue.debounceMs;
  }

  /** Queue a save of the latest content; restarts the debounce window. */
  schedule(getContent: () => JSONContent, getText: () => string): void {
    if (this.disposed) return;
    this.generation += 1;
    this.pending = { generation: this.generation, getContent, getText };
    if (this.timer !== null) clearTimeout(this.timer);
    this.setState("dirty");
    // Only the plain text is read now (to size the debounce); the expensive
    // editor JSON is serialized at write time inside the queue.
    const delay = this.delayForWords(SaveQueue.wordsOf(getText()));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, delay);
  }

  private async pump(): Promise<void> {
    if (this.writing) {
      await this.inflight;
      return;
    }
    this.writing = true;
    try {
      while (this.pending !== null && !this.disposed) {
        const work = this.pending;
        this.pending = null;
        this.setState("saving");
        let content: JSONContent;
        let text: string;
        try {
          text = work.getText();
          if (SaveQueue.wordsOf(text) >= SaveQueue.largeDocThresholdWords) {
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
          content = work.getContent();
        } catch {
          // Serializers failed (e.g. editor torn down): report and drop.
          this.setState("error");
          continue;
        }
        const write = this.save(content, text);
        this.inflight = write.then(
          () => undefined,
          () => undefined,
        );
        try {
          await write;
          this.written = work.generation;
          this.setState(this.pending === null ? "saved" : "dirty");
        } catch {
          // Keep the failed payload for retry — unless a newer generation
          // already superseded it, which serializes fresher content anyway.
          if (this.pending === null) this.pending = work;
          this.setState("error");
        } finally {
          this.inflight = null;
        }
      }
    } finally {
      this.writing = false;
    }
  }

  /** True while a debounce is pending or a write is in flight. */
  get hasPending(): boolean {
    return this.pending !== null || this.writing || this.timer !== null;
  }

  /** Writes any queued content now, waiting out an in-flight write. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.pending !== null || this.writing) {
      await this.pump();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
