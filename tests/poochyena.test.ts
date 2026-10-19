import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadInvestigation } from "../src/core/investigation";
import { compareCandidate, recordMasks } from "../src/core/constraints";
import { decodePokemon } from "../src/core/pokemon";
import { analyzeConstraints } from "../src/core/inference";
import { solveSids } from "../src/core/sid";
import { speciesTraits } from "../src/core/traits";
import { calculateStat } from "../src/core/stats";

const originalText = fs.readFileSync(
  "research/fixtures/poochyena-user-investigation.json",
  "utf8",
);
const recordBytes = new Uint8Array(
  fs.readFileSync("research/fixtures/poochyena-test.ek3"),
);

test("reported Poochyena contradiction is reproduced: two pixel differences and Ruby versus Emerald", () => {
  const investigation = loadInvestigation(originalText),
    snapshot = investigation.snapshots[0];
  const record = decodePokemon(recordBytes);
  assert.ok(record.checksumValid);
  const facts = { ...snapshot.knownFacts, ...investigation.identity };
  const comparison = compareCandidate(
    snapshot.observations,
    { 5: recordBytes },
    facts,
  );
  assert.equal(comparison.matches.length, 158);
  assert.deepEqual(comparison.contradictions, [122, 130]);
  assert.deepEqual(comparison.factContradictions, [
    "metGame: candidate 3, supplied 2",
  ]);
  assert.equal(
    analyzeConstraints(recordMasks(snapshot.observations, 5), facts).pidCount,
    0n,
  );
  assert.equal(snapshot.observations[122], 0);
  assert.notEqual(recordBytes[0x35] & 15, 0);
  assert.equal(snapshot.observations[130], 1);
  assert.equal(recordBytes[0x39] & 15, 0);
  const correctedGame = compareCandidate(
    snapshot.observations,
    { 5: recordBytes },
    { ...facts, metGame: 3 },
  );
  assert.deepEqual(
    correctedGame.factContradictions,
    [],
    "every other entered stored fact matches",
  );
  const base = speciesTraits(record.species)!;
  const stats = base.summaryBaseStats.map((b, i) =>
    calculateStat(b, record.ivs[i], record.evs[i], 3, i, record.nature),
  );
  assert.deepEqual(
    stats,
    snapshot.summaryStats!.stats,
    "all six supplied summary stats match the record",
  );
});

test("review copy clears disputed pixels instead of treating the reference as independent evidence", () => {
  const original = loadInvestigation(originalText);
  const review = loadInvestigation(
    fs.readFileSync(
      "research/fixtures/poochyena-review-investigation.json",
      "utf8",
    ),
  );
  assert.equal(review.identity.metGame, 3);
  assert.equal(review.identity.pid, undefined);
  assert.equal(review.identity.sid, undefined);
  assert.equal(review.identity.ivs, undefined);
  const a = original.snapshots[0],
    b = review.snapshots[0];
  assert.equal(b.observations[122], -1);
  assert.equal(b.observations[130], -1);
  assert.deepEqual(b.targets, [122, 130]);
  assert.deepEqual(b.knownFacts, a.knownFacts);
  b.observations.forEach((value, i) => {
    if (i !== 122 && i !== 130) assert.equal(value, a.observations[i]);
  });
  assert.deepEqual(
    compareCandidate(
      b.observations,
      { 5: recordBytes },
      { ...b.knownFacts, ...review.identity },
    ).contradictions,
    [],
  );
  const actual = decodePokemon(recordBytes);
  const unknownPid = analyzeConstraints(recordMasks(b.observations, 5), {
    ...b.knownFacts,
    ...review.identity,
  });
  assert.equal(
    unknownPid.pidCount,
    1012489n,
    "review does not pretend to recover a unique PID",
  );
  assert.equal(
    analyzeConstraints(recordMasks(b.observations, 5), {
      ...b.knownFacts,
      ...review.identity,
      pid: actual.pid,
    }).pidCount,
    1n,
  );
  // Reference PID is supplied only for this validation, not to the saved review.
  const sids = solveSids(
    { ...review.identity, pid: actual.pid },
    review.snapshots,
    [actual.pid],
  );
  assert.equal(sids.sidValues.length, 4394);
  assert.ok(sids.sidValues.includes(actual.sid));
  assert.equal(
    original.snapshots[0].observations[122],
    0,
    "original evidence stays unchanged",
  );
});
