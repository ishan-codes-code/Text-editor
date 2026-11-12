import type { DocListItem } from "../storage/documents";
import { DocList } from "./DocList";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export interface DocsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docs: DocListItem[];
  activeId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Lazy-loaded (see App): keeps Radix out of the core chunk. */
export function DocsSheet(props: DocsSheetProps) {
  const { open, onOpenChange, ...listProps } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Documents</SheetTitle>
          <SheetDescription>
            Create, open, rename, duplicate, delete and search.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <DocList {...listProps} />
        </div>
        <div className="mt-4 flex justify-end">
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
