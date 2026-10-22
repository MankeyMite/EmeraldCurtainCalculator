// Reproduce the minimal indexed Emerald sprite/masks from the pinned pret tree.
// Usage: node scripts/extract-spinda.mjs [path/to/pokeemerald]
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pngChunks } from "./capture-lib.mjs";

const root = process.argv[2] ?? "research/pret";
const revision = "731ad5bfd6e6f265508d0efcca0ba42f9dcf5881";
if (
  execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim() !== revision
)
  throw Error(`Use the pinned pret checkout at ${revision}`);
const folder = "graphics/pokemon/spinda";
const hashes = {};
function read(name) {
  const data = fs.readFileSync(path.join(root, folder, name));
  hashes[name] = createHash("sha256").update(data).digest("hex");
  return data;
}
function indexed(name) {
  const chunks = pngChunks(read(name));
  const h = chunks.find((c) => c.type === "IHDR").data;
  const width = h.readUInt32BE(0),
    height = h.readUInt32BE(4),
    depth = h[8];
  if (![0, 3].includes(h[9]) || ![1, 2, 4, 8].includes(depth) || h[12])
    throw Error("Expected a noninterlaced indexed/monochrome PNG");
  const stride = Math.ceil((width * depth) / 8);
  const raw = inflateSync(
    Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)),
  );
  let previous = Buffer.alloc(stride),
    pos = 0;
  const pixels = [];
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++],
      row = Buffer.alloc(stride);
    if (filter > 4) throw Error("Invalid PNG filter");
    for (let x = 0; x < stride; x++) {
      const a = row[x - 1] ?? 0,
        b = previous[x],
        c = previous[x - 1] ?? 0;
      const p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      row[x] =
        (raw[pos++] +
          [
            0,
            a,
            b,
            Math.floor((a + b) / 2),
            pa <= pb && pa <= pc ? a : pb <= pc ? b : c,
          ][filter]) &
        255;
    }
    for (let x = 0; x < width; x++)
      pixels.push(
        (row[Math.floor((x * depth) / 8)] >>> (8 - depth - ((x * depth) % 8))) &
          ((1 << depth) - 1),
      );
    previous = row;
  }
  return { width, height, pixels };
}
// gMonFrontPic_Spinda uses anim_front.png, not gMonStillFrontPic_Spinda's
// front.png. The still image places the body lower relative to the spot
// origins, so using it makes all four spots appear too high in battle.
// sAnims_Spinda selects sAnim_GeneralFrame0 only.
const frontAsset = "anim_front.png";
const front = indexed(frontAsset);
if (front.width !== 64 || front.height !== 128)
  throw Error("Unexpected battle front sheet");
const bases = [
  [16, 7],
  [40, 8],
  [22, 25],
  [34, 26],
];
const spots = bases.map(([x, y], i) => {
  const png = indexed(`spots/spot_${i}.png`);
  if (png.width !== 16 || png.height !== 16)
    throw Error("Unexpected spot dimensions");
  // gbagfx -plain -data_width 2 reverses PNG scanline bytes into a
  // little-endian u16. Emerald consumes its least significant bit first.
  return {
    x,
    y,
    rows: Array.from({ length: 16 }, (_, r) =>
      png.pixels
        .slice(r * 16, r * 16 + 16)
        .reduce((bits, v, c) => bits | (v ? 1 << (15 - c) : 0), 0),
    ),
  };
});
const palette = read("normal.pal")
  .toString()
  .trim()
  .split(/\r?\n/)
  .slice(3)
  .map((line) => line.split(/\s+/).map(Number));
const shinyPalette = read("shiny.pal")
  .toString()
  .trim()
  .split(/\r?\n/)
  .slice(3)
  .map((line) => line.split(/\s+/).map(Number));
fs.writeFileSync(
  "src/data/spinda.json",
  JSON.stringify({
    source: "pret/pokeemerald",
    revision,
    hashes,
    width: 64,
    height: 64,
    frontAsset,
    frontFrame: 0,
    pixels: front.pixels.slice(0, 64 * 64),
    palette,
    shinyPalette,
    spots,
  }) + "\n",
);
console.log(
  "Extracted Emerald Spinda front frame, palettes and four 16x16 masks.",
);
