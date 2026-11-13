import { Download, Printer, Upload } from "lucide-react";
import { Button } from "./ui/button";

export type ExportFormat = "pdf" | "docx" | "txt" | "md";

export interface ExportPanelProps {
  docTitle: string;
  busy: string | null;
  onExport: (format: ExportFormat) => void;
  importFileRef: { readonly current: HTMLInputElement | null };
  onImportClick: () => void;
  onImportFile: (file: File) => void;
}

/** Content-only panel: the overlay manager provides the shell. */
export function ExportPanel({
  docTitle,
  busy,
  onExport,
  importFileRef,
  onImportClick,
  onImportFile,
}: ExportPanelProps) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <p className="font-medium">
          Export &ldquo;{docTitle}&rdquo; (works offline)
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="h-11"
            variant="outline"
            disabled={busy !== null}
            onClick={() => onExport("pdf")}
          >
            <Printer className="size-4" /> {busy === "pdf" ? "…" : "PDF"}
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={busy !== null}
            onClick={() => onExport("docx")}
          >
            <Download className="size-4" /> {busy === "docx" ? "…" : "DOCX"}
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={busy !== null}
            onClick={() => onExport("txt")}
          >
            <Download className="size-4" /> {busy === "txt" ? "…" : "TXT"}
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={busy !== null}
            onClick={() => onExport("md")}
          >
            <Download className="size-4" /> {busy === "md" ? "…" : "Markdown"}
          </Button>
        </div>
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          <li>
            PDF embeds the loaded fonts, so Kruti Dev always prints correctly.
          </li>
          <li>DOCX names the fonts; the reader must have them installed.</li>
          <li>TXT exports Kruti Dev as raw Latin characters (known limit).</li>
          <li>Markdown is lossy for fonts, sizes and colors.</li>
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-medium">Import as a new document</p>
        <Button
          className="h-11"
          variant="outline"
          disabled={busy !== null}
          onClick={onImportClick}
        >
          <Upload className="size-4" />{" "}
          {busy === "import" ? "Importing…" : "Choose TXT, Markdown or DOCX…"}
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
          DOCX formatting is approximated and images are dropped in v1; fonts
          match by name where the family is installed.
        </p>
      </div>
    </div>
  );
}
