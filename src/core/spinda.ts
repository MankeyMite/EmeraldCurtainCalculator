import atlas from "../data/spinda.json";

export const SPINDA_SIZE = 64;
export const SPINDA_SPECIES = 308; // Emerald's internal species ID, not dex 327.
export const SPINDA_ASSETS = atlas;
export type SpotPosition = { x: number; y: number };

function uint32(pid: number) {
  if (!Number.isInteger(pid) || pid < 0 || pid > 0xffffffff)
    throw Error("PID must be an unsigned 32-bit integer");
  return pid;
}
export function spindaPositions(pid: number): SpotPosition[] {
  uint32(pid);
  return atlas.spots.map((s, i) => ({
    x: s.x + ((pid >>> (i * 8)) & 15) - 8,
    y: s.y + ((pid >>> (i * 8 + 4)) & 15) - 8,
  }));
}

/** Absolute snapped top-left position. One byte per spot, low nibble X,
 * high nibble Y. Clamp instead of wrapping at each coordinate's 16 positions. */
export function moveSpindaSpot(
  pid: number,
  spot: number,
  x: number,
  y: number,
) {
  uint32(pid);
  if (!Number.isInteger(spot) || !atlas.spots[spot] || !Number.isFinite(x + y))
    throw Error("Invalid spot position");
  const base = atlas.spots[spot],
    clamp = (v: number) => Math.max(0, Math.min(15, Math.round(v)));
  const byte = clamp(x - base.x + 8) | (clamp(y - base.y + 8) << 4);
  const shift = spot * 8;
  return ((pid & ~(255 << shift)) | (byte << shift)) >>> 0;
}

/** Exact first front frame, no horizontal mirroring. Port of Emerald's
 * DRAW_SPINDA_SPOTS: only palette indices 1..3 gain 4. Already painted
 * overlaps (5..7) remain unchanged; eyes/outlines/fixed orange are untouched.
 * u8 coordinates wrap, including the first spot's y=-1 case. */
export function renderSpinda(pid: number): Uint8Array {
  const pixels = Uint8Array.from(atlas.pixels),
    positions = spindaPositions(pid);
  atlas.spots.forEach((spot, i) => {
    const x = positions[i].x & 255,
      startY = positions[i].y & 255;
    for (let row = 0; row < 16; row++) {
      const y = (startY + row) & 255;
      for (let col = 0; col < 16; col++) {
        const px = x + col;
        if (!(spot.rows[row] & (1 << col)) || px >= 64 || y >= 64) continue;
        const n = y * 64 + px;
        if (pixels[n] >= 1 && pixels[n] <= 3) pixels[n] += 4;
      }
    }
  });
  return pixels;
}
export function spindaPattern(pid: number): Uint8Array {
  return renderSpinda(pid).map((v, n) => (v !== atlas.pixels[n] ? 1 : 0));
}

// The union of all four spots' legal positions is the only scoring region.
export const SPINDA_REGION = (() => {
  const mask = new Uint8Array(4096);
  for (let byte = 0; byte < 256; byte++) {
    const pattern = spindaPattern((byte * 0x01010101) >>> 0);
    pattern.forEach((v, n) => {
      if (v) mask[n] = 1;
    });
  }
  return mask;
})();
export const SPINDA_REGION_INDICES = Array.from(SPINDA_REGION.keys()).filter(
  (n) => SPINDA_REGION[n],
);

/** Symmetric soft Dice: 65% exact overlap, 35% overlap within 2 sprite pixels.
 * Both missing and extra spot pixels are penalized; background never scores.
 * This is visual similarity, never a probability or identity confidence. */
export function patternSimilarity(a: ArrayLike<number>, b: ArrayLike<number>) {
  let sizeA = 0,
    sizeB = 0,
    exact = 0,
    nearA = 0,
    nearB = 0;
  const near = (mask: ArrayLike<number>, n: number) => {
    const x = n % 64,
      y = Math.floor(n / 64);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (
          dx * dx + dy * dy > 4 ||
          x + dx < 0 ||
          x + dx >= 64 ||
          y + dy < 0 ||
          y + dy >= 64
        )
          continue;
        if (mask[n + dy * 64 + dx]) return true;
      }
    return false;
  };
  for (const n of SPINDA_REGION_INDICES) {
    if (a[n]) {
      sizeA++;
      if (near(b, n)) nearA++;
    }
    if (b[n]) {
      sizeB++;
      if (near(a, n)) nearB++;
    }
    if (a[n] && b[n]) exact++;
  }
  return sizeA + sizeB
    ? (100 * (0.65 * 2 * exact + 0.35 * (nearA + nearB))) / (sizeA + sizeB)
    : 100;
}

/** Distance maps make ranking thousands of masks linear in the scoring region. */
export function tolerantMask(mask: ArrayLike<number>) {
  const near = new Uint8Array(4096);
  for (const n of SPINDA_REGION_INDICES)
    if (mask[n]) {
      const x = n % 64,
        y = Math.floor(n / 64);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (
            dx * dx + dy * dy <= 4 &&
            x + dx >= 0 &&
            x + dx < 64 &&
            y + dy >= 0 &&
            y + dy < 64
          )
            near[n + dy * 64 + dx] = 1;
    }
  return near;
}
