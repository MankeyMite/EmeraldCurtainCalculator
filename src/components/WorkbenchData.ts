import type { CurtainLab } from "../hooks/useCurtainLab";
import { allowedValues } from "../core/constraints";
import { pixelAddress } from "../core/tiles";
import { windowLayout } from "../core/window";
export function workbenchMasks(lab: CurtainLab) {
  if (lab.mode === "renderer") return lab.suppliedMasks;
  const masks = (lab.recovery?.masks ?? lab.inference.masks).slice();
  if (lab.sidRngSettings && lab.sidRngResult) {
    lab.sidRngResult.pidMasks.forEach((m, n) => {
      masks[n] &= m;
    });
    for (let n = 0; n < 4; n++)
      masks[12 + n] &= lab.sidRngResult.rows.reduce(
        (m, r) => m | (1 << ((r.sid >>> (n * 4)) & 15)),
        0,
      );
  }
  return masks;
}
export function stripLayout() {
  const left = windowLayout("left");
  const x = Math.min(...left.placements.map((p) => p.x));
  // Keep three columns of the actual school artwork beside the data strip.
  // Only the original tile placements can be inspected or painted.
  const sideContext = 3;
  return {
    placements: left.placements.filter((p) => p.x === x),
    bounds: { x: x - sideContext, y: 14, w: 8 + sideContext * 2, h: 26 },
  };
}
export function hitForNibble(n: number) {
  for (const p of stripLayout().placements)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const hit = pixelAddress(p.tile, x, y, p.hflip, p.vflip);
        if (hit.nibble === n)
          return {
            ...hit,
            displayX: p.x + x,
            displayY: p.y + y,
            flipped: p.hflip,
          };
      }
  return null;
}
export function digit(mask: number) {
  const values = allowedValues(mask);
  return values.length === 1
    ? values[0].toString(16).toUpperCase()
    : mask
      ? "?"
      : "!";
}
