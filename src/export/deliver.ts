/**
 * File delivery for exports and backups. The File System Access save picker
 * is not available on Android Chrome, so this uses `<a download>` and the Web
 * Share API with files where supported (TRD). Desktop Chrome/Edge may use the
 * picker as an enhancement later; the download path works everywhere.
 */
export async function deliverFile(
  blob: Blob,
  filename: string,
  mime: string,
): Promise<"download" | "share"> {
  const file = new File([blob], filename, { type: mime });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (typeof nav.canShare === "function" && typeof nav.share === "function") {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return "share";
      }
    } catch {
      // User dismissed the sheet or share failed: fall through to download.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoking synchronously can cancel the fetch of the blob URL in some
    // browsers, so wait a tick.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return "download";
}

export function exportFileName(
  title: string,
  extension: string,
  at: number = Date.now(),
): string {
  const date = new Date(at).toISOString().slice(0, 10);
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9ऀ-ॿ]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document";
  return `${slug}-${date}.${extension}`;
}
