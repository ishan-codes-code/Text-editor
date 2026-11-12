import { Check } from "lucide-preact";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onUrlChange: (url: string) => void;
  onApply: () => void;
}

/** Lazy-loaded (see App): keeps Radix out of the core chunk. */
export function LinkDialog({
  open,
  onOpenChange,
  url,
  onUrlChange,
  onApply,
}: LinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add link</DialogTitle>
          <DialogDescription>
            Enter the URL for the selected text (Ctrl+K).
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm">
          URL
          <input
            type="url"
            value={url}
            placeholder="https://example.com"
            onChange={(event) => onUrlChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onApply();
            }}
            className="h-9 rounded-md border border-input bg-background px-2"
          />
        </label>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={onApply}>
            <Check className="size-4" /> Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
