import type { CurtainLab } from "../hooks/useCurtainLab";
import { allowedValues } from "../core/constraints";
import { pixelAddress } from "../core/tiles";
import { windowLayout } from "../core/window";

/** Only exhaustive candidate sets may refine order projections. SID RNG
 * witnesses and marginal PID digits never establish a permutation. */
export function workbenchOrders(lab: CurtainLab): number[] {
  if (lab.mode === "renderer")
    return lab.imported ? [lab.imported.pid % 24] : [];
  if (lab.inference.consistent === false) return [];
  if (lab.sidAnalysis)
    return [...new Set(lab.sidAnalysis.candidates.map((h) => h.pid % 24))].sort(
      (a, b) => a - b,
    );
  const orders = lab.inference.orders ?? [
    ...new Set(lab.inference.pidValues?.map((pid) => pid % 24)),
  ];
  const pids = lab.sidRngResult?.pidValues;
  return Array.isArray(pids)
    ? orders.filter((o) => pids.some((pid) => pid % 24 === o))
    : orders;
}

/** Conservative logical-byte EV projections; never substitute zero for an
 * unknown field. Recovery nibble unions can retain extra byte combinations. */
export function workbenchEvs(lab: CurtainLab): number[][] {
  if (lab.mode === "renderer" && lab.imported)
    return lab.imported.evs.map((v) => [v]);
  const plain = lab.recovery?.plaintext ?? lab.inference.plaintextMasks;
  return Array.from({ length: 6 }, (_, i) => {
    const known = lab.mode === "renderer" ? undefined : lab.facts?.evs?.[i];
    const byteValues = lab.inference.plaintextByteValues?.[24 + i];
    const supported = byteValues && new Set(byteValues);
    const lo = plain?.[48 + i * 2] ?? 65535,
      hi = plain?.[49 + i * 2] ?? 65535;
    return allowedValues(lo)
      .flatMap((low) => allowedValues(hi).map((high) => low | (high << 4)))
      .filter(
        (v) =>
          (known == null || v === known) && (!supported || supported.has(v)),
      )
      .sort((a, b) => a - b);
  });
}
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
// A tighter viewport, not a new mapping: retain every main-record pixel and
// crop only neighboring records and decorative school artwork.
const recordHits = Array.from({ length: 160 }, (_, n) => hitForNibble(n + 16)!);
const recordX = Math.min(...recordHits.map((h) => h.displayX)),
  recordY = Math.min(...recordHits.map((h) => h.displayY));
const recordLayout = {
  placements: stripLayout().placements,
  bounds: {
    x: recordX,
    y: recordY,
    w: Math.max(...recordHits.map((h) => h.displayX)) - recordX + 1,
    h: Math.max(...recordHits.map((h) => h.displayY)) - recordY + 1,
  },
};
export function recordStripLayout() {
  return recordLayout;
}
export function digit(mask: number) {
  const values = allowedValues(mask);
  return values.length === 1
    ? values[0].toString(16).toUpperCase()
    : mask
      ? "?"
      : "!";
}
