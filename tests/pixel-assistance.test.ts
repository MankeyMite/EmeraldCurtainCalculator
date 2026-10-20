import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  pixelAssistance,
  visibleState,
  completeAssistedDrawing,
} from "../src/core/pixelAssistance";
import { analyzeConstraints } from "../src/core/inference";
import {
  emptyObservations,
  observeMemory,
  type KnownFacts,
} from "../src/core/constraints";
import { exampleRecord, decodePokemon } from "../src/core/pokemon";
import { assembleMemory } from "../src/core/memory";
import { ROOM_PLACEMENTS, pixelAddress } from "../src/core/tiles";
import { encodeNickname } from "../src/core/names";
import { newSnapshot } from "../src/core/investigation";
import { analyzeObservations } from "../src/core/jointInference";
import { solveSids } from "../src/core/sid";

test("drawing completion does not record automatic black or transparent cells as observations", () => {
  const obs = emptyObservations(),
    predictions = pixelAssistance(obs, { tid: 0x0010 }).predictions;
  assert.equal(predictions[24], 0);
  assert.equal(predictions[25], 1);
  const completed = completeAssistedDrawing(obs, predictions);
  assert.equal(completed[24], -1);
  assert.equal(completed[25], -1);
  assert.equal(completed[100], 0);
  assert.equal(completed[0], -1);
  assert.ok(obs.every((p) => p === -1));
});

test("known header facts fill black and transparent pixels, including nickname terminators but no trailing bytes", () => {
  const obs = emptyObservations(),
    original = obs.slice();
  const a = pixelAssistance(obs, { tid: 0x1200, nickname: "AB", markings: 0 });
  const bytes = [0, 0x12];
  bytes.forEach((b, i) => {
    assert.equal(a.predictions[24 + i * 2], b & 15 ? 1 : 0);
    assert.equal(a.predictions[25 + i * 2], b >>> 4 ? 1 : 0);
  });
  encodeNickname("AB").forEach((b, i) => {
    assert.equal(a.predictions[32 + i * 2], b & 15 ? 1 : 0);
    assert.equal(a.predictions[33 + i * 2], b >>> 4 ? 1 : 0);
  });
  assert.equal(a.predictions[32 + encodeNickname("AB").length * 2], -1);
  assert.equal(a.predictions[70], 0);
  assert.deepEqual(obs, original);
});

test("known plaintext and exact key predict the original ciphertext under all 24 permutations", () => {
  for (let order = 0; order < 24; order++) {
    const b = exampleRecord("pokemon", 24 * 12345 + order),
      d = decodePokemon(b);
    const facts: KnownFacts = {
      pid: d.pid,
      tid: d.tid,
      sid: d.sid,
      species: d.species,
      heldItem: d.heldItem,
      experience: d.experience,
      ivs: d.ivs,
      evs: d.evs,
      moves: d.moves,
      pp: d.pp,
    };
    const a = pixelAssistance(emptyObservations(), facts),
      actual = observeMemory(assembleMemory({ 5: b }));
    for (let n = 16; n < 176; n++)
      if (a.predictions[n] !== -1)
        assert.equal(a.predictions[n], actual[n], `${order}/${n}`);
    assert.ok(
      a.predictions.slice(80, 176).filter((p) => p !== -1).length >= 60,
    );
  }
});

test("multiple unknown PID/SID hypotheses can agree on black or transparent without agreeing on a hexadecimal digit", () => {
  const masks = Array(160).fill(65535);
  for (let i = 0; i < 8; i++) masks[i] = 1;
  masks[0] = 3;
  const facts = { tid: 0, species: 2 },
    inference = analyzeConstraints(masks, facts);
  assert.equal(inference.pidCount, 2n);
  assert.deepEqual(inference.pidValues, [0, 1]);
  assert.equal(inference.masks[64], (1 << 2) | (1 << 3));
  const a = pixelAssistance(emptyObservations(), facts, inference);
  assert.equal(a.predictions[80], 1);
  assert.equal(a.predictions[81], 0);
  assert.equal(a.predictions[84], -1);
  assert.equal(visibleState(0), -1);
  assert.equal(visibleState(65535), -1);
});

test("changed/removed facts retract predictions, preserve manual observations and diagnose contradictions without circular evidence", () => {
  const obs = emptyObservations();
  obs[24] = 1;
  const original = obs.slice(),
    a = pixelAssistance(obs, { tid: 0 });
  assert.equal(a.predictions[24], 0);
  assert.ok(a.contradictions.has(24));
  assert.match(a.reasons[24], /trainer ID/);
  assert.match(a.conflictReason!, /preserved/);
  const b = pixelAssistance(obs, {});
  assert.equal(b.predictions[24], -1);
  assert.equal(b.predictions[25], -1);
  assert.deepEqual(obs, original);
  const complete = completeAssistedDrawing(obs, a.predictions);
  assert.equal(
    complete[25],
    -1,
    "automatic transparency is not confirmed by completing remaining unknown cells",
  );
  assert.equal(complete[24], 1, "manual contradictory observation is retained");
  assert.equal(
    analyzeConstraints(Array(160).fill(65535), {}).headerPairCount,
    1n << 64n,
  );
  const conditional = pixelAssistance(emptyObservations(), {
    heldItem: 0,
    pid: 0,
    tid: 0,
    sid: 0,
    assumed: ["heldItem"],
  });
  assert.match(conditional.reasons[84], /Conditional on active assumptions/);
});

test("real Skarmory fixture predictions agree at every mirrored/repeated screen appearance and never become observations", () => {
  const b = new Uint8Array(
      fs.readFileSync("research/fixtures/skarmory-test.ek3"),
    ),
    d = decodePokemon(b);
  const facts: KnownFacts = {
    pid: d.pid,
    tid: d.tid,
    sid: d.sid,
    species: d.species,
    experience: d.experience,
    moves: d.moves,
    pp: d.pp,
    ivs: d.ivs,
    evs: d.evs,
  };
  const obs = emptyObservations(),
    a = pixelAssistance(obs, facts),
    actual = observeMemory(assembleMemory({ 5: b }));
  let appearances = 0;
  for (const t of ROOM_PLACEMENTS)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const index = pixelAddress(t.tile, x, y, t.hflip, t.vflip).nibble;
        if (a.predictions[index] !== -1) {
          assert.equal(a.predictions[index], actual[index]);
          appearances++;
        }
      }
  assert.ok(appearances > 200);
  assert.ok(obs.every((p) => p === -1));
});

test("recovered key digits propagate to every snapshot and repeated secure-data occurrence", () => {
  const identity = { pid: 0, tid: 0 },
    a = newSnapshot("a", "A", { heldItem: 0 }),
    b = newSnapshot("b", "B", { heldItem: 1 });
  a.observations[84] = 0; // Key digit 4 is zero from a known zero item digit.
  const local = analyzeConstraints(Array(160).fill(65535), {
    ...identity,
    ...b.knownFacts,
  });
  const joint = analyzeObservations(identity, [a, b], b);
  assert.equal(local.masks[68], 65535);
  assert.equal(joint.masks[68], 1 << 1);
  assert.equal(visibleState(joint.masks[68]), 1);
  const pids = [0];
  const before = solveSids(identity, [a, b], pids).candidates.length;
  pixelAssistance(b.observations, { ...identity, ...b.knownFacts }, joint);
  assert.equal(solveSids(identity, [a, b], pids).candidates.length, before);
  assert.ok(b.observations.every((p) => p === -1));
});
