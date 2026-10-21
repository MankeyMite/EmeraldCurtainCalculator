import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ItemTestControls } from "../src/components/ItemTestControls";
import type { CurtainLab } from "../src/hooks/useCurtainLab";
import { computeDeduction } from "../src/core/deduction";
import { validateFacts } from "../src/core/session";
import {
  controlledActions,
  createControlledTest,
} from "../src/core/controlledExperiments";
import {
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { targetExperiment, answerExperimentPixel } from "../src/core/itemTests";
import { solveSids } from "../src/core/sid";

const uploaded = () =>
  loadInvestigation(
    fs.readFileSync(
      "research/fixtures/spinda-strength-investigation.json",
      "utf8",
    ),
  );

test("controlled changes discard stale zero-default labels, keeping the original assumptions", () => {
  const input = uploaded(),
    source = input.snapshots[0],
    original = JSON.stringify(source);
  const actions = controlledActions(
    { ...source, experimentPokeblock: [20, 0, 0, 0, 0, 20] },
    308,
    input.identity,
  );
  for (const id of [
    "teach-70",
    "teach-70-swap-3-0",
    "rare-candy-16",
    "rare-candy-16-swap-3-0",
    "pp-up-0",
    "vitamin-0",
    "pokeblock",
  ]) {
    const action = actions.find((a) => a.id === id)!;
    assert.ok(action, id);
    const target = targetExperiment(
      createControlledTest(source, id, action, [126]),
    );
    assert.doesNotThrow(() => validateFacts(target.knownFacts, false), id);
    assert.equal(target.observations.filter((v) => v !== -1).length, 0);
    assert.doesNotThrow(
      () =>
        saveInvestigation({
          ...input,
          snapshots: [...input.snapshots, target],
          activeId: target.id,
        }),
      id,
    );
  }
  assert.equal(JSON.stringify(source), original);
  assert.throws(
    () =>
      validateFacts({ moves: [33, 253, 185, 70], assumed: ["move_3"] }, false),
    /Default assumption metadata/,
    "invalid imported assumptions still fail validation",
  );
});

test("uploaded Spinda can start Strength, display answer buttons and retain only verified outcomes", () => {
  const input = uploaded(),
    source = input.snapshots[0],
    before = JSON.stringify(input);
  const action = controlledActions(
    source,
    input.identity.species,
    input.identity,
  ).find((a) => a.id === "teach-70")!;
  const active = targetExperiment(
    createControlledTest(source, "strength", action, [126]),
  );
  const snapshots = [...input.snapshots, active];
  const result = computeDeduction({ ...input, snapshots, activeId: active.id });
  assert.equal(input.identity.pid, undefined);
  assert.equal(input.identity.sid, undefined);
  assert.equal(result.sidAnalysis!.candidates.length, 11);
  assert.deepEqual(result.experimentTargets, [126]);
  assert.equal(result.assistance.predictions[126], -1);
  assert.equal(active.observations[126], -1);
  const lab = {
    ...result,
    activeSnapshot: active,
    pendingItemTest: active,
    itemTestBaseline: source,
    currentSnapshots: snapshots,
  } as unknown as CurtainLab;
  const markup = renderToStaticMarkup(
    createElement(ItemTestControls, { lab, openEditor() {}, openResults() {} }),
  );
  assert.match(markup, /Checking pixel 1 of 1/);
  assert.match(markup, /<button>Black<\/button>/);
  assert.match(markup, /<button>Transparent<\/button>/);
  const errorMarkup = renderToStaticMarkup(
    createElement(ItemTestControls, {
      lab: { ...lab, analysisError: "Example worker error" },
      openEditor() {},
      openResults() {},
    }),
  );
  assert.match(
    errorMarkup,
    /Analysis could not complete: Example worker error/,
  );
  assert.match(errorMarkup, /<button disabled="">Black<\/button>/);
  assert.doesNotMatch(errorMarkup, /11 compatible hypotheses/);
  for (const value of [0, 1] as const) {
    const answered = answerExperimentPixel(active, 126, value);
    const after = solveSids(
      input.identity,
      [...input.snapshots, answered],
      [...new Set(result.sidAnalysis!.candidates.map((h) => h.pid))],
      result.wildResult!.spreads,
      128,
      result.sidAnalysis!.sidValues,
    );
    assert.equal(after.candidates.length, value === 0 ? 1 : 10);
    if (value === 0) assert.deepEqual(after.sidValues, [42454]);
    assert.equal(answered.observations.filter((v) => v !== -1).length, 1);
  }
  assert.equal(JSON.stringify(input), before);
});
