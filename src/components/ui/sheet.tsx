import { cva, type VariantProps } from "class-variance-authority";
import type { DialogHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const sheetVariants = cva("", {
  variants: {
    side: {
      // Each side overrides DialogContent's centering; twMerge keeps the
      // later conflicting class (left-1/2 -> left-auto, etc.).
      right:
        "top-1/2 left-auto right-4 h-auto max-h-[calc(100%-2rem)] -translate-x-0 -translate-y-1/2",
      left: "top-1/2 left-4 right-auto h-auto max-h-[calc(100%-2rem)] -translate-x-0 -translate-y-1/2",
      bottom:
        "top-auto bottom-4 max-h-[80vh] w-[calc(100%-2rem)] -translate-y-0",
    },
  },
  defaultVariants: {
    side: "right",
  },
});

interface SheetContentProps
  extends DialogHTMLAttributes<HTMLDialogElement>,
    VariantProps<typeof sheetVariants> {
  children: ReactNode;
}

function SheetContent({
  className,
  side = "right",
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogContent
      className={cn(
        "w-[calc(100%-2rem)] max-w-sm overflow-y-auto sm:max-w-md",
        side === "bottom" && "max-w-2xl",
        sheetVariants({ side }),
        className,
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

export {
  Dialog as Sheet,
  DialogClose as SheetClose,
  DialogDescription as SheetDescription,
  DialogFooter as SheetFooter,
  DialogHeader as SheetHeader,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
  SheetContent,
};
