import mapping from "../data/mapping.json";
import { type Memory, sourceAt } from "./memory";
export const MAPPING = mapping;
export type Placement = {
  id: string;
  x: number;
  y: number;
  tile: number;
  hflip: boolean;
  vflip: boolean;
};
export const RAW_PLACEMENTS: Placement[] = [791, 792, 793].map((tile, i) => ({
  id: `raw-${tile}`,
  tile,
  x: i * 10,
  y: 0,
  hflip: false,
  vflip: false,
}));
export const ROOM_PLACEMENTS = mapping.occurrences;
export function pixelAddress(
  tile: number,
  x: number,
  y: number,
  hflip = false,
  vflip = false,
) {
  if (
    ![791, 792, 793].includes(tile) ||
    ![x, y].every((n) => Number.isInteger(n) && n >= 0 && n < 8)
  )
    throw Error("Invalid tile pixel");
  const sx = hflip ? 7 - x : x,
    sy = vflip ? 7 - y : y,
    byte = (tile - 791) * 32 + sy * 4 + Math.floor(sx / 2),
    side = sx % 2;
  return {
    tile,
    x: sx,
    y: sy,
    byte,
    side,
    nibble: byte * 2 + side,
    ...sourceAt(byte),
  };
}
export function nibbleValue(memory: Memory, index: number): number | null {
  const b = memory[Math.floor(index / 2)];
  return b === null || b === undefined ? null : (b >> ((index % 2) * 4)) & 15;
}
export function decodeTile(
  memory: Memory,
  tile: number,
  hflip = false,
  vflip = false,
) {
  return Array.from({ length: 64 }, (_, i) =>
    nibbleValue(
      memory,
      pixelAddress(tile, i % 8, Math.floor(i / 8), hflip, vflip).nibble,
    ),
  );
}
// All 192 unique nibbles appear unobscured in the static school BGs.
// Sprite overlays, camera clipping, fades and other runtime state are not modeled.
export const VISIBLE_NIBBLES = new Set(
  ROOM_PLACEMENTS.flatMap((p) =>
    Array.from(
      { length: 64 },
      (_, i) =>
        pixelAddress(p.tile, i % 8, Math.floor(i / 8), p.hflip, p.vflip).nibble,
    ),
  ),
);
