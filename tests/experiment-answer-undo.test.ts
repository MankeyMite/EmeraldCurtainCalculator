import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import saved from "./fixtures/starter-wrong-sid-answer.json";
import {
  answerExperimentPixel,
  experimentToUndo,
  undoExperimentAnswer,
  createItemTest,
  targetExperiment,
  isRecorded,
} from "../src/core/itemTests";
import {
  loadInvestigation,
  saveInvestigation,
  newSnapshot,
  type Snapshot,
} from "../src/core/investigation";
import { validateFacts } from "../src/core/session";
import { computeDeduction, EMPTY_DEDUCTION } from "../src/core/deduction";
import { PROFILE } from "../src/core/memory";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";
import { newStarterGuide } from "../src/core/starterGuide";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

function session() {
  return loadInvestigation(
    JSON.stringify({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "static",
      identity: saved.identity,
      snapshots: saved.snapshots,
      activeId: saved.snapshots[0].id,
      ownedItems: [],
      sidRng: saved.sidRng,
      rng: {
        kind: "static",
        seed: 0,
        minAdvance: 1222,
        maxAdvance: 1222,
        methods: ["Method1"],
        areaId: "",
        lead: "none",
        synchronizeNature: 0,
      },
    }),
  );
}

test("undoing the saved completed experiment restores excluded SIDs and survives reload before reanswering", () => {
  const original = session(),
    before = JSON.stringify(original);
  const solve = (s: ReturnType<typeof session>) =>
    computeDeduction({ ...s, starterGuide: true }).sidAnalysis?.sidValues;
  assert.deepEqual(solve(original), [21263]);
  const experiment = experimentToUndo(original.snapshots)!;
  assert.equal(experiment.name, "Swap moves 3 and 4");
  const undone = undoExperimentAnswer(experiment);
  assert.equal(undone.observations[102], -1);
  assert.equal(undone.itemTest?.recheckPixel, 102);
  assert.equal(isRecorded(undone), false);
  assert.deepEqual(undone.knownFacts, experiment.knownFacts);
  let reopened = {
    ...original,
    activeId: undone.id,
    snapshots: original.snapshots.map((s) => (s.id === undone.id ? undone : s)),
  };
  assert.deepEqual(solve(reopened), [21263, 49423]);
  reopened = loadInvestigation(saveInvestigation(reopened));
  assert.deepEqual(solve(reopened), [21263, 49423]);
  assert.equal(reopened.snapshots.at(-1)?.itemTest?.recheckPixel, 102);
  const corrected = answerExperimentPixel(reopened.snapshots.at(-1)!, 102, 0);
  assert.equal(corrected.itemTest?.recheckPixel, undefined);
  assert.equal(isRecorded(corrected), true);
  assert.deepEqual(
    solve({
      ...reopened,
      snapshots: [...reopened.snapshots.slice(0, -1), corrected],
    }),
    [49423],
  );
  assert.equal(
    JSON.stringify(original),
    before,
    "original pixels, setup and other experiments are untouched",
  );
});

test("partial and completed answers undo in actual answer order, keeping other evidence", () => {
  const base = newSnapshot("base", "Baseline", { heldItem: 0 });
  let draft = targetExperiment(createItemTest(base, "test", 4, [84, 86, 88]));
  assert.equal(experimentToUndo([base, draft]), undefined);
  draft = answerExperimentPixel(draft, 88, 1);
  draft = answerExperimentPixel(draft, 84, 0);
  draft = answerExperimentPixel(draft, 86, 1);
  assert.equal(isRecorded(draft), true);
  for (const index of [86, 84, 88]) {
    const before = draft.observations.slice();
    draft = undoExperimentAnswer(draft);
    assert.equal(draft.itemTest?.recheckPixel, index);
    assert.equal(draft.observations[index], -1);
    assert.ok(
      draft.observations.every((v, n) => n === index || v === before[n]),
    );
  }
  assert.equal(experimentToUndo([base, draft]), undefined);
  assert.throws(() => undoExperimentAnswer(draft), /No experiment answer/);
  const blank = targetExperiment(createItemTest(base, "blank", 4, [84]));
  const completed = answerExperimentPixel(
    targetExperiment(createItemTest(base, "completed", 4, [84])),
    84,
    1,
  );
  assert.equal(
    experimentToUndo([base, completed, blank]),
    undefined,
    "do not replace another unfinished experiment",
  );
  const child = answerExperimentPixel(
    targetExperiment(createItemTest(completed, "child", 4, [84])),
    84,
    1,
  );
  assert.equal(
    experimentToUndo([base, child, completed])?.id,
    child.id,
    "never reopen an ancestor and invalidate a recorded child",
  );
});

test("answer history persists and rejects invalid target references", () => {
  const base = newSnapshot("base", "Baseline");
  let draft = targetExperiment(createItemTest(base, "test", 4, [84, 86]));
  draft = answerExperimentPixel(draft, 86, 1);
  draft = answerExperimentPixel(draft, 84, 0);
  const investigation = {
    ...session(),
    identity: validateFacts({}),
    snapshots: [base, draft],
    activeId: base.id,
    rng: undefined,
    sidRng: undefined,
  };
  const restored = loadInvestigation(saveInvestigation(investigation));
  assert.equal(
    undoExperimentAnswer(restored.snapshots[1]).observations[84],
    -1,
  );
  draft.itemTest!.answerOrder = [87];
  assert.throws(() => saveInvestigation(investigation), /answer order/);
});

test("the guide offers undo after completion and reopens the exact pixel even when not ranked useful", () => {
  const investigation = session(),
    experiment = experimentToUndo(investigation.snapshots)!;
  const render = (active: Snapshot, pending: boolean) =>
    renderToStaticMarkup(
      createElement(StarterCurtainStep, {
        state: newStarterGuide(),
        onTraining: () => {},
        onMoreInfo: () => {},
        lab: {
          ...EMPTY_DEDUCTION,
          identity: investigation.identity,
          activeSnapshot: active,
          itemTestBaseline: investigation.snapshots[0],
          obs: active.observations,
          canUndoExperimentAnswer: true,
          pendingItemTest: pending ? active : undefined,
          lastCompletedItemTest: pending ? undefined : experiment,
          starterQuestions: [],
          analysisBusy: false,
          drawingInProgress: false,
          sidAnalysis: { sidValues: [21263], candidates: [] },
        } as unknown as CurtainLab,
      }),
    );
  assert.match(
    render(investigation.snapshots[0], false),
    /Undo last experiment answer/,
  );
  const html = render(undoExperimentAnswer(experiment), true);
  assert.match(html, /row 11, column 7/);
  assert.match(html, /Move 4 PP/);
  assert.match(html, />Transparent<|>\s*Transparent\s*</);
});
