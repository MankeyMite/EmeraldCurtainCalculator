export function crc32(buffer: Uint8Array): number;
export function pngChunks(buffer: Buffer): {
  type: string;
  data: Buffer;
  raw: Buffer;
}[];
export function decodeRgbPng(buffer: Uint8Array): {
  width: number;
  height: number;
  pixels: Uint8Array;
  chunks: { type: string; data: Uint8Array; raw: Uint8Array }[];
};
