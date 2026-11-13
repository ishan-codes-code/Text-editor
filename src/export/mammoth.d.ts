declare module "mammoth" {
  export interface MammothResult {
    value: string;
    messages: { type: string; message: string }[];
  }
  export function convertToHtml(
    input:
      | { arrayBuffer: ArrayBuffer }
      | { buffer: Uint8Array }
      | { path: string },
    options?: unknown,
  ): Promise<MammothResult>;
  export function extractRawText(
    input:
      | { arrayBuffer: ArrayBuffer }
      | { buffer: Uint8Array }
      | { path: string },
    options?: unknown,
  ): Promise<MammothResult>;
}
