import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decodeRgbPng } from "../scripts/capture-lib.mjs";
import evidence from "../research/fixtures/emulator-ss8/evidence.json";
import {
  assembleMemory,
  storageOffset,
  PROFILE,
  type Records,
} from "../src/core/memory";
import { ROOM_PLACEMENTS, decodeTile, pixelAddress } from "../src/core/tiles";
import {
  emptyObservations,
  compareCandidate,
  recordMasks,
  summarizeField,
  applyFacts,
  observeMemory,
  allowedValues,
} from "../src/core/constraints";
import {
  decodePokemon,
  exampleRecord,
  SUBSTRUCT_POSITIONS,
} from "../src/core/pokemon";
import { decryptConstraints, xorMask } from "../src/core/cryptoConstraints";
import { loadSession } from "../src/core/session";

const dir = "research/fixtures/emulator-ss8/";
const records: Records = Object.fromEntries(
  [4, 5, 6].map((slot) => [
    slot,
    new Uint8Array(fs.readFileSync(`${dir}slot${slot}.ek3`)),
  ]),
);
function screenObservations() {
  const image = decodeRgbPng(fs.readFileSync(`${dir}screen.png`));
  const obs = emptyObservations();
  for (const p of ROOM_PLACEMENTS)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const index = ((p.y + y + 24) * image.width + p.x + x + 48) * 3;
        const black = image.pixels
          .slice(index, index + 3)
          .every((n) => n === 0);
        const n = pixelAddress(p.tile, x, y, p.hflip, p.vflip).nibble;
        if (obs[n] !== -1)
          assert.equal(
            obs[n],
            black ? 1 : 0,
            "Repeated screen appearances agree",
          );
        obs[n] = black ? 1 : 0;
      }
  return obs;
}
test("native mGBA capture: all 768 actual screen pixels match pret placement and record rendering", () => {
  const image = decodeRgbPng(fs.readFileSync(`${dir}screen.png`));
  assert.equal(image.width, 240);
  assert.equal(image.height, 160);
  assert.ok(
    image.chunks.every((c) => ["IHDR", "IDAT", "IEND"].includes(c.type)),
    "Screenshot carries no private state chunks",
  );
  const memory = assembleMemory(records);
  assert.deepEqual(
    Buffer.from(memory as number[]),
    fs.readFileSync(`${dir}vram96.bin`),
  );
  assert.ok(fs.readFileSync(`${dir}palette8.bin`).every((n) => n === 0));
  assert.equal(evidence.occurrences.length, 12);
  for (const p of ROOM_PLACEMENTS) {
    const runtime = evidence.occurrences.find(
      (c) => c.x === p.x + 48 && c.y === p.y + 24,
    )!;
    assert.ok(runtime);
    assert.equal(runtime.tile, p.tile);
    assert.equal(runtime.hflip, p.hflip);
    assert.equal(runtime.vflip, p.vflip);
    assert.equal(runtime.palette, 8);
    assert.equal(runtime.topWord, 0);
    decodeTile(memory, p.tile, p.hflip, p.vflip).forEach((v, i) => {
      const offset =
        ((runtime.y + Math.floor(i / 8)) * 240 + runtime.x + (i % 8)) * 3;
      assert.equal(
        image.pixels.slice(offset, offset + 3).every((n) => n === 0),
        v !== 0,
      );
    });
  }
  assert.equal(
    compareCandidate(screenObservations(), records).matches.length,
    192,
  );
  assert.equal(
    compareCandidate(screenObservations(), records).contradictions.length,
    0,
  );
  const session = loadSession(
    fs.readFileSync(`${dir}observations.json`, "utf8"),
  );
  assert.deepEqual(session.observations, screenObservations());
  assert.equal(session.knownFacts.pid, undefined);
  assert.equal(session.knownFacts.tid, undefined);
});
test("runtime heap upload trace and relocated live storage agree with captured 96 bytes", () => {
  assert.equal(evidence.storagePointer, 0x02029854);
  assert.equal(evidence.relocation, 76);
  assert.equal(
    evidence.storagePointer + storageOffset(8, 4) + 72,
    evidence.liveRegionStart,
  );
  assert.equal(evidence.liveRegionStart, PROFILE.start + 76);
  assert.deepEqual(evidence.occupiedBox8Slots, [5]);
  const trace = fs.readFileSync(`${dir}upload-trace.txt`, "utf8");
  assert.match(
    trace,
    /r0: 00000002\s+r1: 02006CB0\s+r2: 00004000\s+r3: 00000200/,
  );
  assert.equal(0x02006cb0 + (791 - 512) * 32, PROFILE.capturedHeapStart);
  const lines = trace.split("\n").filter((l) => /^0x02008F[9A-F]0:/.test(l));
  const bytes = Buffer.from(
    lines.flatMap((l) =>
      l
        .split(": ")[1]
        .trim()
        .split(" ")
        .map((s) => parseInt(s, 16)),
    ),
  );
  assert.equal(bytes.length, 96);
  assert.deepEqual(bytes, fs.readFileSync(`${dir}vram96.bin`));
});
test("old DOTS file differs from saved DOTS: three bytes cause three unique pixel contradictions", () => {
  const old = new Uint8Array(
    fs.readFileSync("research/fixtures/dots-seedot.ek3"),
  );
  const current = records[5]!;
  assert.deepEqual(
    Array.from(current.keys()).filter((i) => old[i] !== current[i]),
    [0x1c, 0x2e, 0x35],
  );
  const a = decodePokemon(old),
    b = decodePokemon(current);
  assert.ok(a.checksumValid && b.checksumValid);
  assert.equal(a.heldItem, 134);
  assert.equal(b.heldItem, 0);
  assert.equal(a.friendship, 70);
  assert.equal(b.friendship, 71);
  assert.equal(a.pid, b.pid);
  assert.equal(a.experience, b.experience);
  const r = compareCandidate(screenObservations(), { ...records, 5: old });
  assert.deepEqual(r.contradictions, [108, 109, 122]);
  assert.equal(r.matches.length, 189);
  assert.equal(r.possible, false);
  const pid = summarizeField(recordMasks(screenObservations(), 5), 0, 4);
  assert.equal(pid.hex, "000000++");
  assert.equal(pid.count, 225n);
  assert.equal(pid.exact, null);
});
test("exact-key plaintext domains preserve nonzero ambiguity and unknown values", () => {
  assert.deepEqual(allowedValues(xorMask(1, 10)), [10]);
  assert.equal(allowedValues(xorMask(0xfffe, 10)).length, 15);
  assert.ok(!(xorMask(0xfffe, 10) & (1 << 10)));
  assert.ok(xorMask(0xfffe, 10) & 1);
  assert.equal(xorMask(0xffff, 10), 0xffff);
  assert.equal(xorMask(0, 10), 0);
  const masks = recordMasks(screenObservations(), 5);
  assert.equal(decryptConstraints(masks).available, false);
  assert.equal(
    decryptConstraints(applyFacts(masks, { sid: 0, tid: 38726 })).available,
    false,
    "Known OT ID does not resolve PID",
  );
  const p = decryptConstraints(
    applyFacts(masks, { pid: 132, tid: 38726, sid: 0 }),
  );
  assert.ok(p.available);
  assert.equal(p.key, 0x97c2);
  assert.ok(p.exactNibbles > 0 && p.exactNibbles < 96);
  const impossible = applyFacts(masks, { pid: 0 });
  assert.equal(decryptConstraints(impossible).available, false);
});
test("exact record constraints decrypt all 24 permutations without changing ciphertext", () => {
  for (let pid = 0; pid < 24; pid++) {
    const bytes = exampleRecord("pokemon", pid),
      before = bytes.slice();
    const full = Array.from(
      { length: 160 },
      (_, n) => 1 << ((bytes[n >> 1] >> ((n % 2) * 4)) & 15),
    );
    const p = decryptConstraints(full);
    assert.ok(p.available);
    assert.equal(p.exactNibbles, 96);
    const key = decodePokemon(bytes).key;
    p.blocks.forEach((b, logical) => {
      assert.equal(b.position, SUBSTRUCT_POSITIONS[pid][logical]);
      for (let n = 0; n < 24; n++) {
        const byte = b.ciphertextOffset + (n >> 1),
          shift = (n % 2) * 4;
        const expected =
          ((bytes[byte] ^ ((key >>> (((byte - 32) % 4) * 8)) & 255)) >> shift) &
          15;
        assert.deepEqual(allowedValues(b.masks[n]), [expected]);
      }
    });
    assert.deepEqual(bytes, before);
  }
});
