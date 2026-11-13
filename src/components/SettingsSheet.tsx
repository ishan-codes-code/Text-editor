import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persisted: boolean | null;
  keepColors: boolean;
  onKeepColorsChange: (value: boolean) => void;
  lastBackup: number | null;
  onBackup: () => void;
  onRestoreClick: () => void;
  restoring: boolean;
  restoreMode: "merge" | "replace";
  onRestoreModeChange: (mode: "merge" | "replace") => void;
  backupFileRef: { readonly current: HTMLInputElement | null };
  onRestoreFile: (file: File) => void;
}

/** Lazy-loaded (see App): keeps Radix out of the core chunk. */
export function SettingsSheet({
  open,
  onOpenChange,
  persisted,
  keepColors,
  onKeepColorsChange,
  lastBackup,
  onBackup,
  onRestoreClick,
  restoring,
  restoreMode,
  onRestoreModeChange,
  backupFileRef,
  onRestoreFile,
}: SettingsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Storage, appearance and backup.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4 text-sm">
          <p>
            Persistent storage:{" "}
            <strong>
              {persisted === null
                ? "checking…"
                : persisted
                  ? "granted"
                  : "not granted — install the app and back up"}
            </strong>
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={keepColors}
              onChange={(event) =>
                onKeepColorsChange(event.currentTarget.checked)
              }
            />
            Keep colors when pasting
          </label>
          <div className="flex flex-col gap-2">
            <p>
              Last backup:{" "}
              <strong>
                {lastBackup === null
                  ? "never"
                  : new Date(lastBackup).toLocaleString()}
              </strong>
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={onBackup}>
                Back up now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRestoreClick}
                disabled={restoring}
              >
                {restoring ? "Restoring…" : "Restore…"}
              </Button>
              <input
                ref={backupFileRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                aria-label="Choose backup file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file !== undefined) onRestoreFile(file);
                }}
              />
            </div>
            <fieldset className="flex gap-4">
              <legend className="sr-only">Restore mode</legend>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={restoreMode === "merge"}
                  onChange={() => onRestoreModeChange("merge")}
                />
                Merge
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={restoreMode === "replace"}
                  onChange={() => onRestoreModeChange("replace")}
                />
                Replace
              </label>
            </fieldset>
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
