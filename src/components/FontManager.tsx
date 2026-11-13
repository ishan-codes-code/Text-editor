import { Trash2, Upload } from "lucide-preact";
import { useRef, useState } from "react";
import type { FontRecord } from "../storage";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export interface FontManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fonts: FontRecord[];
  defaultFont: string;
  onDefaultFontChange: (family: string) => void;
  titleFont: string | null;
  onTitleFontChange: (family: string | null) => void;
  error: string | null;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
}

/** Lazy-loaded (see App): heavy dialog kept out of the core chunk. */
export function FontManager({
  open,
  onOpenChange,
  fonts,
  defaultFont,
  onDefaultFontChange,
  titleFont,
  onTitleFontChange,
  error,
  onUpload,
  onDelete,
}: FontManagerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Fonts</SheetTitle>
          <SheetDescription>
            Uploaded TTF/OTF fonts work offline. Kruti Dev is added like any
            other font.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Upload font (.ttf, .otf)
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".ttf,.otf,font/ttf,font/otf"
              className="hidden"
              aria-label="Choose font file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file !== undefined) onUpload(file);
              }}
            />
            {error !== null && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Max 5 MB. Validated before saving.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-medium" htmlFor="default-font-select">
              Default font for new text
            </label>
            <select
              id="default-font-select"
              value={defaultFont}
              onChange={(event) =>
                onDefaultFontChange(event.currentTarget.value)
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">System default</option>
              {fonts.map((font) => (
                <option key={font.id} value={font.family}>
                  {font.family}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-medium" htmlFor="title-font-select">
              Title font for this document
            </label>
            <select
              id="title-font-select"
              value={titleFont ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onTitleFontChange(value === "" ? null : value);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">System default</option>
              {fonts.map((font) => (
                <option key={font.id} value={font.family}>
                  {font.family}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-medium">Uploaded fonts ({fonts.length})</p>
            {fonts.length === 0 && (
              <p className="text-muted-foreground">
                No fonts yet. Upload your TTF to type Hindi with Kruti Dev.
              </p>
            )}
            {fonts.map((font) => (
              <div
                key={font.id}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <span
                  className="min-w-0 flex-1 truncate text-base"
                  style={{ fontFamily: `"${font.family}", sans-serif` }}
                >
                  {font.family}
                </span>
                {confirmDelete === font.id ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Text keeps this font until re-added.
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        onDelete(font.id);
                        setConfirmDelete(null);
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete font ${font.family}`}
                    title="Delete font (text keeps the font name until re-added)"
                    onClick={() => setConfirmDelete(font.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
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
