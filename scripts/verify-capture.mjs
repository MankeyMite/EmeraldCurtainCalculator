import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readMgbaState, verifyCurtainPixels, crc32 } from "./capture-lib.mjs";

const input = process.argv[2] ?? "research/captures/dots-ss8.png";
const out = process.argv[3] ?? "research/fixtures/emulator-ss8";
const buffer = fs.readFileSync(input),
  { state, image, displayPng } = readMgbaState(buffer),
  c = verifyCurtainPixels(state, image);
assert.equal(c.occurrences.length, 12);
assert.equal(c.pixelSamples.length, 768);
assert.deepEqual(c.mismatches, []);
assert.ok(
  c.tileBytes.equals(c.region),
  "Actual VRAM must equal records read through the actual storage pointer",
);
assert.ok(c.palette.subarray(0x100, 0x120).every((n) => n === 0));
const occupied = Array.from({ length: 30 }, (_, i) =>
  c.ewram
    .subarray(
      c.storagePointer - 0x02000000 + 4 + (7 * 30 + i) * 80,
      c.storagePointer - 0x02000000 + 4 + (7 * 30 + i + 1) * 80,
    )
    .some((n) => n !== 0)
    ? i + 1
    : null,
).filter((n) => n !== null);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const romPath = process.argv[4];
const rom = romPath ? fs.readFileSync(romPath) : null;
const romSha1 = rom ? createHash("sha1").update(rom).digest("hex") : null;
assert.equal(
  state.readUInt32LE(8),
  0x1f1c08fb,
  "Expected original English Emerald ROM CRC32",
);
if (rom) {
  assert.equal(
    crc32(rom),
    state.readUInt32LE(8),
    "ROM does not match state CRC32",
  );
  assert.equal(
    romSha1,
    "f3ae088181bf583e55daf962a92bb46f4f1d07b7",
    "Expected pret original ROM SHA-1",
  );
}
const report = {
  capture: path.basename(input),
  emulator: "mGBA GBA state version 7 (0.10.3 compatible)",
  romSha1,
  romCrc32: state.readUInt32LE(8),
  stateSha256: sha(buffer),
  storagePointer: c.storagePointer,
  relocation: c.storagePointer - 0x02029808,
  liveRegionStart: c.storagePointer + 4 + (7 * 30 + 3) * 80 + 72,
  vramStart: 0x06000000 + c.charBase + 791 * 32,
  heapMatchingRegionStart: 0x02008f90,
  heapMatch: c.ewram.subarray(0x8f90, 0x8ff0).equals(c.region),
  occupiedBox8Slots: occupied,
  bgControls: c.controls,
  bg2Scroll: { x: c.scrollX, y: c.scrollY },
  occurrences: c.occurrences,
  byteMatches: 96,
  byteContradictions: 0,
  screenPixelMatches: 768,
  screenPixelContradictions: 0,
  recordSha256: sha(c.records[5]),
  vramSha256: sha(c.tileBytes),
  pixelSamples: c.pixelSamples,
};
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "screen.png"), displayPng);
fs.writeFileSync(path.join(out, "vram96.bin"), c.tileBytes);
fs.writeFileSync(
  path.join(out, "palette8.bin"),
  c.palette.subarray(0x100, 0x120),
);
for (const slot of [4, 5, 6])
  fs.writeFileSync(path.join(out, `slot${slot}.ek3`), c.records[slot]);
fs.writeFileSync(
  path.join(out, "evidence.json"),
  JSON.stringify(report, null, 2) + "\n",
);
// Observations come from actual screenshot RGB, never candidate/VRAM values.
const observations = Array(192).fill(-1);
for (const sample of c.pixelSamples) {
  const i = sample.byte * 2 + sample.side,
    value = sample.black ? 1 : 0;
  assert.ok(
    observations[i] === -1 || observations[i] === value,
    "Screen aliases disagree",
  );
  observations[i] = value;
}
fs.writeFileSync(
  path.join(out, "observations.json"),
  JSON.stringify(
    {
      format: "emerald-curtain-observations",
      schemaVersion: 1,
      mappingVersion: "pret-school-v1-zero-aslr",
      observations,
      knownFacts: {
        notes: `Native screenshot ${path.basename(input)}; 768 screen appearances, 192 unique nibbles. No candidate facts supplied.`,
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    { ...report, pixelSamples: undefined, occurrences: undefined },
    null,
    2,
  ),
);
