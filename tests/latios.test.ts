import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decodeRgbPng } from "../scripts/capture-lib.mjs";
import { parseRecord, decodePokemon } from "../src/core/pokemon";
import {
  assembleMemory,
  storageOffset,
  PROFILE,
  type Records,
} from "../src/core/memory";
import { ROOM_PLACEMENTS, decodeTile, pixelAddress } from "../src/core/tiles";
import {
  emptyObservations,
  recordMasks,
  summarizeField,
  compareCandidate,
} from "../src/core/constraints";
import { loadSession } from "../src/core/session";
import evidence from "../research/fixtures/emulator-latios-ss9/evidence.json";
import saveEvidence from "../research/fixtures/latios-saved-storage-report.json";

// Contributor-reported illegal record: these tests check stored bytes and
// captured rendering, not legality or encounter-specific RNG reachability.
const dir = "research/fixtures/emulator-latios-ss9/";
const records: Records = Object.fromEntries(
  [4, 5, 6].map((slot) => [
    slot,
    new Uint8Array(fs.readFileSync(`${dir}slot${slot}.ek3`)),
  ]),
);
test("Latios party export: unchanged boxed prefix matches captured and saved slot 5", () => {
  const original = fs.readFileSync("research/fixtures/latios-test-party.ek3");
  const boxed = fs.readFileSync("research/fixtures/latios-test-box.ek3");
  assert.equal(original.length, 100);
  assert.equal(boxed.length, 80);
  assert.throws(() => parseRecord(original), /80/);
  assert.deepEqual(boxed, original.subarray(0, 80));
  assert.deepEqual(boxed, Buffer.from(records[5]!));
  const p = decodePokemon(new Uint8Array(boxed));
  assert.ok(p.checksumValid);
  assert.equal(p.species, 408);
  assert.equal(p.pid, 0x47366a9c);
  assert.equal(p.otId, 0x47366a9c);
  assert.equal(p.key, 0);
  assert.equal(p.experience, 92267);
  assert.equal(original[84], 41);
  assert.deepEqual(p.evs, [30, 8, 4, 90, 32, 2]);
  assert.deepEqual(p.ivs, [31, 31, 31, 31, 31, 31]);
  const selected = saveEvidence.copies.find(
    (c) => c.copy === saveEvidence.selectedCopy,
  )!;
  assert.ok(selected.valid && selected.candidateMatchesSlot5);
  assert.ok(selected.slot4Empty && selected.slot6Empty);
});
test("independent pre-reset Latios screen verifies all pixels with relocation +112", () => {
  assert.equal(evidence.relocation, 112);
  assert.equal(evidence.storagePointer, PROFILE.storageBase + 112);
  assert.equal(
    evidence.liveRegionStart,
    evidence.storagePointer + storageOffset(8, 4) + 72,
  );
  assert.ok(evidence.heapMatch);
  assert.deepEqual(evidence.occupiedBox8Slots, [5]);
  const memory = assembleMemory(records);
  assert.deepEqual(
    Buffer.from(memory as number[]),
    fs.readFileSync(`${dir}vram96.bin`),
  );
  const image = decodeRgbPng(fs.readFileSync(`${dir}screen.png`));
  const obs = emptyObservations(),
    repeats = Array(192).fill(0);
  assert.equal(image.width, 240);
  assert.equal(image.height, 160);
  assert.ok(
    image.chunks.every((c) => ["IHDR", "IDAT", "IEND"].includes(c.type)),
  );
  let checked = 0;
  for (const p of ROOM_PLACEMENTS) {
    const captured = evidence.occurrences.find(
      (c) => c.x === p.x + 48 && c.y === p.y + 24,
    )!;
    assert.ok(captured);
    assert.equal(captured.tile, p.tile);
    assert.equal(captured.hflip, p.hflip);
    decodeTile(memory, p.tile, p.hflip, p.vflip).forEach((n, i) => {
      const x = i % 8,
        y = Math.floor(i / 8),
        index = ((captured.y + y) * 240 + captured.x + x) * 3;
      const black = image.pixels.slice(index, index + 3).every((c) => c === 0);
      assert.equal(black, n !== 0);
      checked++;
      const address = pixelAddress(p.tile, x, y, p.hflip, p.vflip),
        value = black ? 1 : 0;
      if (obs[address.nibble] !== -1) assert.equal(obs[address.nibble], value);
      obs[address.nibble] = value;
      repeats[address.nibble]++;
    });
  }
  assert.equal(checked, 768);
  assert.ok(repeats.every((n) => n === 4));
  assert.deepEqual(
    loadSession(fs.readFileSync(`${dir}observations.json`, "utf8"))
      .observations,
    obs,
  );
  const result = compareCandidate(obs, records);
  assert.equal(result.matches.length, 192);
  assert.equal(result.contradictions.length, 0);
  const pid = summarizeField(recordMasks(obs, 5), 0, 4);
  assert.equal(pid.hex, "++++++++");
  assert.equal(pid.count, 15n ** 8n);
  assert.equal(pid.exact, null);
});
