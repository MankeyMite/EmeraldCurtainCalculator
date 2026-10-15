import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  calculateStat,
  estimateIVs,
  summaryFromDraft,
  summaryToDraft,
  validateSummaryStats,
  promoteExactIVs,
  valueRanges,
} from "../src/core/stats";
import { analyzeConstraints, ivPossibilities } from "../src/core/inference";
import { decodePokemon, SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import {
  compareCandidate,
  emptyObservations,
  observeMemory,
  recordMasks,
  type KnownFacts,
} from "../src/core/constraints";
import { assembleMemory } from "../src/core/memory";
import { loadSession, saveSession, validateFacts } from "../src/core/session";
import { draftToFacts, freshCatchFacts } from "../src/core/facts";
import { speciesTraits } from "../src/core/traits";
import { pidSummary } from "../src/core/pid";

const fullIVs = () =>
  Array.from({ length: 6 }, () => Array.from({ length: 32 }, (_, i) => i));
const whismur = new Uint8Array(
  fs.readFileSync("research/fixtures/whismur-test.ek3"),
);

test("EXP is an unsigned 32-bit fact that constrains exactly Growth +04 across all orders", () => {
  assert.equal(freshCatchFacts().experience, undefined);
  assert.equal(draftToFacts({ experience: "0" }).experience, 0);
  for (const value of [-1, 0x100000000, 1.5])
    assert.throws(() => validateFacts({ experience: value }));
  for (let pid = 0; pid < 24; pid++) {
    const exp = 0xfedcba98;
    const r = analyzeConstraints(Array(160).fill(0xffff), {
      pid,
      tid: 0,
      sid: 0,
      experience: exp,
    });
    const physical = 32 + SUBSTRUCT_POSITIONS[pid][0] * 12 + 4;
    for (let byte = 0; byte < 4; byte++) {
      assert.deepEqual(r.plaintextByteValues[4 + byte], [
        (exp >>> (byte * 8)) & 255,
      ]);
      assert.deepEqual(r.byteValues[physical + byte], [
        ((exp ^ pid) >>> (byte * 8)) & 255,
      ]);
    }
    assert.equal(r.plaintextByteValues[8].length, 256);
  }
  const p = decodePokemon(whismur),
    obs = observeMemory(assembleMemory({ 5: whismur }));
  assert.equal(
    compareCandidate(obs, { 5: whismur }, { experience: p.experience })
      .possible,
    true,
  );
  assert.equal(
    compareCandidate(obs, { 5: whismur }, { experience: p.experience + 1 })
      .possible,
    false,
  );
});

test("Emerald stat rounding, nature directions, EV quarters and Shedinja match fixed examples", () => {
  assert.equal(calculateStat(100, 31, 0, 50, 0, 0), 175);
  assert.equal(calculateStat(100, 31, 0, 50, 1, 0), 120);
  assert.equal(calculateStat(100, 31, 0, 50, 1, 3), 132); // Adamant +Atk
  assert.equal(calculateStat(100, 31, 0, 50, 4, 3), 108); // Adamant -SpA
  assert.equal(calculateStat(100, 31, 0, 50, 3, 13), 132); // Jolly +Speed
  assert.equal(calculateStat(100, 31, 0, 50, 1, 15), 108); // Modest -Atk
  assert.equal(calculateStat(100, 31, 3, 50, 1, 0), 120);
  assert.equal(calculateStat(100, 31, 4, 50, 1, 0), 121);
  assert.equal(calculateStat(100, 31, 255, 50, 1, 0), 152);
  assert.equal(calculateStat(1, 31, 252, 100, 0, 0, true), 1);
  assert.deepEqual(
    speciesTraits(410)!.summaryBaseStats,
    [50, 95, 90, 180, 95, 90],
  );
});

test("summary-stat IV sets intersect real Whismur curtain domains without losing actual IVs", () => {
  const p = decodePokemon(whismur);
  const facts: KnownFacts = {
    pid: p.pid,
    tid: p.tid,
    sid: p.sid,
    species: p.species,
    nature: 24,
    evs: [0, 0, 0, 0, 0, 0],
    experience: 179,
  };
  const r = analyzeConstraints(
    recordMasks(observeMemory(assembleMemory({ 5: whismur })), 5),
    facts,
  );
  const summary = { level: 5, stats: [22, 10, 8, 8, 11, 8] };
  const ranges = estimateIVs(
    facts,
    summary,
    Array.from({ length: 6 }, (_, i) => ivPossibilities(r, i)),
  );
  assert.deepEqual(
    ranges[0].stats,
    Array.from({ length: 20 }, (_, i) => i + 12),
  );
  assert.deepEqual(
    ranges[1].stats,
    Array.from({ length: 18 }, (_, i) => i),
  );
  assert.deepEqual(
    ranges[2].stats,
    Array.from({ length: 18 }, (_, i) => i + 14),
  );
  assert.deepEqual(
    ranges[3].stats,
    Array.from({ length: 20 }, (_, i) => i + 4),
  );
  assert.ok(
    ranges.some((row) => row.combined.length < row.stats!.length),
    "Curtain pixels remove stat-only candidates",
  );
  ranges.forEach((row, i) => assert.ok(row.combined.includes(p.ivs[i])));
});

test("missing summary prerequisites remain unknown; conflicts block promoting IVs and ranges never become guesses", () => {
  const facts: KnownFacts = {
    species: 370,
    evs: [0, 0, 0, 0, 0, 0],
    nature: 24,
  };
  const summary = { level: 5, stats: [22, 10, null, null, null, null] };
  const curtain = fullIVs();
  curtain[0] = [29];
  const promoted = promoteExactIVs(facts, estimateIVs(facts, summary, curtain));
  assert.deepEqual(promoted.ivs, [29, null, null, null, null, null]);
  assert.equal(facts.ivs, undefined);
  assert.equal(
    estimateIVs({ species: 370, nature: 24 }, summary, fullIVs())[0].stats,
    null,
  );
  const noNature = estimateIVs(
    { species: 370, evs: facts.evs },
    summary,
    fullIVs(),
  );
  assert.ok(noNature[0].stats); // HP does not require nature.
  assert.equal(noNature[1].stats, null);
  assert.equal(
    estimateIVs(facts, { stats: summary.stats }, fullIVs())[0].stats,
    null,
  );
  const conflict = estimateIVs(
    facts,
    { level: 5, stats: [999, 10, null, null, null, null] },
    fullIVs(),
  );
  assert.equal(conflict[0].combined.length, 0);
  assert.throws(() => promoteExactIVs(facts, conflict), /conflicting/);
  assert.equal(valueRanges([0, 1, 2, 4, 8, 9]), "0–2, 4, 8–9");
});

test("summary observations save separately, preserve blanks and reject malformed inputs", () => {
  const summary = summaryFromDraft({ level: "50", stat_0: "175", stat_2: "" });
  assert.deepEqual(summary, {
    level: 50,
    stats: [175, null, null, null, null, null],
  });
  assert.deepEqual(summaryFromDraft(summaryToDraft(summary)), summary);
  const loaded = loadSession(
    saveSession(emptyObservations(), { experience: 12345 }, summary),
  );
  assert.deepEqual(loaded.summaryStats, summary);
  assert.deepEqual(loaded.knownFacts, { experience: 12345 });
  assert.equal(
    loadSession(saveSession(emptyObservations(), {})).summaryStats,
    undefined,
  );
  for (const level of [0, 101, -1, 1.5])
    assert.throws(() =>
      validateSummaryStats({ level, stats: Array(6).fill(null) }),
    );
  assert.throws(() => summaryFromDraft({ stat_0: "0" }));
  assert.throws(() => summaryFromDraft({ level: "0x32" }));
  assert.throws(() => validateSummaryStats({ stats: [1, null], unknown: 0 }));
});

test("PID display uses numeric digit order and lists no more than 100 baseline candidates", () => {
  const exact = analyzeConstraints(Array(160).fill(0xffff), {
    pid: 0xa53fefe8,
  });
  assert.equal(pidSummary(exact).pattern, "A53FEFE8");
  assert.deepEqual(pidSummary(exact).values, [0xa53fefe8]);
  const masks = Array(160).fill(0xffff);
  masks[0] = 1;
  const partial = pidSummary(analyzeConstraints(masks));
  assert.equal(partial.pattern, "???????0");
  assert.equal(partial.values, null);
  const values = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(
    pidSummary({ masks, pidCount: 100n, pidValues: values }).values?.length,
    100,
  );
  assert.equal(
    pidSummary({ masks, pidCount: 101n, pidValues: [...values, 100] }).values,
    null,
  );
});
