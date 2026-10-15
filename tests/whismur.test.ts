import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decodePokemon } from "../src/core/pokemon";
import { analyzeConstraints } from "../src/core/inference";
import { assembleMemory } from "../src/core/memory";
import {
  compareCandidate,
  observeMemory,
  recordMasks,
  type KnownFacts,
} from "../src/core/constraints";

const record = new Uint8Array(
  fs.readFileSync("research/fixtures/whismur-test.ek3"),
);
// Exact user-supplied facts, independently checked against the file below.
const facts: KnownFacts = {
  pid: 0xa53fefe8,
  tid: 9918,
  sid: 41686,
  species: 370,
  evs: [0, 0, 0, 0, 0, 0],
  nature: 24,
};

test("Whismur report: the highlighted 3C/3D bytes are 56 C9; 56 D6 is at 44/45", () => {
  assert.equal(record.length, 80);
  const p = decodePokemon(record);
  assert.ok(p.checksumValid);
  assert.equal(p.checksum, 0x0cf1);
  assert.equal(p.pid, facts.pid);
  assert.equal(p.tid, facts.tid);
  assert.equal(p.sid, facts.sid);
  assert.equal(p.species, facts.species);
  assert.equal(p.nature, facts.nature);
  assert.deepEqual(p.evs, facts.evs);
  assert.equal(p.key, 0x07e9c956);
  assert.equal(p.pid % 24, 0);
  assert.deepEqual(
    Array.from(record.slice(0x38, 0x40)),
    [0x56, 0xc9, 0xe9, 0x07, 0x56, 0xc9, 0xe9, 0x07],
  );
  assert.deepEqual(
    Array.from(record.slice(0x40, 0x48)),
    [0x56, 0xc9, 0xe9, 0x07, 0x56, 0xd6, 0x6f, 0x16],
  );
});

test("Whismur exact reported facts retain every real byte and recover the highlighted EV ciphertext", () => {
  const observed = observeMemory(assembleMemory({ 5: record }));
  assert.ok(compareCandidate(observed, { 5: record }, facts).possible);
  const masks = recordMasks(observed, 5);
  const result = analyzeConstraints(masks, facts);
  assert.ok(result.consistent);
  assert.equal(result.pidCount, 1n);
  for (let i = 0; i < record.length; i++)
    assert.ok(
      result.byteValues[i].includes(record[i]),
      `Actual byte at 0x${i.toString(16)} retained`,
    );
  assert.deepEqual(result.byteValues[0x3c], [0x56]);
  assert.deepEqual(result.byteValues[0x3d], [0xc9]);
  assert.equal(result.byteValues[0x45].length, 225);
  assert.ok(
    result.byteValues[0x45].includes(0xd6),
    "Misc byte must retain D6, not assert C9",
  );
  const pixelsOnly = analyzeConstraints(masks);
  assert.equal(pixelsOnly.byteValues[0x3c].length, 225);
  assert.equal(pixelsOnly.byteValues[0x3d].length, 225);
});
