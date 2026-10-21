import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { maxPp, ppUpStages, ppInputError } from "../src/core/pp";
import { newPokemonFacts, refreshCaptureDefaults } from "../src/core/facts";
import { knownPlaintext, analyzeConstraints } from "../src/core/inference";
import { FACT_CATALOGS } from "../src/core/catalogs";
import { NamedIdInput } from "../src/components/NamedIdInput";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
} from "../src/core/investigation";
import {
  targetExperiment,
  createItemTest,
  answerExperimentPixel,
  finishPixelExperiment,
  isEvidence,
  isRecorded,
} from "../src/core/itemTests";
import { computeDeduction } from "../src/core/deduction";
import { itemPixels, rankItemExperiments } from "../src/core/experiments";
import { makeHypothesis, solveSids } from "../src/core/sid";
import {
  INPUT_IDLE_MS,
  scheduleDeduction,
} from "../src/core/deductionScheduler";
import { PROFILE } from "../src/core/memory";
import { speciesTraits } from "../src/core/traits";
import species from "../src/data/species.json";
import { calculateStat } from "../src/core/stats";

test("PC-restored PP matches exactly one of four PP Up maxima, including every catalog move", () => {
  assert.equal(maxPp(33), 56);
  assert.deepEqual(ppUpStages(33, 42), [1]);
  assert.deepEqual(ppUpStages(33, 40), []);
  assert.match(
    ppInputError(33, "40"),
    /PC storage restores PP.*35, 42, 49, 56/,
  );
  for (const move of FACT_CATALOGS.moves) {
    const cap = maxPp(move.id);
    if (cap === undefined) continue;
    for (let pp = 0; pp <= cap + 1; pp++) {
      const expected = [0, 1, 2, 3].filter(
        (stage) => pp === maxPp(move.id, stage),
      );
      assert.deepEqual(ppUpStages(move.id, pp), expected, `${move.name}/${pp}`);
      assert.equal(!ppInputError(move.id, String(pp)), expected.length > 0);
    }
  }
});

test("boosted restored PP replaces the default zero counter and constrains the correct packed slot bits", () => {
  let facts = refreshCaptureDefaults(
    { ...newPokemonFacts(), moves: [33, 45, 0, 0] },
    "move_0",
  );
  facts = {
    ...facts,
    pp: [42, 40, 0, 0],
    assumed: facts.assumed?.filter((k) => k !== "pp_0"),
  };
  facts = refreshCaptureDefaults(facts, "pp_0");
  assert.equal(facts.ppBonuses, undefined);
  assert.ok(!facts.assumed?.includes("ppBonuses"));
  const plain = knownPlaintext(facts);
  assert.equal(
    plain[16],
    1 << 1,
    "restored Tackle 42 => one PP Up; Growl 40 => zero",
  );
  assert.equal(ppInputError(33, "42"), "");
});

test("empty moves render as a hint with a stored zero ID, ready for typing", () => {
  const html = renderToStaticMarkup(
    createElement(NamedIdInput, {
      label: "Move 1",
      value: "0",
      entries: FACT_CATALOGS.moves,
      max: 65535,
      zeroHint: "Empty move · type a move name",
      onChange: () => {},
    }),
  );
  assert.match(html, /placeholder="Empty move · type a move name"/);
  assert.match(html, /aria-label="Move 1 ID"[^>]*value="0"/);
  assert.match(html, /<input[^>]*value=""/);
});

function baseline(twoDigits = false) {
  const s = newSnapshot("base", "Original", { heldItem: 0 });
  s.observations[28] = 1;
  s.observations[29] = twoDigits ? 1 : 0;
  s.observations[30] = 0;
  s.observations[31] = 0;
  return s;
}
test("target answers alone narrow/rerank candidates, preserving original and unrelated/checksum pixels", () => {
  const source = baseline(),
    before = structuredClone(source),
    identity = { pid: 0, tid: 0, species: 25 };
  const initial = computeDeduction({
    identity,
    snapshots: [source],
    activeId: source.id,
  });
  assert.equal(initial.sidAnalysis!.candidates.length, 15);
  const recommendation = initial.experiments.find((e) => e.item.id === 1)!;
  assert.ok(recommendation.questions.length);
  assert.equal(recommendation.questions[0].digit, 1);
  assert.equal(recommendation.questions[0].transparentCount, 1);
  let next = targetExperiment(
    createItemTest(
      source,
      "test",
      1,
      recommendation.pixels.map((p) => p.index),
      15,
    ),
  );
  assert.ok(next.observations.every((p) => p === -1));
  const index = next.targets![0];
  next = answerExperimentPixel(next, index, 1);
  const updated = computeDeduction({
    identity,
    snapshots: [source, next],
    activeId: source.id,
  });
  assert.equal(updated.sidAnalysis!.candidates.length, 14);
  assert.ok(updated.sidAnalysis!.sidValues.every((s) => s !== 1));
  assert.equal(
    updated.experiments.some((e) => e.item.id === 1),
    false,
    "already excluded key digit does not stay recommended",
  );
  assert.ok(updated.experiments.some((e) => e.groups > 1 && e.item.id !== 1));
  assert.deepEqual(source, before);
  assert.equal(next.observations.filter((p) => p !== -1).length, 1);
  assert.ok(
    next.observations.slice(72, 76).every((p) => p === -1),
    "unexamined checksum changes are not copied",
  );
});

test("partial targeted experiments are immediate evidence and round-trip without copying unexamined cells", () => {
  const source = baseline(true),
    identity = { pid: 0, tid: 0, species: 25 };
  const candidates = solveSids(identity, [source], [0]).candidates;
  const chosen = rankItemExperiments(candidates).find(
    (e) => e.pixels.length >= 2,
  )!;
  let pending = targetExperiment(
    createItemTest(
      source,
      "pixels",
      chosen.item.id,
      chosen.pixels.map((p) => p.index),
      candidates.length,
    ),
  );
  const h = candidates[0],
    answer = itemPixels(h, chosen.item.id).find(
      (p) => p.index === pending.targets![0],
    )!;
  pending = answerExperimentPixel(pending, answer.index, answer.value);
  assert.equal(isRecorded(pending), false);
  assert.equal(isEvidence(pending), true);
  const result = computeDeduction({
    identity,
    snapshots: [source, pending],
    activeId: pending.id,
  });
  assert.ok(result.sidAnalysis!.candidates.length < candidates.length);
  assert.ok(result.sidAnalysis!.candidates.some((c) => c.sid === h.sid));
  assert.ok(
    result.assistance.predictions.some((p) => p !== -1),
    "facts and inferred pixels stay visible during a test",
  );
  const json = saveInvestigation({
    format: "emerald-curtain-investigation",
    schemaVersion: 1,
    mappingVersion: PROFILE.id,
    origin: "unknown",
    identity,
    snapshots: [source, pending],
    activeId: pending.id,
    ownedItems: [],
  });
  const restored = loadInvestigation(json).snapshots[1];
  assert.equal(isEvidence(restored), true);
  assert.equal(restored.observations.filter((p) => p !== -1).length, 1);
  const saved = finishPixelExperiment(restored);
  assert.equal(isRecorded(saved), true);
  assert.equal(saved.observations.filter((p) => p !== -1).length, 1);
});

test("stat edits update IV ranges even with a joint recovery, without fresh-catch assumptions", () => {
  const identity = { species: 25, pid: 0, tid: 0, sid: 0, nature: 0 },
    source = newSnapshot("s", "Stats");
  source.summaryStats = {
    level: 50,
    stats: [100, null, null, null, null, null],
  };
  const result = computeDeduction({
    identity,
    snapshots: [source],
    activeId: source.id,
  });
  assert.ok(result.recovery);
  assert.equal(source.knownFacts.evs, undefined);
  const base = speciesTraits(25)!.summaryBaseStats[0];
  const expected = Array.from({ length: 32 }, (_, iv) => iv).filter((iv) =>
    Array.from({ length: 256 }, (_, ev) => ev).some(
      (ev) => calculateStat(base, iv, ev, 50, 0, 0) === 100,
    ),
  );
  assert.deepEqual(result.ivEstimates[0].combined, expected);
  assert.ok(expected.length < 32);
  source.summaryStats.stats[0] = 99;
  const edited = computeDeduction({
    identity,
    snapshots: [source],
    activeId: source.id,
  });
  assert.notDeepEqual(edited.ivEstimates[0].combined, expected);
});

test("Electrike ability restricts the stored bit; generic PID counts and generated ability slots remain distinct", () => {
  const electrike = species.find((s) => s.name === "Electrike")!,
    traits = speciesTraits(electrike.id)!;
  const staticAbility = traits.abilities.find((a) => a.name === "Static")!.id;
  const a = analyzeConstraints(Array(160).fill(65535), {
    species: electrike.id,
  });
  const b = analyzeConstraints(Array(160).fill(65535), {
    species: electrike.id,
    ability: staticAbility,
  });
  assert.equal(a.pidCount, b.pidCount);
  assert.equal(b.pidCount, 1n << 32n);
  assert.notEqual(
    knownPlaintext({ species: electrike.id, ability: staticAbility })[87],
    65535,
  );
  const correct = traits.abilities.findIndex((a) => a.id === staticAbility);
  const spreads = [0, 1].map((abilitySlot) => ({
    pid: 0,
    ivs: [0, 0, 0, 0, 0, 0],
    abilitySlot,
    advance: 0,
    lastAdvance: 0,
    methods: ["H1" as const],
    slot: 0,
    level: 5,
  }));
  const solved = solveSids(
    { species: electrike.id, ability: staticAbility, tid: 0 },
    [newSnapshot("s", "Ability")],
    [0],
    spreads,
    Infinity,
    [0],
  );
  assert.equal(solved.candidates.length, 1);
  assert.equal(solved.candidates[0].rng!.abilitySlot, correct);
});

test("typing debounce and drawing cancellation never start stale jobs or publish their late results", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let created = 0,
    terminated = 0,
    received = 0,
    sent = 0;
  const fake = {
    onmessage: null,
    onerror: null,
    postMessage: () => sent++,
    terminate: () => terminated++,
  } as unknown as Worker;
  const create = () => {
    created++;
    return fake;
  };
  const cancel = scheduleDeduction(
    { field: "a" },
    create,
    () => received++,
    () => assert.fail("unexpected error"),
  );
  t.mock.timers.tick(INPUT_IDLE_MS - 1);
  assert.equal(created, 0);
  cancel();
  t.mock.timers.tick(1);
  assert.equal(created, 0);
  const stop = scheduleDeduction(
    { field: "ab" },
    create,
    () => received++,
    () => assert.fail("unexpected error"),
  );
  t.mock.timers.tick(INPUT_IDLE_MS);
  assert.equal(created, 1);
  assert.equal(sent, 1);
  const late = fake.onmessage!;
  stop();
  late.call(fake, { data: { type: "result" } } as MessageEvent);
  assert.equal(received, 0);
  assert.equal(terminated, 1);
  scheduleDeduction(
    { drawing: "finished" },
    create,
    () => received++,
    () => assert.fail("unexpected error"),
    0,
  );
  t.mock.timers.tick(0);
  fake.onmessage!({ data: { type: "result" } } as MessageEvent);
  assert.equal(received, 1);
  assert.equal(terminated, 2);
});
