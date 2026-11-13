import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../storage";
import {
  MAX_RECENT_GLYPHS,
  PALETTE_GLYPHS,
  PALETTE_RECENT_KEY,
} from "./paletteGlyphs";

export { MAX_RECENT_GLYPHS, PALETTE_GLYPHS } from "./paletteGlyphs";

export interface PalettePanelProps {
  /** Family the glyphs render in; null falls back to the UI font. */
  activeFamily: string | null;
  onInsert: (glyph: string) => void;
}

/**
 * Special-character palette (TRD F14, Must). Content-only panel: the overlay
 * manager provides the sheet shell. Recent glyphs are owned here so the
 * panel never shows a stale list.
 */
export function PalettePanel({ activeFamily, onInsert }: PalettePanelProps) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      setRecent(
        (await getSetting<string[]>(PALETTE_RECENT_KEY, [])).slice(
          0,
          MAX_RECENT_GLYPHS,
        ),
      );
    })();
  }, []);

  const handleInsert = (glyph: string) => {
    onInsert(glyph);
    setRecent((previous) => {
      const next = [glyph, ...previous.filter((item) => item !== glyph)].slice(
        0,
        MAX_RECENT_GLYPHS,
      );
      void setSetting(PALETTE_RECENT_KEY, next);
      return next;
    });
  };

  const glyphs =
    query === ""
      ? PALETTE_GLYPHS
      : PALETTE_GLYPHS.filter((g) => g.includes(query));

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
            onClick={() => handleInsert(glyph)}
            style={
              activeFamily !== null
                ? { fontFamily: `"${activeFamily}", sans-serif` }
                : undefined
            }
            className="flex h-11 items-center justify-center rounded-md border border-border text-lg hover:bg-accent active:bg-accent"
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        aria-label="Filter symbols"
        placeholder="Filter symbols"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        className="h-11 rounded-md border border-input bg-background px-2 text-sm"
      />
      {recent.length > 0 && renderRow("Recently used", recent)}
      {renderRow("Symbols", glyphs)}
    </div>
  );
}
