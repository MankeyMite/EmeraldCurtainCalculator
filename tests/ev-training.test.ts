import test from "node:test";
import assert from "node:assert/strict";
import { evTrainingPlan } from "../src/core/evTraining";
import { compareSidSteps, estimateNextSpinda } from "../src/core/nextSidStep";
import {
  controlledActions,
  createControlledTest,
  actionPixels,
} from "../src/core/controlledExperiments";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { defaultSpindaMatcher } from "../src/core/spindaMatcher";
import { PROFILE } from "../src/core/memory";
import { makeHypothesis } from "../src/core/sid";
import { experimentChecksumDelta } from "../src/core/checksumExperiments";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { targetExperiment, answerExperimentPixel } from "../src/core/itemTests";
import { computeDeduction } from "../src/core/deduction";

const fresh = { evs: [0, 0, 0, 0, 0, 0], heldItem: 0, pokerus: 0 };

test("EV plans use vitamin checkpoints and 60 seconds for each battle plus return", () => {
  assert.deepEqual(evTrainingPlan(fresh, 2, 40), {
    target: 40,
    vitamins: 4,
    battles: 0,
    gain: 1,
    removeBrace: false,
    seconds: 70,
    lastResort: false,
  });
  assert.equal(evTrainingPlan(fresh, 2, 41)?.seconds, 130);
  assert.equal(evTrainingPlan(fresh, 2, 49)?.seconds, 610);
  assert.equal(evTrainingPlan(fresh, 2, 100)?.battles, 0);
  assert.equal(evTrainingPlan(fresh, 2, 110)?.lastResort, false);
  assert.equal(evTrainingPlan(fresh, 2, 111)?.lastResort, true);
  assert.equal(
    evTrainingPlan({ ...fresh, evs: [250, 250, 0, 0, 0, 0] }, 2, 11),
    null,
  );
  assert.equal(evTrainingPlan({ ...fresh, pokerus: undefined }, 2, 11), null);
  assert.equal(
    evTrainingPlan({ ...fresh, pokerus: undefined }, 2, 10)?.vitamins,
    1,
  );
});

test("training accounts for active/cured Pokerus, Macho Brace, exact reachability and cap truncation", () => {
  for (const pokerus of [0x11, 0x10]) {
    assert.equal(evTrainingPlan({ ...fresh, pokerus }, 3, 42)?.gain, 2);
    assert.equal(evTrainingPlan({ ...fresh, pokerus }, 3, 41), null);
    const fast = evTrainingPlan({ ...fresh, pokerus, heldItem: 181 }, 3, 48)!;
    assert.equal(fast.gain, 4);
    assert.equal(fast.battles, 2);
    assert.equal(fast.removeBrace, false);
    const exact = evTrainingPlan({ ...fresh, pokerus, heldItem: 181 }, 3, 42)!;
    assert.equal(exact.gain, 2);
    assert.equal(exact.removeBrace, true);
    assert.equal(
      evTrainingPlan({ ...fresh, pokerus, heldItem: 181 }, 3, 255)?.target,
      255,
    );
  }
});

test("targeted training covers every reachable SID key digit and never keeps old battle plaintext", () => {
  const source = newSnapshot("base", "Spinda", {
    ...fresh,
    experience: 2700,
    moves: [33, 253, 185, 0],
    pp: [35, 10, 20, 0],
    ppBonuses: 0,
    friendship: 70,
    checksum: 1234,
  });
  source.summaryStats = { level: 15, stats: [45, 23, 24, 27, 22, 25] };
  const actions = controlledActions(source, 308).filter((a) => a.kind === "ev");
  for (const stat of [2, 3])
    for (const half of [0, 1])
      for (let digit = 0; digit < 16; digit++)
        assert.ok(
          actions.some(
            (a) =>
              a.id.startsWith(`ev-${stat}-`) &&
              ((a.training!.target >>> (half * 4)) & 15) === digit,
          ),
          `${stat}/${half}/${digit}`,
        );
  const action = actions.find((a) => a.training!.battles > 0)!;
  const record = createControlledTest(source, "training", action, [100]);
  for (const key of [
    "experience",
    "moves",
    "pp",
    "ppBonuses",
    "friendship",
    "pokerus",
    "checksum",
  ] as const)
    assert.equal(record.knownFacts[key], undefined, key);
  assert.equal(record.summaryStats?.level, undefined);
  assert.deepEqual(record.summaryStats?.stats, Array(6).fill(null));
  assert.equal(experimentChecksumDelta(source, record), null);
  assert.equal(source.knownFacts.experience, 2700);
  const restored = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "wild",
      identity: { species: 308 },
      snapshots: [source, record],
      activeId: source.id,
      ownedItems: [],
    }),
  );
  assert.equal(restored.snapshots[1].itemTest?.actionId, action.id);
  assert.equal(restored.snapshots[1].itemTest?.action?.kind, "ev");
});

test("independently encoded EV answers narrow the real SID without relying on battle side effects", () => {
  const pid = 0xbe9b3af5,
    sid = 0xa2d6,
    tid = 9918;
  const source = newSnapshot("base", "Spinda", fresh);
  const identity = { pid, tid, species: 308 };
  const candidates = [0x62d6, 0x72d6, sid, 0xb2d6];
  const before = computeDeduction({
    identity,
    snapshots: [source],
    activeId: source.id,
    sidCandidates: candidates,
  });
  const recommendation = before.controlledExperiments.find(
    (e) => e.action.kind === "ev" && !e.action.training!.lastResort,
  )!;
  assert.ok(recommendation);
  const action = recommendation.action;
  let record = targetExperiment(
    createControlledTest(
      source,
      "test",
      action,
      recommendation.pixels.map((p) => p.index),
    ),
  );
  const key = (pid ^ ((sid << 16) | tid)) >>> 0;
  for (const index of record.targets!) {
    assert.ok(index >= 80, "training must not claim a predictable checksum");
    const physical = index - 80;
    const logical =
      SUBSTRUCT_POSITIONS[pid % 24].indexOf(Math.floor(physical / 24)) * 24 +
      (physical % 24);
    const stat = Math.floor(logical / 2) - 24;
    assert.ok(stat === 2 || stat === 3);
    const plain = (action.changes.evs![stat]! >>> ((logical % 2) * 4)) & 15;
    const value = (plain ^ ((key >>> ((physical % 8) * 4)) & 15)) === 0 ? 0 : 1;
    assert.equal(
      actionPixels(source, action, makeHypothesis(pid, tid, sid)).find(
        (p) => p.index === index,
      )?.value,
      value,
    );
    record = answerExperimentPixel(record, index, value);
  }
  const after = computeDeduction({
    identity,
    snapshots: [source, record],
    activeId: source.id,
    sidCandidates: candidates,
  });
  assert.ok(after.sidAnalysis!.sidValues.includes(sid));
  assert.ok(
    after.sidAnalysis!.sidValues.length < before.sidAnalysis!.sidValues.length,
  );
});

test("next steps compare information per minute and reserve >110 EVs for last", () => {
  const item = { informationGain: 0.8, seconds: 30 };
  const catchStep = { informationGain: 1, seconds: 240 };
  assert.ok(compareSidSteps(item, catchStep) < 0);
  assert.ok(
    compareSidSteps({ informationGain: 0.01, seconds: 30 }, catchStep) > 0,
  );
  assert.ok(
    compareSidSteps(
      { informationGain: 4, seconds: 30, lastResort: true },
      catchStep,
    ) > 0,
  );
  const settings = defaultSpindaMatcher().settings;
  const sids = [0x62d6, 0x72d6],
    tested = [59694, 29426, 4, 62262];
  const original = structuredClone({ settings, sids, tested });
  const estimate = estimateNextSpinda(settings, sids, tested, "male")!;
  assert.equal(estimate.seconds, 240);
  assert.ok(estimate.informationGain > 0 && estimate.informationGain <= 1);
  assert.deepEqual(
    estimateNextSpinda(settings, sids, tested, "male"),
    estimate,
  );
  assert.equal(estimateNextSpinda(settings, [sids[0]], tested), null);
  assert.deepEqual(
    { settings, sids, tested },
    original,
    "simulations never change evidence",
  );
});
