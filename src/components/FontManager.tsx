import { Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addFont,
  deleteFont,
  type FontRecord,
  FontValidationError,
  listFonts,
  setSetting,
} from "../storage";
import { LAST_CUSTOM_FONT_KEY } from "./paletteGlyphs";
import { Button } from "./ui/button";

export interface FontPanelProps {
  defaultFont: string;
  onDefaultFontChange: (family: string) => void;
  titleFont: string | null;
  onTitleFontChange: (family: string | null) => void;
  /** Refreshes app-level lists (toolbar families) after mutations. */
  onChanged: () => void;
}

/** Content-only panel: the overlay manager provides the sheet shell. */
export function FontPanel({
  defaultFont,
  onDefaultFontChange,
  titleFont,
  onTitleFontChange,
  onChanged,
}: FontPanelProps) {
  const [fonts, setFonts] = useState<FontRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setFonts(await listFonts());
    })();
  }, []);

  const reload = async () => {
    setFonts(await listFonts());
    onChanged();
  };

  const handleUpload = async (file: File) => {
    setError(null);
    try {
      const record = await addFont(file);
      await setSetting(LAST_CUSTOM_FONT_KEY, record.family);
      await reload();
      toast("Font added", {
        description: `${record.family} is ready and works offline.`,
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof FontValidationError
          ? uploadError.message
          : "That file could not be added.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <Button className="h-11" onClick={() => fileRef.current?.click()}>
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
            if (file !== undefined) void handleUpload(file);
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
          onChange={(event) => onDefaultFontChange(event.currentTarget.value)}
          className="h-11 rounded-md border border-input bg-background px-2 text-sm"
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
          className="h-11 rounded-md border border-input bg-background px-2 text-sm"
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
            className="flex min-h-11 items-center gap-2 rounded-md border border-border px-2 py-1.5"
          >
            <span
              className="min-w-0 flex-1 truncate text-base"
              style={{ fontFamily: `"${font.family}", sans-serif` }}
            >
              {font.family}
            </span>
            {confirmDelete === font.id ? (
              <>
                <Button
                  className="h-11"
                  variant="destructive"
                  onClick={() => {
                    void (async () => {
                      await deleteFont(font.id);
                      setConfirmDelete(null);
                      await reload();
                      toast("Font deleted", {
                        description:
                          "Existing text keeps the font name and falls back until the font is re-added.",
                      });
                    })();
                  }}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => setConfirmDelete(null)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="size-11"
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
  );
}
