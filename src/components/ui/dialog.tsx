import {
  cloneElement,
  createContext,
  type DialogHTMLAttributes,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";

type ClickableChild = ReactElement<{
  onClick?: (event: MouseEvent) => void;
}>;

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextValue>({
  open: false,
  setOpen: () => undefined,
});

interface DialogProps {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Dialog({ children, open, defaultOpen, onOpenChange }: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const controlled = open !== undefined;
  const current = controlled ? open : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const contextValue = useMemo(
    () => ({ open: current, setOpen }),
    [current, setOpen],
  );
  return (
    <DialogContext.Provider value={contextValue}>
      {children}
    </DialogContext.Provider>
  );
}

function useDialog() {
  return useContext(DialogContext);
}

function DialogTrigger({ children }: { children: ReactElement }) {
  const { setOpen } = useDialog();
  // Clone (shadcn asChild-style): Preact types cloneElement props as any,
  // so the cast below keeps the "no any" rule intact on our side.
  const child = children as ClickableChild;
  const prevOnClick = child.props.onClick;
  return cloneElement(child, {
    onClick: (event: MouseEvent) => {
      prevOnClick?.(event);
      if (!event.defaultPrevented) setOpen(true);
    },
  });
}

interface DialogContentProps extends DialogHTMLAttributes<HTMLDialogElement> {
  children: ReactNode;
}

const DialogContent = forwardRef<HTMLDialogElement, DialogContentProps>(
  ({ className, children, onClose, ...props }, forwardedRef) => {
    const { open, setOpen } = useDialog();
    const innerRef = useRef<HTMLDialogElement | null>(null);

    useEffect(() => {
      const dialog = innerRef.current;
      if (dialog === null) return;
      try {
        if (open && !dialog.open) {
          // Native showModal gives focus trap + Esc handling in Chrome.
          dialog.showModal();
        } else if (!open && dialog.open) {
          dialog.close();
        }
      } catch {
        // Non-modal environments (jsdom): fall back to the `open`
        // attribute so content still renders for unit tests. Focus-trap
        // behavior is covered by the Playwright suite in real Chrome.
        if (open) dialog.setAttribute("open", "");
        else dialog.removeAttribute("open");
      }
      // Backdrop click closes. Keyboard users get the native Esc-to-close
      // (cancel event), so no JSX onClick/keyboard pairing is needed here.
      const onBackdropClick = (event: globalThis.MouseEvent) => {
        if (event.target === dialog) setOpen(false);
      };
      dialog.addEventListener("click", onBackdropClick);
      return () => {
        dialog.removeEventListener("click", onBackdropClick);
      };
    }, [open, setOpen]);

    const setRefs = (node: HTMLDialogElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef !== null && forwardedRef !== undefined) {
        forwardedRef.current = node;
      }
    };

    return (
      <dialog
        ref={setRefs}
        aria-modal="true"
        className={cn(
          "ui-surface fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg",
          className,
        )}
        onClose={(event) => {
          onClose?.(event);
          setOpen(false);
        }}
        {...props}
      >
        {children}
      </dialog>
    );
  },
);
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function DialogClose({ children }: { children: ReactElement }) {
  const { setOpen } = useDialog();
  const child = children as ClickableChild;
  const prevOnClick = child.props.onClick;
  return cloneElement(child, {
    onClick: (event: MouseEvent) => {
      prevOnClick?.(event);
      if (!event.defaultPrevented) setOpen(false);
    },
  });
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
