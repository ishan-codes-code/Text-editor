import { useRef, useState } from "react";
import { Button } from "./ui/button";

export interface SettingsPanelProps {
  persisted: boolean | null;
  keepColors: boolean;
  onKeepColorsChange: (value: boolean) => void;
  lastBackup: number | null;
  onBackup: () => void;
  onRestoreFile: (file: File, mode: "merge" | "replace") => Promise<void>;
}

/** Content-only panel: the overlay manager provides the sheet shell. */
export function SettingsPanel({
  persisted,
  keepColors,
  onKeepColorsChange,
  lastBackup,
  onBackup,
  onRestoreFile,
}: SettingsPanelProps) {
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoring, setRestoring] = useState(false);
  const backupFileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col gap-4 text-sm">
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
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={keepColors}
          onChange={(event) => onKeepColorsChange(event.currentTarget.checked)}
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
        <div className="flex flex-wrap gap-2">
          <Button className="h-11" onClick={() => void onBackup()}>
            Back up now
          </Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => backupFileRef.current?.click()}
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
              if (file === undefined) return;
              setRestoring(true);
              void onRestoreFile(file, restoreMode).finally(() => {
                setRestoring(false);
              });
            }}
          />
        </div>
        <fieldset className="flex gap-4">
          <legend className="sr-only">Restore mode</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              className="size-5"
              name="restore-mode"
              checked={restoreMode === "merge"}
              onChange={() => setRestoreMode("merge")}
            />
            Merge
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              className="size-5"
              name="restore-mode"
              checked={restoreMode === "replace"}
              onChange={() => setRestoreMode("replace")}
            />
            Replace
          </label>
        </fieldset>
      </div>
    </div>
  );
}
