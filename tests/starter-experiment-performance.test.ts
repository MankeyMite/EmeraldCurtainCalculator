import test from "node:test";
import assert from "node:assert/strict";
import saved from "./fixtures/starter-ev-correction.json";
import {
  computeDeduction,
  type DeductionInput,
  type DeductionPhase,
} from "../src/core/deduction";
import { newSnapshot } from "../src/core/investigation";
import {
  controlledActions,
  createControlledTest,
  actionPixels,
} from "../src/core/controlledExperiments";
import {
  targetExperiment,
  answerExperimentPixel,
  isEvidence,
} from "../src/core/itemTests";
import { generateSidRng } from "../src/core/sidRng";
import { solveSids } from "../src/core/sid";
import type { KnownFacts, Observations } from "../src/core/constraints";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";
import { newStarterGuide } from "../src/core/starterGuide";

// Reported session: two completed move swaps, then Swap moves 1 and 3.
// Previously the unseen future catalogue delayed its one question by ~30 s.
function reportedExperiment(): DeductionInput {
  const identity = saved.identity as KnownFacts;
  const baseline = {
    ...newSnapshot("baseline", "Starter curtain", {
      ...saved.facts,
      moves: [10, 15, 116, 45],
      pp: [35, 30, 30, 40],
    }),
    observations: saved.patterns[0]
      .split("")
      .map((n) => (n === "?" ? -1 : Number(n))) as Observations,
  };
  const actions = controlledActions(baseline, identity.species, identity);
  const snapshots = [baseline];
  for (const [id, targets] of [
    ["moves-0-3", [116, 126]],
    ["moves-2-3", [126, 116, 117, 124]],
  ] as const) {
    let snapshot = targetExperiment(
      createControlledTest(
        baseline,
        id,
        actions.find((a) => a.id === id)!,
        [...targets],
      ),
    );
    for (const n of targets) snapshot = answerExperimentPixel(snapshot, n, 1);
    snapshots.push(snapshot);
  }
  const pending = targetExperiment(
    createControlledTest(
      baseline,
      "pending",
      actions.find((a) => a.id === "moves-0-2")!,
      [124],
      34,
    ),
  );
  snapshots.push(pending);
  return {
    identity,
    snapshots,
    activeId: pending.id,
    sidRng: saved.sidRng,
    starterGuide: true,
    rng: {
      kind: "static",
      seed: 0,
      minAdvance: 1206,
      maxAdvance: 1206,
      methods: ["Method1"],
      areaId: "",
      lead: "none",
      synchronizeNature: 0,
    },
  };
}

test("the reported active test returns its useful pixel with SID results, without ranking future experiments", (t) => {
  const input = reportedExperiment();
  const phases: DeductionPhase[] = [];
  const start = performance.now();
  const result = computeDeduction(input, undefined, (phase) =>
    phases.push(phase),
  );
  const elapsed = performance.now() - start;
  t.diagnostic(`Active test and pixel question: ${Math.round(elapsed)} ms`);
  assert.ok(
    elapsed < 3000,
    "the reported test must not spend tens of seconds on the future catalogue",
  );
  assert.equal(result.sidAnalysis!.sidValues.length, 34);
  assert.deepEqual(
    result.starterQuestions.map((q) => q.index),
    [124],
  );
  assert.equal(result.starterQuestions[0].black, 30);
  assert.equal(result.starterQuestions[0].transparent, 4);
  assert.equal(phases.includes("experiments"), false);
  assert.deepEqual(result.experiments, []);
  assert.deepEqual(result.controlledExperiments, []);
  assert.deepEqual(result.domainQuestions, {});
  assert.ok(input.snapshots.at(-1)!.observations.every((v) => v === -1));
  const pending = input.snapshots.at(-1)!;
  const html = renderToStaticMarkup(
    createElement(StarterCurtainStep, {
      lab: {
        ...result,
        canvasRef: { current: null },
        identity: input.identity,
        pendingItemTest: pending,
        activeSnapshot: pending,
        activeId: pending.id,
        itemTestBaseline: input.snapshots[0],
        obs: pending.observations,
        predictions: result.assistance.predictions,
        analysisBusy: false,
        analysisError: "",
      } as unknown as Parameters<typeof StarterCurtainStep>[0]["lab"],
      state: newStarterGuide(),
      onTraining: () => {},
      onMoreInfo: () => {},
    }),
  );
  assert.match(html, /<button>Black<\/button>/);
  assert.match(html, /<button>Transparent<\/button>/);
  assert.doesNotMatch(
    html,
    /Finding useful questions/,
    "the current question renders immediately from the same result, without a second worker",
  );
});

test("answers preserve exact SID filtering and finishing the test restores prompt next-experiment ranking", (t) => {
  const input = reportedExperiment();
  const baseline = structuredClone(input.snapshots[0]);
  const before = computeDeduction(input);
  const action = controlledActions(
    baseline,
    input.identity.species,
    input.identity,
  ).find((a) => a.id === "moves-0-2")!;
  for (const value of [0, 1] as const) {
    const pending = answerExperimentPixel(input.snapshots.at(-1)!, 124, value);
    const snapshots = [...input.snapshots.slice(0, -1), pending];
    const start = performance.now();
    const result = computeDeduction({
      ...input,
      snapshots,
      activeId: baseline.id,
    });
    const elapsed = performance.now() - start;
    t.diagnostic(
      `Answer ${value}, candidates and next catalogue: ${Math.round(elapsed)} ms`,
    );
    assert.ok(
      elapsed < 3000,
      "the guide must not build checksum questions it never displays",
    );
    const expected = before
      .sidAnalysis!.candidates.filter(
        (h) =>
          actionPixels(baseline, action, h).find((p) => p.index === 124)
            ?.value === value,
      )
      .map((h) => h.sid)
      .sort((a, b) => a - b);
    assert.deepEqual(result.sidAnalysis!.sidValues, expected);
    const fullEvidence = solveSids(
      input.identity,
      snapshots.filter(isEvidence),
      [input.identity.pid!],
      undefined,
      Infinity,
      generateSidRng(input.identity.tid!, saved.sidRng).map((row) => row.sid),
    );
    assert.deepEqual(
      result.sidAnalysis!.sidValues,
      fullEvidence.sidValues,
      "only ranking is optimized; real recorded checksum and pixel evidence is still enforced",
    );
    assert.ok(
      result.experiments.length + result.controlledExperiments.length > 0,
    );
    assert.deepEqual(result.starterQuestions, []);
    assert.deepEqual(input.snapshots[0], baseline);
  }
});
