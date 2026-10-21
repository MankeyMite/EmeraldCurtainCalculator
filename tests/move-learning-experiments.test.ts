import test from "node:test";
import assert from "node:assert/strict";
import {
  controlledActions,
  createControlledTest,
  actionPixels,
  rankControlledExperiments,
} from "../src/core/controlledExperiments";
import { moveLearningActions } from "../src/core/moveLearningExperiments";
import {
  rankDomainExperiments,
  type ExperimentDomain,
} from "../src/core/domainExperiments";
import { makeHypothesis } from "../src/core/sid";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
} from "../src/core/investigation";
import { targetExperiment, answerExperimentPixel } from "../src/core/itemTests";
import { experimentChecksumDelta } from "../src/core/checksumExperiments";
import { decodePokemon, SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { PROFILE } from "../src/core/memory";

const baseline = () => ({
  ...newSnapshot("base", "Spinda", {
    moves: [33, 253, 185, 0],
    pp: [35, 10, 20, 0],
    ppBonuses: 0,
    experience: 2195,
    friendship: 70,
    heldItem: 0,
  }),
  summaryStats: { level: 14, stats: Array(6).fill(null) },
});
const sidValues = [
  43222, 44758, 45014, 44246, 44502, 41686, 41430, 42710, 42966, 42198, 42454,
];
// Previously validated tiny set from the uploaded Spinda's existing RNG scope.
// No encounter scan or PID/SID search is performed by these tests.
const candidates = sidValues.map((sid) =>
  makeHypothesis(2852727836, 9918, sid),
);

test("compatible teaching fills the first known empty slot and models legal follow-up swaps", () => {
  const source = baseline();
  const actions = moveLearningActions(source, 308);
  const flash = actions.find((a) => a.id === "teach-148")!;
  assert.ok(flash);
  assert.match(flash.name, /Flash.*HM05.*slot 4/);
  assert.deepEqual(flash.changes.moves, [33, 253, 185, 148]);
  assert.deepEqual(flash.changes.pp, [35, 10, 20, 20]);
  assert.ok(actions.some((a) => a.id === "teach-70-swap-3-2"));
  assert.ok(
    !actions.some((a) => a.id === "teach-57"),
    "Spinda cannot learn Surf",
  );
  assert.ok(
    !controlledActions(source, 308).some((a) => a.id === "moves-0-3"),
    "empty summary slots are unselectable",
  );
  assert.deepEqual(
    moveLearningActions(
      { ...source, knownFacts: { moves: [33, null, 185, 0] } },
      308,
    ),
    [],
  );
  assert.deepEqual(
    moveLearningActions(
      { ...source, knownFacts: { moves: [33, 253, 185, 148] } },
      308,
    ),
    [],
  );
  const earlierHole = moveLearningActions(
    { ...source, knownFacts: { moves: [33, 0, 185, 0], ppBonuses: 0 } },
    308,
  );
  assert.deepEqual(
    earlierHole.find((a) => a.id === "teach-148")!.changes.moves,
    [33, 148, 185, 0],
  );
  assert.ok(
    !earlierHole.some((a) => a.id.endsWith("swap-1-3")),
    "second empty slot still cannot be selected",
  );
});

test("learn-then-swap encryption and packed PP counters match independent byte construction in all orders", () => {
  const source = baseline();
  source.knownFacts.ppBonuses = 5;
  source.knownFacts.pp = [42, 12, 20, 0];
  const action = moveLearningActions(source, 308).find(
    (a) => a.id === "teach-70-swap-3-0",
  )!;
  assert.deepEqual(action.changes.moves, [70, 253, 185, 33]);
  assert.deepEqual(action.changes.pp, [15, 12, 20, 42]);
  assert.equal(action.changes.ppBonuses, 0x44);
  for (let pid = 0; pid < 24; pid++) {
    const h = makeHypothesis(pid, 9918, 44758);
    const record = new Uint8Array(80),
      view = new DataView(record.buffer);
    view.setUint32(0, h.pid, true);
    view.setUint32(4, h.otId, true);
    const blocks = SUBSTRUCT_POSITIONS[pid].map((n) => 32 + n * 12);
    view.setUint8(blocks[0] + 8, 0x44);
    [70, 253, 185, 33].forEach((move, i) =>
      view.setUint16(blocks[1] + i * 2, move, true),
    );
    [15, 12, 20, 42].forEach((pp, i) => view.setUint8(blocks[1] + 8 + i, pp));
    let sum = 0;
    for (let at = 32; at < 80; at += 2)
      sum = (sum + view.getUint16(at, true)) & 65535;
    view.setUint16(28, sum, true);
    for (let at = 32; at < 80; at += 4)
      view.setUint32(at, view.getUint32(at, true) ^ h.key, true);
    assert.ok(decodePokemon(record).checksumValid);
    for (const p of actionPixels(source, action, h)) {
      const byte = record[Math.floor((p.index - 16) / 2)];
      assert.equal(
        p.value,
        ((byte >>> ((p.index % 2) * 4)) & 15) === 0 ? 0 : 1,
      );
    }
  }
  const target = createControlledTest(source, "test", action, [126]);
  assert.equal(target.knownFacts.friendship, undefined);
  assert.equal(experimentChecksumDelta(source, target), null);
  source.knownFacts.friendship = 255;
  const stable = moveLearningActions(source, 308).find(
    (a) => a.id === action.id,
  )!;
  assert.equal(
    experimentChecksumDelta(
      source,
      createControlledTest(source, "stable", stable, [126]),
    ),
    70 + (15 - 42) + 42 * 256 + (0x44 - 5),
  );
});

test("Spinda gets informative learning and level-16 routes, while fixed outcomes are rejected", () => {
  const source = baseline(),
    identity = { species: 308, tid: 9918 };
  const counts = Array.from({ length: 24 }, () =>
    Array.from({ length: 8 }, () => Array<number>(16).fill(0)),
  );
  for (const h of candidates)
    for (let n = 0; n < 8; n++)
      counts[h.pid % 24][n][(h.key >>> (n * 4)) & 15]++;
  const domain: ExperimentDomain = {
    consistent: true,
    orders: [20],
    headerPairCount: 11n,
    orderKeyCounts: counts,
  };
  const ranked = rankDomainExperiments(identity, [source], source, domain);
  for (const id of [
    "teach-148",
    "teach-70",
    "teach-241",
    "rare-candy-16",
    "teach-70-swap-3-2",
  ]) {
    const recommendation = ranked.controlledExperiments.find(
      (e) => e.action.id === id,
    )!;
    assert.ok(recommendation, id);
    assert.equal(recommendation.worstCase, 10, id);
    assert.ok(recommendation.pixels.some((p) => p.index === 126));
  }
  assert.ok(
    !ranked.controlledExperiments.some((e) => e.action.id === "rare-candy"),
  );
  assert.ok(
    !ranked.controlledExperiments.some((e) => e.action.id === "teach-94"),
    "Psychic has 10 PP: unchanged black for every remaining key",
  );
  const finite = rankControlledExperiments(
    source,
    308,
    candidates,
    identity,
  ).find((e) => e.action.id === "teach-148")!;
  assert.equal(finite.worstCase, 10);
  const target = targetExperiment(
    createControlledTest(
      source,
      "flash",
      finite.action,
      finite.pixels.map((p) => p.index),
    ),
  );
  const answered = answerExperimentPixel(target, 126, 0);
  const survivors = candidates.filter(
    (h) =>
      actionPixels(source, finite.action, h).find((p) => p.index === 126)!
        .value === answered.observations[126],
  );
  assert.deepEqual(
    survivors.map((h) => h.sid),
    [44758],
  );
  const allBlack = candidates.filter((h) => h.sid !== 44758);
  const repeated = rankControlledExperiments(
    source,
    308,
    allBlack,
    identity,
  ).find((e) => e.action.id === "teach-148")!;
  assert.deepEqual(
    repeated.pixels,
    [],
    "a now-indistinguishable teaching route is not recommended again",
  );
});

test("lookahead and composite teaching save their full facts, without unknown PP or friendship assumptions", () => {
  const source = baseline();
  const candy = controlledActions(source, 308).find(
    (a) => a.id === "rare-candy-16",
  )!;
  assert.equal(candy.level, 16);
  assert.equal(candy.changes.experience, 3276);
  assert.deepEqual(candy.changes.moves, [33, 253, 185, 60]);
  assert.deepEqual(candy.changes.pp, [35, 10, 20, 20]);
  assert.match(candy.instructions, /2 Rare Candies/);
  const unknown = {
    ...source,
    knownFacts: { moves: [33, 253, 185, 0], friendship: 255 },
  };
  const teach = moveLearningActions(unknown, 308).find(
    (a) => a.id === "teach-148-swap-3-0",
  )!;
  assert.deepEqual(teach.changes.pp, [null, null, null, null]);
  const target = targetExperiment(
    createControlledTest(unknown, "unknown", teach, [126]),
  );
  assert.equal(target.knownFacts.ppBonuses, undefined);
  assert.equal(experimentChecksumDelta(unknown, target), null);
  const completed = answerExperimentPixel(target, 126, 1);
  const original = { ...newSnapshot("base", "Spinda", unknown.knownFacts) };
  const decoded = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      identity: { species: 308 },
      origin: "wild",
      ownedItems: [],
      snapshots: [original, completed],
      activeId: original.id,
    }),
  );
  assert.equal(decoded.snapshots[1].itemTest!.actionId, "teach-148-swap-3-0");
  assert.equal(
    decoded.snapshots[1].observations.filter((v) => v !== -1).length,
    1,
  );
  const candySnapshot = targetExperiment(
    createControlledTest(source, "candy", candy, [126]),
  );
  const candyRoundtrip = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      identity: { species: 308 },
      origin: "wild",
      ownedItems: [],
      snapshots: [source, candySnapshot],
      activeId: source.id,
    }),
  );
  assert.equal(candyRoundtrip.snapshots[1].itemTest!.actionId, "rare-candy-16");
});
