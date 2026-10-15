import fs from "node:fs";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { parseRecord, decodePokemon, recordHex } from "../src/core/pokemon";
import { assembleMemory } from "../src/core/memory";
import { decodeTile, nibbleValue } from "../src/core/tiles";
import { windowLayout, curtainHit, backgroundColor } from "../src/core/window";
import {
  observeMemory,
  recordMasks,
  summarizeField,
} from "../src/core/constraints";
import { crc32 } from "./capture-lib.mjs";

// A research CLI. The application parser remains strictly 80 bytes.
// For an explicitly supplied 100-byte .ek3, preserve the BoxPokemon prefix
// unchanged and report the separate party extension; do not decrypt rendering data.
const [input, output, neighborDirectory] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: npx tsx scripts/render-reference.ts input.ek3 output-prefix",
  );
const original = fs.readFileSync(input);
if (![80, 100].includes(original.length))
  throw Error("Expected 80-byte boxed or 100-byte party .ek3");
const boxed = parseRecord(new Uint8Array(original.subarray(0, 80)));
const pokemon = decodePokemon(boxed);
if (original.length === 100 && !pokemon.checksumValid)
  throw Error(
    "100-byte record prefix has invalid decryption checksum; no conversion performed",
  );
const neighbors = neighborDirectory
  ? {
      4: parseRecord(
        new Uint8Array(fs.readFileSync(`${neighborDirectory}/slot4.ek3`)),
      ),
      6: parseRecord(
        new Uint8Array(fs.readFileSync(`${neighborDirectory}/slot6.ek3`)),
      ),
    }
  : {};
const memory = assembleMemory({ ...neighbors, 5: boxed }),
  layout = windowLayout("left"),
  scale = 8;
const width = layout.bounds.w * scale,
  height = layout.bounds.h * scale;
const raw = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const mx = layout.bounds.x + Math.floor(x / scale),
      my = layout.bounds.y + Math.floor(y / scale);
    const hit = curtainHit(layout.placements, mx, my),
      n = hit ? nibbleValue(memory, hit.nibble) : undefined;
    const color =
      n === null
        ? "#a4b6c3"
        : n !== undefined && n !== 0
          ? "#000000"
          : backgroundColor(mx, my);
    const index = y * (width * 3 + 1) + 1 + x * 3;
    raw[index] = parseInt(color.slice(1, 3), 16);
    raw[index + 1] = parseInt(color.slice(3, 5), 16);
    raw[index + 2] = parseInt(color.slice(5, 7), 16);
  }
function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type),
    header = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, checksum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const rows = [791, 792, 793].flatMap((tile) => {
  const pixels = decodeTile(memory, tile);
  return Array.from({ length: 8 }, (_, y) =>
    pixels
      .slice(y * 8, y * 8 + 8)
      .map((n) => (n === null ? "?" : n === 0 ? "." : "#"))
      .join(""),
  );
});
const pid = summarizeField(recordMasks(observeMemory(memory), 5), 0, 4);
const report = {
  inputBytes: original.length,
  sourceSha256: createHash("sha256").update(original).digest("hex"),
  boxedSha256: createHash("sha256").update(boxed).digest("hex"),
  pokemon,
  party:
    original.length === 100
      ? {
          status: original.readUInt32LE(80),
          level: original[84],
          hp: original.readUInt16LE(86),
          maxHP: original.readUInt16LE(88),
        }
      : null,
  pidConstraints: pid.hex,
  possiblePidValues: pid.count.toString(),
  neighborDirectory: neighborDirectory ?? null,
  missingNeighborBytes: memory.filter((b) => b === null).length,
  rows,
  originalEncryptedHex: recordHex(boxed),
};
fs.writeFileSync(`${output}-box.ek3`, boxed);
fs.writeFileSync(`${output}-window.png`, png);
fs.writeFileSync(
  `${output}-report.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
