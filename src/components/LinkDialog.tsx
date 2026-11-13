import { useState } from "react";
import { Button } from "./ui/button";

export interface LinkFormProps {
  initialUrl: string;
  onApply: (url: string) => void;
}

/** Content-only panel: the overlay manager provides the dialog shell. */
export function LinkForm({ initialUrl, onApply }: LinkFormProps) {
  const [url, setUrl] = useState(initialUrl);
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        URL
        <input
          type="url"
          value={url}
          placeholder="https://example.com"
          onChange={(event) => setUrl(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onApply(url);
          }}
          className="h-11 rounded-md border border-input bg-background px-2"
        />
      </label>
      <div className="flex justify-end">
        <Button className="h-11" onClick={() => onApply(url)}>
          Apply
        </Button>
      </div>
    </div>
  );
}
