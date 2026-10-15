import background from "../data/school-background.json";
import { ROOM_PLACEMENTS, pixelAddress, type Placement } from "./tiles";

export type WindowScope = "left" | "right" | "both";
export function windowLayout(scope: WindowScope) {
  return {
    placements: ROOM_PLACEMENTS.filter(
      (p) => scope === "both" || (scope === "left" ? p.mapX < 4 : p.mapX > 4),
    ),
    bounds:
      scope === "both"
        ? { x: 0, y: 0, w: 192, h: 48 }
        : { x: scope === "left" ? 16 : 144, y: 8, w: 32, h: 32 },
  };
}
export function backgroundColor(x: number, y: number): string {
  return background.pixels[y * background.width + x] ?? "#ffffff";
}
// Frames and window panes are decorative static ROM pixels. Only the six
// leak-tile rectangles in a window may create observations.
export function curtainHit(
  placements: Placement[],
  x: number,
  y: number,
  mainOnly = false,
) {
  const t = placements.find(
    (p) => x >= p.x && x < p.x + 8 && y >= p.y && y < p.y + 8,
  );
  const hit = t
    ? {
        ...pixelAddress(t.tile, x - t.x, y - t.y, t.hflip, t.vflip),
        displayX: x,
        displayY: y,
        flipped: t.hflip,
      }
    : null;
  return mainOnly && hit?.slot !== 5 ? null : hit;
}
