import { inflateSync } from "node:zlib";

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function pngChunks(buffer) {
  if (
    !buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Not a PNG");
  const chunks = [];
  for (let p = 8; p < buffer.length;) {
    if (p + 12 > buffer.length) throw Error("Truncated PNG");
    const n = buffer.readUInt32BE(p);
    if (p + 12 + n > buffer.length) throw Error("Truncated PNG chunk");
    const type = buffer.toString("ascii", p + 4, p + 8),
      data = buffer.subarray(p + 8, p + 8 + n);
    if (
      crc32(buffer.subarray(p + 4, p + 8 + n)) !==
      buffer.readUInt32BE(p + 8 + n)
    )
      throw Error(`PNG CRC mismatch: ${type}`);
    chunks.push({ type, data, raw: buffer.subarray(p, p + 12 + n) });
    p += 12 + n;
    if (type === "IEND") {
      if (p !== buffer.length) throw Error("Unexpected trailing PNG data");
      break;
    }
  }
  if (chunks.at(-1)?.type !== "IEND") throw Error("Missing IEND");
  return chunks;
}
export function decodeRgbPng(buffer) {
  const chunks = pngChunks(buffer),
    h = chunks.find((c) => c.type === "IHDR")?.data;
  if (!h || h.length !== 13) throw Error("Missing PNG header");
  const width = h.readUInt32BE(0),
    height = h.readUInt32BE(4),
    depth = h[8],
    color = h[9];
  if (
    depth !== 8 ||
    ![2, 6].includes(color) ||
    h[12] !== 0 ||
    width > 4096 ||
    height > 4096
  )
    throw Error("Expected noninterlaced RGB/RGBA 8-bit PNG");
  const channels = color === 2 ? 3 : 4,
    stride = width * channels,
    packed = inflateSync(
      Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)),
      { maxOutputLength: (stride + 1) * height },
    );
  if (packed.length !== (stride + 1) * height)
    throw Error("Wrong PNG decompressed length");
  const pixels = Buffer.alloc(width * height * 3);
  let previous = Buffer.alloc(stride),
    pos = 0;
  const paeth = (a, b, c) => {
    const v = a + b - c,
      x = Math.abs(v - a),
      y = Math.abs(v - b),
      z = Math.abs(v - c);
    return x <= y && x <= z ? a : y <= z ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[pos++];
    if (filter > 4) throw Error("Unknown PNG filter");
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = row[x - channels] ?? 0,
        b = previous[x],
        c = previous[x - channels] ?? 0;
      row[x] =
        (packed[pos++] +
          [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) &
        255;
    }
    for (let x = 0; x < width; x++) {
      row.copy(pixels, (y * width + x) * 3, x * channels, x * channels + 3);
      if (channels === 4 && row[x * channels + 3] !== 255)
        throw Error("Screenshot has transparent pixels");
    }
    previous = row;
  }
  return { width, height, pixels, chunks };
}
export function readMgbaState(buffer) {
  const image = decodeRgbPng(buffer),
    gbAs = image.chunks.filter((c) => c.type === "gbAs");
  if (gbAs.length !== 1) throw Error("Expected one mGBA gbAs chunk");
  const state = inflateSync(gbAs[0].data, { maxOutputLength: 0x61000 });
  if (state.length !== 0x61000 || state.readUInt32LE(0) !== 0x01000007)
    throw Error("This importer verifies mGBA 0.10.3 GBA state version 7 only");
  if (state.toString("ascii", 28, 32) !== "BPEE")
    throw Error("Expected English Emerald BPEE");
  const displayPng = Buffer.concat([
    buffer.subarray(0, 8),
    ...image.chunks
      .filter((c) => ["IHDR", "IDAT", "IEND"].includes(c.type))
      .map((c) => c.raw),
  ]);
  return { state, image, displayPng };
}

// Independent GBA addressing using captured registers and VRAM. This code
// deliberately does not import the application's tile-placement helpers.
export function inspectCurtains(state) {
  const vram = state.subarray(0x1000, 0x19000),
    iwram = state.subarray(0x19000, 0x21000),
    ewram = state.subarray(0x21000),
    palette = state.subarray(0x800, 0xc00);
  const controls = Array.from({ length: 4 }, (_, i) =>
    state.readUInt16LE(0x400 + 8 + i * 2),
  );
  const control = controls[2],
    charBase = ((control >> 2) & 3) * 0x4000,
    mapBase = ((control >> 8) & 31) * 0x800;
  if (((control >> 14) & 3) !== 0 || (control & 0x80) !== 0)
    throw Error("Expected 32x32 4bpp BG2");
  const scrollX = state.readUInt16LE(0x418) & 511,
    scrollY = state.readUInt16LE(0x41a) & 511;
  const occurrences = [];
  for (let i = 0; i < 1024; i++) {
    const word = vram.readUInt16LE(mapBase + i * 2),
      tile = word & 1023;
    if (tile < 791 || tile > 793) continue;
    const x = ((i % 32) * 8 - scrollX + 256) % 256,
      y = (Math.floor(i / 32) * 8 - scrollY + 256) % 256;
    occurrences.push({
      tile,
      word,
      index: i,
      x,
      y,
      hflip: !!(word & 1024),
      vflip: !!(word & 2048),
      palette: word >>> 12,
      topWord: vram.readUInt16LE(((controls[1] >> 8) & 31) * 0x800 + i * 2),
      underWord: vram.readUInt16LE(((controls[3] >> 8) & 31) * 0x800 + i * 2),
    });
  }
  const storagePointer = iwram.readUInt32LE(0x5d94),
    storageOffset = storagePointer - 0x02000000;
  if (storageOffset < 0 || storageOffset + 0x83d0 > ewram.length)
    throw Error("Storage pointer is out of EWRAM bounds");
  const boxedOffset = 4 + 7 * 30 * 80,
    records = {};
  for (const slot of [4, 5, 6])
    records[slot] = ewram.subarray(
      storageOffset + boxedOffset + (slot - 1) * 80,
      storageOffset + boxedOffset + slot * 80,
    );
  const region = Buffer.concat([
      records[4].subarray(72),
      records[5],
      records[6].subarray(0, 8),
    ]),
    tileBytes = vram.subarray(charBase + 791 * 32, charBase + 794 * 32);
  return {
    vram,
    ewram,
    palette,
    controls,
    charBase,
    mapBase,
    scrollX,
    scrollY,
    occurrences,
    storagePointer,
    records,
    region,
    tileBytes,
  };
}
export function verifyCurtainPixels(state, image) {
  const c = inspectCurtains(state),
    mismatches = [],
    pixelSamples = [];
  for (const p of c.occurrences)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const screenX = p.x + x,
          screenY = p.y + y;
        if (screenX >= image.width || screenY >= image.height)
          throw Error("Curtain occurrence clipped in this capture");
        const sx = p.hflip ? 7 - x : x,
          sy = p.vflip ? 7 - y : y,
          byte = (p.tile - 791) * 32 + sy * 4 + Math.floor(sx / 2),
          side = sx % 2;
        const n = (c.region[byte] >> (side * 4)) & 15,
          offset = (screenY * image.width + screenX) * 3,
          rgb = Array.from(image.pixels.subarray(offset, offset + 3)),
          black = rgb.every((n) => n === 0);
        if ((n !== 0) !== black)
          mismatches.push({ screenX, screenY, byte, side, n, rgb });
        pixelSamples.push({ byte, side, black, rgb });
        if (p.palette !== 8 || p.topWord !== 0)
          throw Error("Unexpected curtain palette or upper background");
      }
  return { ...c, mismatches, pixelSamples };
}
