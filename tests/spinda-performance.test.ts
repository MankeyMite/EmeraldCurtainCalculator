import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDeduction,
  type DeductionInput,
  type DeductionPhase,
} from "../src/core/deduction";
import { newSnapshot } from "../src/core/investigation";
import {
  compileChecksumSupport,
  projectRecord,
  experimentChecksumSupports,
} from "../src/core/sid";
import { checksumMasks } from "../src/core/checksum";
import { completeAssistedDrawing } from "../src/core/pixelAssistance";
import {
  createControlledTest,
  actionPixels,
} from "../src/core/controlledExperiments";
import { targetExperiment, answerExperimentPixel } from "../src/core/itemTests";
import {
  scheduleDeduction,
  DEDUCTION_TIMEOUT_MS,
} from "../src/core/deductionScheduler";

// Minimal reproduction of the reported level-16 Route 113 Spinda. Excludes
// unrelated painter/guide data and trainer names: neither enters deduction.
function reportedSpinda(): DeductionInput {
  const s = newSnapshot("spinda", "Spinda", {
    headerFlags: 2,
    isEgg: 0,
    ppBonuses: 0,
    nickname: "SPINDA",
    experience: 3276,
    pokerus: 0,
    markings: 0,
    ribbons: 0,
    friendship: 70,
    heldItem: 0,
    evs: [0, 0, 0, 0, 0, 0],
    contest: [0, 0, 0, 0, 0, 0],
    moves: [33, 253, 185, 60],
    pp: [35, 10, 20, 20],
  });
  for (let n = 80; n < 176; n++) if (n % 8 >= 4) s.observations[n] = 1;
  s.observations[141] = 0;
  [28, 29, 30, 31, 48, 49, 72, 73, 74, 75].forEach(
    (n) => (s.observations[n] = 1),
  );
  [46, 47, 50, 51, 76, 77, 78, 79].forEach((n) => (s.observations[n] = 0));
  s.summaryStats = { level: 16, stats: [47, 21, 25, 25, 28, 25] };
  return {
    identity: {
      metGame: 3,
      language: 2,
      species: 308,
      pid: 4293477290,
      shiny: false,
      nature: 15,
      ability: 20,
      gender: "male",
      tid: 9918,
      ball: 1,
      otGender: "male",
      metLocation: 28,
      metLevel: 16,
    },
    snapshots: [s],
    activeId: s.id,
    rng: {
      kind: "wild",
      seed: 0,
      minAdvance: 0,
      maxAdvance: 3600,
      methods: ["H1", "H2", "H4"],
      areaId: "MAP_ROUTE113:land",
      lead: "none",
      synchronizeNature: 0,
    },
  };
}

test("reported Spinda finishes recovery and ranks all 1,716 SIDs without unbounded checksum experiment expansion", () => {
  const input = reportedSpinda(),
    before = structuredClone(input),
    phases: DeductionPhase[] = [];
  const start = performance.now(),
    result = computeDeduction(input, undefined, (phase) => phases.push(phase));
  assert.ok(
    performance.now() - start < 10000,
    "small RNG scope must not spend minutes on optional experiment rankings",
  );
  assert.deepEqual(input, before);
  assert.deepEqual(phases, [
    "inference",
    "rng",
    "sid",
    "recovery",
    "experiments",
  ]);
  assert.equal(result.wildResult?.spreads.length, 1);
  assert.equal(result.wildResult?.spreads[0].advance, 636);
  assert.equal(result.sidAnalysis?.candidates.length, 1716);
  assert.ok(result.experiments.length > 0);
  assert.ok(result.controlledExperiments.length > 0);
  assert.ok(
    result.experimentLimitations.some((s) =>
      /No candidates were discarded/.test(s),
    ),
  );
  assert.equal(
    experimentChecksumSupports(
      input.identity,
      input.snapshots,
      input.snapshots[0],
      result.sidAnalysis!.candidates,
    ),
    undefined,
  );
  // Finishing confirms only blanks without derived pixels. It must still
  // return a completed result instead of keeping a worker spinner running.
  const finished = structuredClone(input);
  finished.snapshots[0].observations = completeAssistedDrawing(
    input.snapshots[0].observations,
    result.assistance.predictions,
  );
  const next = computeDeduction(finished);
  assert.ok(next.investigationInference.consistent);
  assert.ok(next.sidAnalysis!.candidates.length > 0);
  assert.ok(
    next.sidAnalysis!.candidates.every((h) => h.pid === input.identity.pid),
  );
});

test("large-set checksum projection equals the exact union while retaining every candidate", () => {
  const input = reportedSpinda(),
    result = computeDeduction(input),
    candidates = result.sidAnalysis!.candidates.slice(0, 40),
    support = compileChecksumSupport(
      input.identity,
      input.snapshots,
      input.snapshots[0],
    ),
    expected = [0, 0, 0, 0];
  for (const h of candidates)
    checksumMasks(support(h)).forEach((m, n) => (expected[n] |= m));
  const before = structuredClone(candidates),
    projected = projectRecord(input.identity, input.snapshots[0], candidates);
  assert.deepEqual(projected.masks.slice(56, 60), expected);
  assert.deepEqual(candidates, before);
  const small = experimentChecksumSupports(
    input.identity,
    input.snapshots,
    input.snapshots[0],
    candidates.slice(0, 2),
  );
  assert.ok(small);
  assert.deepEqual(
    small.map(checksumMasks),
    candidates.slice(0, 2).map((h) => checksumMasks(support(h))),
  );
});

test("common black answers in a move-swap test retain exactly the compatible SIDs and keep the confirmed baseline", () => {
  const input = reportedSpinda(),
    first = computeDeduction(input);
  input.snapshots[0].observations = completeAssistedDrawing(
    input.snapshots[0].observations,
    first.assistance.predictions,
  );
  assert.ok(
    input.snapshots[0].observations.slice(16, 176).every((p) => p !== -1),
  );
  const base = computeDeduction(input),
    recommendation = base.controlledExperiments.find(
      (e) => e.action.kind === "moves",
    )!,
    original = structuredClone(input.snapshots[0]);
  let next = targetExperiment(
    createControlledTest(
      original,
      "move-swap",
      recommendation.action,
      recommendation.pixels.map((p) => p.index),
    ),
  );
  assert.ok(
    next.observations.every((p) => p === -1),
    "changed-state predictions and reference pixels are not answers",
  );
  next = answerExperimentPixel(next, next.targets![0], 1);
  const start = performance.now(),
    result = computeDeduction({
      ...input,
      snapshots: [original, next],
      activeId: next.id,
    });
  assert.ok(
    performance.now() - start < 10000,
    "partial black answer must not expand all linked checksums per SID",
  );
  const expected = base.sidAnalysis!.candidates.filter(
    (h) =>
      actionPixels(original, recommendation.action, h).find(
        (p) => p.index === next.targets![0],
      )?.value === 1,
  );
  assert.deepEqual(
    new Set(result.sidAnalysis!.sidValues),
    new Set(expected.map((h) => h.sid)),
  );
  assert.ok(
    result.sidAnalysis!.candidates.length > 1000,
    "a broad valid set is not silently truncated",
  );
  assert.equal(next.observations.filter((p) => p !== -1).length, 1);
  assert.deepEqual(input.snapshots[0], original);
});

test("hung deduction workers stop after the deadline and cannot publish late results", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let terminated = 0,
    results = 0;
  const errors: (string | undefined)[] = [],
    fake = {
      onmessage: null,
      onerror: null,
      postMessage: () => {},
      terminate: () => terminated++,
    } as unknown as Worker;
  scheduleDeduction(
    {},
    () => fake,
    () => results++,
    (message) => errors.push(message),
    0,
  );
  t.mock.timers.tick(0);
  const late = fake.onmessage!;
  t.mock.timers.tick(DEDUCTION_TIMEOUT_MS - 1);
  assert.equal(errors.length, 0);
  t.mock.timers.tick(1);
  assert.equal(terminated, 1);
  assert.match(
    errors[0]!,
    /60 seconds.*No partial result.*drawing is preserved/,
  );
  late.call(fake, { data: { type: "result" } } as MessageEvent);
  assert.equal(results, 0);
});

test("finished and cancelled worker jobs clear the deadline and retain phase updates", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let terminated = 0;
  const messages: string[] = [],
    fake = {
      onmessage: null,
      onerror: null,
      postMessage: () => {},
      terminate: () => terminated++,
    } as unknown as Worker;
  scheduleDeduction(
    {},
    () => fake,
    (e) => messages.push(e.data.type),
    () => assert.fail("finished job timed out"),
    0,
  );
  t.mock.timers.tick(0);
  fake.onmessage!({
    data: { type: "phase", phase: "experiments" },
  } as MessageEvent);
  fake.onmessage!({ data: { type: "result" } } as MessageEvent);
  t.mock.timers.tick(DEDUCTION_TIMEOUT_MS);
  assert.deepEqual(messages, ["phase", "result"]);
  assert.equal(terminated, 1);
  const cancel = scheduleDeduction(
    {},
    () => fake,
    () => assert.fail("cancelled job published"),
    () => assert.fail("cancelled job timed out"),
    0,
  );
  t.mock.timers.tick(0);
  cancel();
  t.mock.timers.tick(DEDUCTION_TIMEOUT_MS);
  assert.equal(terminated, 2);
});
