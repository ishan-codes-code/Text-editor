/**
 * Reads a Blob as bytes. Prefers `Blob.arrayBuffer()` and falls back to
 * FileReader so this also works in environments with an incomplete Blob
 * implementation (jsdom in tests, very old WebViews).
 */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file."));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

export async function blobToText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new TextDecoder().decode(await blobToBytes(blob));
}
