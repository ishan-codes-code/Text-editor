import { Download, Printer, Upload } from "lucide-preact";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export type ExportFormat = "pdf" | "docx" | "txt" | "md";

export interface ExportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docTitle: string;
  busy: string | null;
  onExport: (format: ExportFormat) => void;
  importFileRef: { readonly current: HTMLInputElement | null };
  onImportClick: () => void;
  onImportFile: (file: File) => void;
}

/** Lazy-loaded (see App): keeps export UI out of the core chunk. */
export function ExportSheet({
  open,
  onOpenChange,
  docTitle,
  busy,
  onExport,
  importFileRef,
  onImportClick,
  onImportFile,
}: ExportSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Export and import</SheetTitle>
          <SheetDescription>
            Export &ldquo;{docTitle}&rdquo; or import a file as a new document.
            Everything works offline.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-2">
            <p className="font-medium">Export this document</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => onExport("pdf")}
              >
                <Printer className="size-4" /> {busy === "pdf" ? "…" : "PDF"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => onExport("docx")}
              >
                <Download className="size-4" /> {busy === "docx" ? "…" : "DOCX"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => onExport("txt")}
              >
                <Download className="size-4" /> {busy === "txt" ? "…" : "TXT"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => onExport("md")}
              >
                <Download className="size-4" />{" "}
                {busy === "md" ? "…" : "Markdown"}
              </Button>
            </div>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              <li>
                PDF embeds the loaded fonts, so Kruti Dev always prints
                correctly.
              </li>
              <li>
                DOCX names the fonts; the reader must have them installed.
              </li>
              <li>
                TXT exports Kruti Dev as raw Latin characters (known limit).
              </li>
              <li>Markdown is lossy for fonts, sizes and colors.</li>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-medium">Import as a new document</p>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={onImportClick}
            >
              <Upload className="size-4" />{" "}
              {busy === "import"
                ? "Importing…"
                : "Choose TXT, Markdown or DOCX…"}
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              aria-label="Choose file to import"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file !== undefined) onImportFile(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              DOCX formatting is approximated and images are dropped in v1;
              fonts match by name where the family is installed.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <SheetClose>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
