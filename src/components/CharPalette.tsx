import { useState } from "react";
import { fontFamilyWithFallback } from "../lib/fontCss";
import { PALETTE_GLYPHS } from "./paletteGlyphs";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

/**
 * Special-character palette (TRD F14, Must). Alt+numpad codes do not exist on
 * Android, so this is the only way to reach some Kruti Dev glyphs: each cell
 * renders in the active font and inserts at the cursor with one tap.
 */
export { MAX_RECENT_GLYPHS, PALETTE_GLYPHS } from "./paletteGlyphs";

export interface CharPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Family the glyphs render in; null falls back to the UI font. */
  activeFamily: string | null;
  recent: string[];
  onInsert: (glyph: string) => void;
}

/** Lazy-loaded (see App): heavy dialog kept out of the core chunk. */
export function CharPalette({
  open,
  onOpenChange,
  activeFamily,
  recent,
  onInsert,
}: CharPaletteProps) {
  const [query, setQuery] = useState("");
  const glyphs =
    query === ""
      ? PALETTE_GLYPHS
      : PALETTE_GLYPHS.filter((glyph) => glyph.includes(query));

  const renderRow = (label: string, items: readonly string[]) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-8 gap-1">
        {items.map((glyph) => (
          <button
            key={glyph}
            type="button"
            aria-label={`Insert ${glyph}`}
            title={`Insert ${glyph}`}
            onClick={() => onInsert(glyph)}
            style={
              activeFamily !== null
                ? { fontFamily: fontFamilyWithFallback(activeFamily) }
                : undefined
            }
            className="flex h-10 items-center justify-center rounded-md border border-border text-lg hover:bg-accent active:bg-accent"
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Special characters</SheetTitle>
          <SheetDescription>
            {activeFamily !== null
              ? `Shown in ${activeFamily}. Tap to insert at the cursor.`
              : "Tap to insert at the cursor."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4">
          <input
            type="search"
            aria-label="Filter symbols"
            placeholder="Filter symbols"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          {recent.length > 0 && renderRow("Recently used", recent)}
          {renderRow("Symbols", glyphs)}
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
