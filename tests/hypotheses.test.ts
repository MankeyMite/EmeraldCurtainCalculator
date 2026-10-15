import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseHypothesis, testHypothesis } from "../src/core/hypotheses";
import {
  emptyObservations,
  observeMemory,
  recordMasks,
} from "../src/core/constraints";
import { assembleMemory } from "../src/core/memory";
import { analyzeConstraints } from "../src/core/inference";

const record = new Uint8Array(
  fs.readFileSync("research/fixtures/whismur-test.ek3"),
);
const whismur = recordMasks(observeMemory(assembleMemory({ 5: record })), 5);
const unknown = () => recordMasks(emptyObservations(), 5);

test("hypothesis input accepts whole decimal and explicit hex, rejecting malformed or out-of-range values", () => {
  assert.deepEqual(
    parseHypothesis({
      pid: " 0xA53FEFE8 ",
      tid: "09918",
      sid: "41686",
      ev_0: "0",
    }),
    {
      pid: 0xa53fefe8,
      tid: 9918,
      sid: 41686,
      evs: [0, null, null, null, null, null],
    },
  );
  for (const pid of [
    "123junk",
    "A53FEFE8",
    "1.5",
    "1e3",
    "-1",
    "0x",
    "4294967296",
    "Infinity",
  ])
    assert.throws(() => parseHypothesis({ pid }));
  assert.throws(() => parseHypothesis({ tid: "65536" }));
  assert.throws(() => parseHypothesis({ ev_0: "256" }));
  assert.throws(() => parseHypothesis({ nature: "25" }));
  assert.deepEqual(parseHypothesis({ pid: "0", ev_5: "0" }), {
    pid: 0,
    evs: [null, null, null, null, null, 0],
  });
});

test("partial drawing permits many PIDs, and a directly contradicted nibble gives an exact byte location", () => {
  assert.equal(testHypothesis(unknown(), {}, { pid: 0 }).status, "possible");
  const good = testHypothesis(whismur, {}, { pid: 0xa53fefe8 });
  assert.equal(good.status, "possible");
  assert.equal(good.pidCount, 1n);
  const bad = testHypothesis(whismur, {}, { pid: 0xa53fefe0 });
  assert.equal(bad.status, "impossible");
  assert.match(bad.reasons.join(" "), /PID byte 0x00, low nibble/);
});

test("trial values intersect existing known facts, including per-EV entries, without mutation", () => {
  const masks = unknown(),
    before = masks.slice();
  const known = { pid: 132, evs: [0, null, null, null, null, 5] };
  const trial = { pid: 133, evs: [null, 20, null, null, null, 0] };
  const savedKnown = structuredClone(known),
    savedTrial = structuredClone(trial);
  const r = testHypothesis(masks, known, trial);
  assert.equal(r.status, "impossible");
  assert.match(r.reasons.join(" "), /PID conflicts/);
  assert.match(r.reasons.join(" "), /Sp\. Defense EV conflicts/);
  assert.deepEqual(known, savedKnown);
  assert.deepEqual(trial, savedTrial);
  assert.deepEqual(masks, before);
  assert.equal(
    testHypothesis(masks, known, { evs: [null, 20, null, null, null, 5] })
      .status,
    "possible",
  );
});

test("joint PID/nature checking rejects a combination whose individual nibble values are all allowed", () => {
  const masks = unknown();
  const baseline = analyzeConstraints(masks, { nature: 7 });
  // Every nibble of PID 133 occurs in some valid PID, but 133 % 25 is 8.
  for (let n = 0; n < 8; n++)
    assert.ok(baseline.masks[n] & (1 << (Math.floor(133 / 16 ** n) % 16)));
  assert.equal(
    testHypothesis(masks, { nature: 7 }, { pid: 133 }).status,
    "impossible",
  );
  assert.equal(
    testHypothesis(masks, { nature: 7 }, { pid: 132 }).status,
    "possible",
  );
});

test("known species and encrypted EV pixels can reject a trial even when its header matches", () => {
  const known = { tid: 9918, sid: 41686, species: 370, nature: 24 };
  const actual = { pid: 0xa53fefe8, evs: [0, 0, 0, 0, 0, 0] };
  const good = testHypothesis(whismur, known, actual);
  assert.equal(good.status, "possible");
  assert.equal(good.headerPairCount, 1n);
  // Attack EV 9 XOR key byte C9 produces C0 instead of C9: observed low nibble is black.
  const bad = testHypothesis(whismur, known, {
    ...actual,
    evs: [0, 9, 0, 0, 0, 0],
  });
  assert.equal(bad.status, "impossible");
  assert.match(bad.reasons.join(" "), /XOR key and block order/);
});

test("empty, invalid and inconsistent baseline results do not produce a misleading verdict", () => {
  assert.equal(testHypothesis(unknown(), {}, {}).status, "empty");
  assert.equal(
    testHypothesis(unknown(), {}, { evs: [null, null, null, null, null, null] })
      .status,
    "empty",
  );
  assert.equal(testHypothesis(unknown(), {}, { pid: -1 }).status, "invalid");
  // Baseline nature and PID conflict before any new guess is considered.
  assert.equal(
    testHypothesis(unknown(), { pid: 132, nature: 8 }, { tid: 0 }).status,
    "baseline-conflict",
  );
  assert.equal(
    testHypothesis(whismur, { pid: 0 }, { pid: 0xa53fefe8 }).status,
    "baseline-conflict",
  );
});
