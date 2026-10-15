import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadSession } from "../src/core/session";
import { decodePokemon } from "../src/core/pokemon";
import { recordMasks, compareCandidate } from "../src/core/constraints";
import { analyzeConstraints, ivPossibilities } from "../src/core/inference";
import { estimateIVs } from "../src/core/stats";

const s = loadSession(
  fs.readFileSync("research/fixtures/solver-example-skarmory.json", "utf8"),
);
const record = new Uint8Array(
  fs.readFileSync("research/fixtures/skarmory-test.ek3"),
);

test("user-painted Skarmory matches all 160 observed pixels without supplying a PID", () => {
  const p = decodePokemon(record),
    comparison = compareCandidate(s.observations, { 5: record }, s.knownFacts);
  assert.equal(s.knownFacts.pid, undefined);
  assert.equal(p.species, 227);
  assert.ok(p.checksumValid);
  assert.deepEqual(p.ivs, [31, 30, 31, 31, 28, 30]);
  assert.equal(comparison.observed, 160);
  assert.equal(comparison.matches.length, 160);
  assert.deepEqual(comparison.contradictions, []);
  assert.deepEqual(comparison.factContradictions, []);
  assert.ok(s.observations.slice(0, 16).every((v) => v === -1));
  assert.ok(s.observations.slice(176).every((v) => v === -1));
});

test("Skarmory HP IV is solved by intersecting 27–31 with curtain values 7/15/23/31, leaving 20 PIDs", () => {
  const masks = recordMasks(s.observations, 5),
    { ivs: _, ...priorFacts } = s.knownFacts;
  const prior = analyzeConstraints(masks, priorFacts);
  // Reversing only the HP fact in the saved checkpoint gives 41 PIDs.
  assert.equal(prior.pidCount, 41n);
  const hp = estimateIVs(
    priorFacts,
    s.summaryStats!,
    Array.from({ length: 6 }, (_, i) => ivPossibilities(prior, i)),
  )[0];
  assert.deepEqual(hp.stats, [27, 28, 29, 30, 31]);
  assert.deepEqual(hp.curtain, [7, 15, 23, 31]);
  assert.deepEqual(hp.combined, [31]);
  const after = analyzeConstraints(masks, s.knownFacts),
    p = decodePokemon(record);
  assert.equal(after.pidCount, 20n);
  assert.ok(after.pidValues!.includes(p.pid));
  assert.deepEqual(after.orders, [14]);
  for (let byte = 0; byte < 80; byte++)
    assert.ok(
      after.byteValues[byte].includes(record[byte]),
      `Retain actual byte ${byte}`,
    );
});

test("simulated level-17/18 EXP patterns predict 20 then 17 shared baseline PID candidates", () => {
  const base = analyzeConstraints(recordMasks(s.observations, 5), s.knownFacts);
  const p = decodePokemon(record);
  assert.deepEqual(
    base.orders,
    [14],
    "All baseline candidates put Growth in the same position",
  );
  const pattern = (pid: number, exp: number) => {
    const word = (exp ^ pid ^ p.otId) >>> 0;
    return Array.from({ length: 8 }, (_, n) =>
      ((word >>> (n * 4)) & 15) === 0 ? "0" : "1",
    ).join("");
  };
  const afterOne = base.pidValues!.filter(
    (pid) => pattern(pid, 6141) === pattern(p.pid, 6141),
  );
  const afterTwo = afterOne.filter(
    (pid) => pattern(pid, 7290) === pattern(p.pid, 7290),
  );
  assert.equal(afterOne.length, 20);
  assert.equal(afterTwo.length, 17);
  assert.ok(afterTwo.includes(p.pid));
  // This is a prediction from the exported reference, not a verified emulator
  // capture or a new observation promoted into the user's saved drawing.
});
