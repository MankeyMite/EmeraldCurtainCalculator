import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import saved from "./fixtures/starter-manual-training-stall.json";
import { decodePokemon } from "../src/core/pokemon";
import { newSnapshot, type Snapshot } from "../src/core/investigation";
import { computeDeduction, type DeductionInput } from "../src/core/deduction";
import {
  controlledActions,
  createControlledTest,
} from "../src/core/controlledExperiments";
import {
  createItemTest,
  targetExperiment,
  answerExperimentPixel,
} from "../src/core/itemTests";
import { STARTER_ITEM_IDS } from "../src/core/starterItems";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";
import { newStarterGuide } from "../src/core/starterGuide";
import { evTrainingPlan } from "../src/core/evTraining";
import { curtainLocation } from "../src/components/SidPixelQuestion";

const reference = Buffer.from(saved.referenceHex, "hex");
const actual = decodePokemon(Uint8Array.from(reference));
const identity = { pid: 0x2fca6c06, tid: 50998, species: 280 };
// Independent oracle for this PID's physical A/G/E/M order. Modify decrypted
// bytes directly, refresh the checksum and re-encrypt; never borrow predictions.
function oracle(change: (plain: Buffer) => void) {
  const bytes = Buffer.from(reference);
  const key = (bytes.readUInt32LE(0) ^ bytes.readUInt32LE(4)) >>> 0;
  const plain = Buffer.from(bytes.subarray(32));
  for (let n = 0; n < 48; n += 4)
    plain.writeUInt32LE((plain.readUInt32LE(n) ^ key) >>> 0, n);
  change(plain);
  let sum = 0;
  for (let n = 0; n < 48; n += 2) sum = (sum + plain.readUInt16LE(n)) & 65535;
  bytes.writeUInt16LE(sum, 28);
  for (let n = 0; n < 48; n += 4)
    bytes.writeUInt32LE((plain.readUInt32LE(n) ^ key) >>> 0, 32 + n);
  return bytes;
}
const pixel = (bytes: Buffer, index: number) =>
  ((bytes[(index - 16) >> 1] >>> (((index - 16) % 2) * 4)) & 15) === 0
    ? (0 as const)
    : (1 as const);
function fixture(): DeductionInput {
  assert.equal(actual.checksumValid, true);
  assert.equal(actual.sid, 6425);
  const baseline = newSnapshot("baseline", "Starter curtain", {
    ...identity,
    ivs: [9, 1, 24, 17, 31, 10],
    heldItem: 3,
    moves: [52, 116, 15, 45],
    pp: [25, 30, 30, 40],
    evs: [4, 3, 2, 1, 0, 0],
    ppBonuses: 0,
    contest: [0, 0, 0, 0, 0, 0],
    pokerus: 0,
    isEgg: 0,
    metGame: 3,
    metLevel: 5,
    metLocation: 16,
    ball: 4,
    language: 2,
    headerFlags: 2,
    headerPadding: 0,
    growthPadding: 0,
    ribbons: 0,
    ribbonTail: 0,
  });
  for (let n = 16; n < 176; n++) baseline.observations[n] = pixel(reference, n);
  const snapshots: Snapshot[] = [baseline];
  // Exhaust every cheap allowed item and single move swap with correct answers.
  for (const item of STARTER_ITEM_IDS.filter((id) => id !== 3)) {
    const indices = [108, 109, 110, 111]; // Physical Growth held-item bytes.
    let snapshot = targetExperiment(
      createItemTest(baseline, `item-${item}`, item, indices),
    );
    const bytes = oracle((plain) => plain.writeUInt16LE(item, 14));
    for (const index of indices)
      snapshot = answerExperimentPixel(snapshot, index, pixel(bytes, index));
    snapshots.push(snapshot);
  }
  for (const action of controlledActions(baseline, 280).filter(
    (a) => a.kind === "moves",
  )) {
    const indices = Array.from({ length: 24 }, (_, n) => 80 + n); // Physical Attacks block.
    let snapshot = targetExperiment(
      createControlledTest(baseline, action.id, action, indices),
    );
    const [, a, b] = action.id.split("-").map(Number);
    const bytes = oracle((plain) => {
      const first = plain.readUInt16LE(a * 2),
        second = plain.readUInt16LE(b * 2);
      plain.writeUInt16LE(second, a * 2);
      plain.writeUInt16LE(first, b * 2);
      [plain[8 + a], plain[8 + b]] = [plain[8 + b], plain[8 + a]];
    });
    for (const index of indices)
      snapshot = answerExperimentPixel(snapshot, index, pixel(bytes, index));
    snapshots.push(snapshot);
  }
  return {
    identity,
    snapshots,
    activeId: baseline.id,
    sidRng: { minAdvance: 1185, maxAdvance: 1305 },
    starterGuide: true,
  };
}

test("the reported Torchic continues from two SIDs with five manual Speed EV battles, without vitamins or changed baseline items", () => {
  const input = fixture(),
    baseline = input.snapshots[0];
  const result = computeDeduction(input);
  assert.deepEqual(result.sidAnalysis!.sidValues, [6425, 21273]);
  const ev = result.controlledExperiments.filter((e) => e.action.kind === "ev");
  assert.ok(ev.length > 0);
  assert.ok(ev.every((e) => e.action.training!.vitamins === 0));
  assert.ok(
    result.controlledExperiments.every((e) => e.action.kind !== "vitamin"),
  );
  const best = ev
    .slice()
    .sort((a, b) => a.action.training!.seconds - b.action.training!.seconds)[0];
  assert.equal(best.action.id, "ev-3-6");
  assert.equal(best.action.training!.battles, 5);
  const bytes = oracle((plain) => {
    plain[27] = 6;
  }); // EV block byte 3: Speed.
  const target = best.pixels.find((p) => p.index === 134)!;
  assert.ok(target);
  assert.equal(curtainLocation(134), "row 15, column 7");
  assert.equal(pixel(bytes, 134), 0);
  let experiment = targetExperiment(
    createControlledTest(baseline, "manual", best.action, [134]),
  );
  assert.equal(experiment.knownFacts.heldItem, 3);
  experiment = answerExperimentPixel(experiment, 134, pixel(bytes, 134));
  const resolved = computeDeduction({
    ...input,
    snapshots: [...input.snapshots, experiment],
  });
  assert.deepEqual(resolved.sidAnalysis!.sidValues, [6425]);
  const pending = targetExperiment(
    createItemTest(baseline, "pending", 13, [108]),
  );
  assert.equal(pending.knownFacts.heldItem, 13);
  assert.equal(baseline.knownFacts.heldItem, 3);

  const render = (active: Snapshot, pendingTest?: Snapshot) =>
    renderToStaticMarkup(
      createElement(StarterCurtainStep, {
        lab: {
          ...result,
          canvasRef: { current: null },
          identity,
          itemTestBaseline: baseline,
          activeSnapshot: active,
          activeId: active.id,
          obs: active.observations,
          predictions: result.assistance.predictions,
          pendingItemTest: pendingTest,
          lastCompletedItemTest: input.snapshots.at(-1),
          analysisBusy: false,
          analysisError: "",
        },
        state: newStarterGuide(),
        onTraining: () => {},
        onMoreInfo: () => {},
      } as unknown as Parameters<typeof StarterCurtainStep>[0]),
    );
  const html = render(baseline);
  assert.match(html, /Next: Speed EVs to 6/);
  assert.match(html, /<button>Try this experiment<\/button>/);
  assert.doesNotMatch(html, /Update battle log and moves/);
  assert.match(html, /Current setup: Hold GREAT BALL/);
  assert.match(html, /Move order: Ember \/ Focus Energy \/ Cut \/ Growl/);
  const pendingHtml = render(pending, pending);
  assert.match(pendingHtml, /Starting setup: Hold GREAT BALL/);
  assert.match(pendingHtml, /Give the starter POTION while boxed/);
});

test("manual-only training keeps reachable checkpoints that a cheaper vitamin plan previously hid", () => {
  const facts = { evs: [4, 3, 2, 1, 0, 0], heldItem: 3, pokerus: 0 };
  assert.equal(evTrainingPlan(facts, 3, 22)!.vitamins, 2);
  assert.equal(
    evTrainingPlan(facts, 3, 22, { allowVitamins: false })!.battles,
    21,
  );
  assert.equal(
    evTrainingPlan(facts, 3, 22, { allowVitamins: false })!.vitamins,
    0,
  );
  assert.equal(
    evTrainingPlan({ ...facts, pokerus: undefined }, 3, 22, {
      allowVitamins: false,
    }),
    null,
  );
  assert.equal(
    evTrainingPlan({ ...facts, evs: [250, 250, 2, 1, 0, 0] }, 3, 9, {
      allowVitamins: false,
    }),
    null,
  );
  assert.equal(
    evTrainingPlan({ ...facts, pokerus: 0x11 }, 3, 7, { allowVitamins: false })!
      .battles,
    3,
  );
  assert.equal(
    evTrainingPlan({ ...facts, pokerus: 0x11 }, 3, 6, { allowVitamins: false }),
    null,
  );
});
