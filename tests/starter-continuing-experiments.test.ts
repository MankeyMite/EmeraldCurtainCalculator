import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import saved from "./fixtures/starter-manual-training-stall.json";
import { decodePokemon } from "../src/core/pokemon";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
  type Snapshot,
} from "../src/core/investigation";
import { computeDeduction, type DeductionInput } from "../src/core/deduction";
import {
  continueStarterExperiment,
  starterExperimentSource,
  updatedStarterCheckpoint,
  hasStarterDrawing,
} from "../src/core/starterExperimentFlow";
import {
  answerExperimentPixel,
  createItemTest,
  targetExperiment,
  undoExperimentAnswer,
  itemTestBaseline,
} from "../src/core/itemTests";
import {
  createControlledTest,
  controlledActions,
} from "../src/core/controlledExperiments";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";
import { newStarterGuide } from "../src/core/starterGuide";
import { PROFILE } from "../src/core/memory";
import type { KnownFacts } from "../src/core/constraints";

const bytes = Uint8Array.from(Buffer.from(saved.referenceHex, "hex"));
const actual = decodePokemon(bytes);
const identity = {
  pid: actual.pid,
  tid: actual.tid,
  species: actual.species,
  ivs: actual.ivs,
};
const pixel = (record: Uint8Array, n: number): 0 | 1 =>
  ((record[(n - 16) >> 1] >>> (((n - 16) % 2) * 4)) & 15) === 0 ? 0 : 1;
function fixture(): DeductionInput {
  const baseline = newSnapshot("baseline", "Starter curtain", {
    heldItem: actual.heldItem,
    moves: actual.moves,
    pp: actual.pp,
    evs: actual.evs,
    pokerus: 0,
    ppBonuses: 0,
    contest: [0, 0, 0, 0, 0, 0],
    isEgg: 0,
  });
  for (let n = 16; n < 176; n++) baseline.observations[n] = pixel(bytes, n);
  return {
    identity,
    snapshots: [baseline],
    activeId: baseline.id,
    sidCandidates: [6425, 21273],
    starterGuide: true,
  };
}
function save(input: DeductionInput) {
  return loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "static",
      identity: input.identity,
      snapshots: input.snapshots,
      activeId: input.activeId,
      ownedItems: [],
    }),
  );
}

test("new battle-log EVs never reinterpret the old drawing or solve the SID before a new pixel answer", () => {
  const input = fixture(),
    original = input.snapshots[0],
    before = JSON.stringify(original);
  const prior = computeDeduction(input);
  assert.deepEqual(prior.sidAnalysis!.sidValues, [6425, 21273]);
  // This reproduces the reported failure: six EVs combined with old black pixels
  // exclude the true SID, falsely confirming 21273 without a new observation.
  const evs = actual.evs.slice();
  evs[3] = 6;
  const wrong = structuredClone(original);
  wrong.knownFacts.evs = evs;
  assert.deepEqual(
    computeDeduction({ ...input, snapshots: [wrong] }).sidAnalysis!.sidValues,
    [21273],
  );
  const current = updatedStarterCheckpoint(
    original,
    identity,
    { ...original.knownFacts, evs },
    prior.sidAnalysis!.candidates,
    "trained",
  )!;
  assert.ok(current.itemTest);
  assert.equal(current.itemTest!.sourceId, original.id);
  assert.ok(current.targets!.includes(134));
  assert.ok(current.observations.every((v) => v === -1));
  assert.equal(current.knownFacts.heldItem, actual.heldItem);
  assert.equal(JSON.stringify(original), before);
  const pending = {
    ...input,
    snapshots: [original, current],
    activeId: current.id,
  };
  assert.deepEqual(
    computeDeduction(pending).sidAnalysis!.sidValues,
    [6425, 21273],
  );
  const loaded = save(pending);
  assert.deepEqual(
    computeDeduction({ ...pending, ...loaded }).sidAnalysis!.sidValues,
    [6425, 21273],
  );
  // The independent encrypted reference has key byte 0x36. Six Speed EVs
  // produce ciphertext 0x30, so its low nibble at observation 134 is transparent.
  const keyByte =
    ((actual.pid ^ ((actual.sid << 16) | actual.tid)) >>> 24) & 255;
  assert.equal(keyByte, 0x36);
  assert.equal((6 ^ keyByte) & 15, 0);
  const answered = answerExperimentPixel(current, 134, 0);
  const complete = { ...pending, snapshots: [original, answered] };
  assert.deepEqual(computeDeduction(complete).sidAnalysis!.sidValues, [6425]);
  const undone = undoExperimentAnswer(answered);
  assert.deepEqual(
    computeDeduction({ ...complete, snapshots: [original, undone] })
      .sidAnalysis!.sidValues,
    [6425, 21273],
  );
  assert.equal(JSON.stringify(original), before);
  assert.equal(
    itemTestBaseline(complete.snapshots),
    original,
    "advanced tools retain the original baseline",
  );
});

test("chained item and move tests retain the latest physical setup and independent earlier facts across reloads", () => {
  const input = fixture(),
    original = input.snapshots[0],
    before = JSON.stringify(original);
  let held = continueStarterExperiment(
    targetExperiment(createItemTest(original, "potion", 13, [108])),
  );
  held = answerExperimentPixel(held, 108, 1);
  const ss = [original, held];
  assert.equal(starterExperimentSource(ss, held.id), held);
  assert.equal(held.knownFacts.heldItem, 13);
  const action = controlledActions(held, 280).find(
    (a) => a.id === "moves-0-1",
  )!;
  let swapped = continueStarterExperiment(
    targetExperiment(createControlledTest(held, "swap", action, [96])),
  );
  assert.equal(swapped.itemTest!.sourceId, held.id);
  assert.equal(swapped.knownFacts.heldItem, 13);
  assert.deepEqual(swapped.knownFacts.moves, [116, 52, 15, 45]);
  assert.doesNotMatch(
    swapped.itemTest!.action!.instructions,
    /swap.*back|restore the original/i,
  );
  swapped = answerExperimentPixel(swapped, 96, 1);
  ss.push(swapped);
  const nextItem = continueStarterExperiment(
    targetExperiment(
      createItemTest(
        starterExperimentSource(ss, swapped.id),
        "antidote",
        14,
        [108],
      ),
    ),
  );
  assert.equal(nextItem.itemTest!.sourceId, swapped.id);
  assert.deepEqual(nextItem.knownFacts.moves, [116, 52, 15, 45]);
  assert.equal(nextItem.knownFacts.heldItem, 14);
  assert.equal(
    starterExperimentSource([...ss, nextItem], nextItem.id),
    swapped,
  );
  const reloaded = save({ ...input, snapshots: ss, activeId: swapped.id });
  const current = starterExperimentSource(
    reloaded.snapshots,
    reloaded.activeId,
  );
  assert.deepEqual(current.knownFacts.moves, [116, 52, 15, 45]);
  assert.equal(current.knownFacts.heldItem, 13);
  assert.equal(JSON.stringify(original), before);
  assert.ok(hasStarterDrawing(ss));
});

test("a completed partial experiment still offers the next useful test and never asks to restore a setup", () => {
  const input = fixture(),
    baseline = input.snapshots[0];
  const test = answerExperimentPixel(
    continueStarterExperiment(
      targetExperiment(createItemTest(baseline, "potion", 13, [108])),
    ),
    108,
    1,
  );
  const result = computeDeduction({
    ...input,
    snapshots: [baseline, test],
    activeId: test.id,
  });
  assert.deepEqual(result.sidAnalysis!.sidValues, [6425, 21273]);
  const lab = {
    ...result,
    identity,
    canvasRef: { current: null },
    analysisBusy: false,
    analysisError: "",
    assistance: result.assistance,
    obs: test.observations,
    predictions: result.assistance.predictions,
    activeId: test.id,
    activeSnapshot: test,
    itemTestBaseline: test,
    starterHasDrawing: true,
    lastCompletedItemTest: test,
    canUndoExperimentAnswer: true,
  };
  const html = renderToStaticMarkup(
    createElement(StarterCurtainStep, {
      lab,
      state: newStarterGuide(),
      onTraining: () => {},
      onMoreInfo: () => {},
    } as unknown as Parameters<typeof StarterCurtainStep>[0]),
  );
  assert.match(html, /Current setup: Hold POTION/);
  assert.match(html, /<button>Try this experiment<\/button>/);
  assert.doesNotMatch(
    html,
    /Restore this setup|restore the starting setup|Finish drawing/,
  );
  assert.match(html, /Next: Speed EVs to 6/);
  const actions = result.controlledExperiments.filter(
    (e) => e.action.kind === "ev",
  );
  assert.ok(actions.every((e) => e.action.training!.vitamins === 0));
  const unchanged = updatedStarterCheckpoint(
    test,
    identity,
    test.knownFacts,
    result.sidAnalysis!.candidates,
    "unchanged",
  );
  assert.equal(unchanged, null);
});
