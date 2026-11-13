import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { useOverlayStore, useTopOverlay } from "./store";

function useDesktopDialogs(): boolean {
  // Dialogs from 768px up, bottom sheets below (DESIGN.md). The 640–768
  // band uses sheets: touch-first, consistent with tablet portrait.
  const query = "(min-width: 768px)";
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return matches;
}

interface CloseWatcherLike {
  oncancel: ((event: Event) => void) | null;
  destroy: () => void;
}

function getCloseWatcher(): (new () => CloseWatcherLike) | null {
  const ctor = (
    window as unknown as {
      CloseWatcher?: new () => CloseWatcherLike;
    }
  ).CloseWatcher;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * Renders only the top overlay: a centered Dialog (desktop) or a bottom
 * Drawer sheet (touch widths), or a docked side Sheet for kind "sheet" on
 * desktop. Exactly one modal is ever mounted, so there is exactly one
 * scroll lock and Esc closes the top item natively.
 *
 * Android back button: CloseWatcher where available, otherwise a single
 * history entry consumed by the next back press. Both paths close only the
 * top item. Focus returns to the pre-overlay element when the stack empties.
 */
export function OverlayHost() {
  const top = useTopOverlay();
  const isDesktop = useDesktopDialogs();
  const stackEmpty = useOverlayStore((state) => state.stack.length === 0);

  // Keyed on empty/non-empty only: one back-button session spans the whole
  // stack, so pushing or popping an overlay never churns history entries.
  useEffect(() => {
    if (stackEmpty) return;
    const state = useOverlayStore.getState();

    // Remember where focus was so it can be restored when the stack empties.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const restoreFocus = () => {
      if (
        previouslyFocused?.isConnected === true &&
        (document.activeElement === null ||
          document.activeElement === document.body)
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };

    const CloseWatcherCtor = getCloseWatcher();
    if (CloseWatcherCtor !== null) {
      const watcher = new CloseWatcherCtor();
      watcher.oncancel = (event) => {
        event.preventDefault();
        state.closeTopOverlay();
      };
      return () => {
        watcher.destroy();
        restoreFocus();
      };
    }

    // History-entry fallback: one entry per non-empty session. A user back
    // press pops it (close the top); a programmatic close removes it.
    let entryLive = true;
    let suppressed = false;
    const onPopState = () => {
      if (suppressed) {
        suppressed = false;
        return;
      }
      entryLive = false;
      state.closeTopOverlay();
      // A deeper stack needs a fresh entry for the next back press.
      if (useOverlayStore.getState().stack.length > 0) {
        history.pushState({ overlay: true }, "");
        entryLive = true;
      }
    };
    window.addEventListener("popstate", onPopState);
    history.pushState({ overlay: true }, "");
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (entryLive) {
        entryLive = false;
        suppressed = true;
        history.back();
      }
      restoreFocus();
    };
  }, [stackEmpty]);

  if (top === null) return null;

  const close = (open: boolean) => {
    if (!open) useOverlayStore.getState().closeOverlay(top.id);
  };

  const body = (
    <div
      key={`${top.id}:${top.openedAt}`}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      {top.render()}
    </div>
  );

  if (!isDesktop) {
    return (
      <Drawer open onOpenChange={close}>
        <DrawerContent className="max-h-[100dvh]">
          <DrawerHeader className="shrink-0 text-left">
            <DrawerTitle>{top.title}</DrawerTitle>
            {top.description !== undefined && (
              <DrawerDescription>{top.description}</DrawerDescription>
            )}
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  if (top.kind === "sheet") {
    return (
      <Sheet open onOpenChange={close}>
        <SheetContent
          side={top.side ?? "right"}
          className="flex max-h-[100dvh] flex-col overflow-hidden"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>{top.title}</SheetTitle>
            {top.description !== undefined && (
              <SheetDescription>{top.description}</SheetDescription>
            )}
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="flex max-h-[100dvh] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{top.title}</DialogTitle>
          {top.description !== undefined && (
            <DialogDescription>{top.description}</DialogDescription>
          )}
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
