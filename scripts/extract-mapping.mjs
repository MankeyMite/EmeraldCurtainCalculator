// Reproducible extraction from a pinned pret checkout. No ROM required.
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = "research/pret";
const read = (p) => fs.readFileSync(path.join(root, p));
const sha = (b) => createHash("sha256").update(b).digest("hex");
// Preserve palette INDICES: RGBA decoders lose indices when colors are duplicated.
function indexedPng(buffer) {
  let w,
    h,
    depth,
    color,
    data = [];
  for (let p = 8; p < buffer.length;) {
    const n = buffer.readUInt32BE(p),
      type = buffer.toString("ascii", p + 4, p + 8),
      b = buffer.subarray(p + 8, p + 8 + n);
    if (type === "IHDR") {
      w = b.readUInt32BE(0);
      h = b.readUInt32BE(4);
      depth = b[8];
      color = b[9];
      if (b[12]) throw Error("Interlaced PNG unsupported");
    }
    if (type === "IDAT") data.push(b);
    p += n + 12;
  }
  if (color !== 3 || ![4, 8].includes(depth))
    throw Error("Expected indexed 4/8-bit PNG");
  const packed = inflateSync(Buffer.concat(data)),
    stride = Math.ceil((w * depth) / 8),
    rows = [];
  let prev = new Uint8Array(stride),
    p = 0;
  const paeth = (a, b, c) => {
    const v = a + b - c,
      x = Math.abs(v - a),
      y = Math.abs(v - b),
      z = Math.abs(v - c);
    return x <= y && x <= z ? a : y <= z ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const filter = packed[p++],
      row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = row[x - 1] ?? 0,
        b = prev[x],
        c = prev[x - 1] ?? 0;
      const predictors = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)];
      if (filter > 4) throw Error("Invalid PNG filter");
      row[x] = (packed[p++] + predictors[filter]) & 255;
    }
    rows.push(
      Array.from({ length: w }, (_, x) =>
        depth === 8 ? row[x] : (row[x >> 1] >> (x % 2 === 0 ? 4 : 0)) & 15,
      ),
    );
    prev = row;
  }
  return { w, h, rows };
}
const school = indexedPng(
  read("data/tilesets/secondary/pokemon_school/tiles.png"),
);
const building = indexedPng(read("data/tilesets/primary/building/tiles.png"));
function pixel(tile, x, y, hflip = false, vflip = false) {
  const img = tile < 512 ? building : school,
    i = tile < 512 ? tile : tile - 512;
  const tx = i % (img.w / 8),
    ty = Math.floor(i / (img.w / 8));
  return (
    img.rows[ty * 8 + (vflip ? 7 - y : y)]?.[tx * 8 + (hflip ? 7 - x : x)] ??
    null
  );
}
const pal = (n) =>
  read(
    `data/tilesets/secondary/pokemon_school/palettes/${String(n).padStart(2, "0")}.pal`,
  )
    .toString()
    .trim()
    .split(/\r?\n/)
    .slice(3)
    .map((s) => s.split(" ").map(Number));
const metatiles = read("data/tilesets/secondary/pokemon_school/metatiles.bin");
const attributes = read(
  "data/tilesets/secondary/pokemon_school/metatile_attributes.bin",
);
const map = read("data/layouts/RustboroCity_PokemonSchool/map.bin");
const entries = [],
  occurrences = [];
for (let i = 0; i < metatiles.length / 16; i++) {
  const words = Array.from({ length: 8 }, (_, j) =>
    metatiles.readUInt16LE(i * 16 + j * 2),
  );
  if (words.some((v) => [791, 792, 793].includes(v & 1023)))
    entries.push({
      metatile: i,
      layerType: attributes.readUInt16LE(i * 2) >> 12,
      words,
    });
}
for (let y = 0; y < 11; y++)
  for (let x = 0; x < 12; x++) {
    const mid = (map.readUInt16LE((y * 12 + x) * 2) & 1023) - 512,
      entry = entries.find((e) => e.metatile === mid);
    if (!entry) continue;
    for (let j = 0; j < 8; j++) {
      const word = entry.words[j],
        tile = word & 1023;
      if (![791, 792, 793].includes(tile)) continue;
      if (j < 4 || entry.layerType !== 1) throw Error("Revisit BG ordering");
      const under = entry.words[j - 4],
        underPal = pal(under >> 12),
        blackUnderlay = [];
      for (let py = 0; py < 8; py++)
        for (let px = 0; px < 8; px++) {
          const index = pixel(
            under & 1023,
            px,
            py,
            !!(under & 1024),
            !!(under & 2048),
          );
          if (index === null) throw Error("Missing underlying tile");
          blackUnderlay.push(
            index !== 0 && underPal[index].every((c) => c === 0),
          );
        }
      occurrences.push({
        id: `${x},${y}:${j}`,
        metatile: mid,
        mapX: x,
        mapY: y,
        x: x * 16 + ((j - 4) % 2) * 8,
        y: y * 16 + Math.floor((j - 4) / 2) * 8,
        tile,
        hflip: !!(word & 1024),
        vflip: !!(word & 2048),
        palette: word >> 12,
        underTile: under & 1023,
        blackUnderlay,
      });
    }
  }
if (!pal(8).every((rgb) => rgb.every((c) => c === 0)))
  throw Error("Palette 8 changed");
if (
  !Array.from({ length: 64 }, (_, i) =>
    pixel(0, i % 8, Math.floor(i / 8)),
  ).every((n) => n === 0)
)
  throw Error("BG1 tile 0 is not transparent");
const files = [
  "data/tilesets/secondary/pokemon_school/metatiles.bin",
  "data/tilesets/secondary/pokemon_school/metatile_attributes.bin",
  "data/tilesets/secondary/pokemon_school/palettes/08.pal",
  "data/tilesets/secondary/pokemon_school/palettes/06.pal",
  "data/tilesets/secondary/pokemon_school/tiles.png",
  "data/tilesets/primary/building/tiles.png",
  "data/layouts/RustboroCity_PokemonSchool/map.bin",
];
const result = {
  version: "pret-school-v1-zero-aslr",
  commit: "731ad5bfd6e6f265508d0efcca0ba42f9dcf5881",
  width: 192,
  height: 48,
  entries,
  occurrences,
  hashes: Object.fromEntries(files.map((f) => [f, sha(read(f))])),
  palette8: pal(8),
  topBackgroundTile0Transparent: true,
};
// Static school art below the leaked tiles. Keep it separate from all
// observations: window frames and pane bars must never constrain leaked bytes.
const primaryMeta = read("data/tilesets/primary/building/metatiles.bin");
const primaryAttrs = read(
  "data/tilesets/primary/building/metatile_attributes.bin",
);
const paletteFiles = Array.from(
  { length: 13 },
  (_, n) =>
    `data/tilesets/${n < 6 ? "primary/building" : "secondary/pokemon_school"}/palettes/${String(n).padStart(2, "0")}.pal`,
);
const palettes = paletteFiles.map((f) =>
  read(f)
    .toString()
    .trim()
    .split(/\r?\n/)
    .slice(3)
    .map((s) => s.split(" ").map(Number)),
);
const rgb555 = (rgb) =>
  "#" +
  rgb
    .map((c) => {
      const n = c >> 3;
      return ((n << 3) | (n >> 2)).toString(16).padStart(2, "0");
    })
    .join("");
const backgroundPixels = [];
for (let y = 0; y < 48; y++)
  for (let x = 0; x < 192; x++) {
    const mid =
      map.readUInt16LE((Math.floor(y / 16) * 12 + Math.floor(x / 16)) * 2) &
      1023;
    const meta = mid < 512 ? primaryMeta : metatiles,
      attr = mid < 512 ? primaryAttrs : attributes,
      i = mid < 512 ? mid : mid - 512;
    const layerType = attr.readUInt16LE(i * 2) >> 12,
      quadrant = Math.floor((y % 16) / 8) * 2 + Math.floor((x % 16) / 8);
    let color = "#ffffff";
    const draw = (word) => {
      const tile = word & 1023;
      if ([791, 792, 793].includes(tile)) return;
      const n = pixel(tile, x % 8, y % 8, !!(word & 1024), !!(word & 2048));
      if (n === null) throw Error(`Missing static tile ${tile}`);
      if (n !== 0) color = rgb555(palettes[word >> 12][n]);
    };
    if (layerType === 0) draw(0x3014); // NORMAL background base from DrawMetatile
    draw(meta.readUInt16LE(i * 16 + quadrant * 2));
    draw(meta.readUInt16LE(i * 16 + (quadrant + 4) * 2));
    backgroundPixels.push(color);
  }
const artFiles = [
  ...files,
  ...paletteFiles,
  "data/tilesets/primary/building/metatiles.bin",
  "data/tilesets/primary/building/metatile_attributes.bin",
];
const background = {
  commit: result.commit,
  width: 192,
  height: 48,
  pixels: backgroundPixels,
  hashes: Object.fromEntries(artFiles.map((f) => [f, sha(read(f))])),
};
fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(
  "src/data/school-background.json",
  JSON.stringify(background) + "\n",
);
fs.writeFileSync(
  "src/data/mapping.json",
  JSON.stringify(result, null, 2) + "\n",
);
fs.mkdirSync("research/fixtures", { recursive: true });
for (const file of files) {
  fs.writeFileSync(
    "research/fixtures/" +
      path.basename(path.dirname(file)) +
      "-" +
      path.basename(file),
    read(file),
  );
}
console.log(
  JSON.stringify(
    {
      entries,
      occurrences: occurrences.map(({ blackUnderlay, ...o }) => ({
        ...o,
        ambiguousUnderlayPixels: blackUnderlay.filter(Boolean).length,
      })),
    },
    null,
    2,
  ),
);
