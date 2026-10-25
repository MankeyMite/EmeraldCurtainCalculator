import test from "node:test";
import assert from "node:assert/strict";
import {
  correctStarterCheckpointEvs,
  starterEvsNeedCorrection,
  correctStarterCheckpointFacts,
} from "../src/core/starterEvidence";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
  type Snapshot,
} from "../src/core/investigation";
import { newStarterGuide } from "../src/core/starterGuide";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { solveSids } from "../src/core/sid";
import type { RngSpread } from "../src/core/rng";
import type { KnownFacts, Observations } from "../src/core/constraints";
import saved from "./fixtures/starter-ev-correction.json";
import { pixelAssistance } from "../src/core/pixelAssistance";
import { describeByte } from "../src/core/inspection";
import { isEvidence } from "../src/core/itemTests";
import { generateSidRng } from "../src/core/sidRng";
import { PROFILE } from "../src/core/memory";
import { computeDeduction } from "../src/core/deduction";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";

function savedCheckpoints(): Snapshot[] {
  return [
    ...saved.patterns.map((pattern, i) => ({
      ...newSnapshot(`starter-checkpoint-${4 - i}`, "Starter curtain", {
        ...saved.facts,
        evs: i === 0 ? saved.facts.evs : [0, 3, 0, 1, 0, 0],
      }),
      observations: pattern
        .split("")
        .map((n) => (n === "?" ? -1 : Number(n))) as Observations,
    })),
    {
      ...newSnapshot("original-summary", "Earlier summary stats", {
        evs: [0, 0, 0, 1, 0, 0],
      }),
      summaryStats: saved.summary,
    },
  ];
}

test("the reported red pixel is Move 2 PP; correcting the same drawing releases stale checkpoint copies and survives reload", () => {
  const snapshots = savedCheckpoints();
  const identity = saved.identity as KnownFacts;
  const all = generateSidRng(identity.tid!, saved.sidRng).map((row) => row.sid);
  const solve = (ss: Snapshot[]) =>
    solveSids(
      identity,
      ss.filter(isEvidence),
      [identity.pid!],
      undefined,
      Infinity,
      all,
    ).sidValues;
  assert.equal(all.length, 241);
  assert.deepEqual(solve(snapshots), []);
  const assistance = pixelAssistance(snapshots[0].observations, {
    ...identity,
    ...snapshots[0].knownFacts,
  });
  assert.deepEqual([...assistance.contradictions], [122]);
  assert.equal(describeByte((122 - 16) >> 1, identity.pid).name, "Move 2 PP");
  assert.equal(assistance.predictions[122], 0);

  const corrected = correctStarterCheckpointFacts(snapshots, snapshots[0].id, {
    moves: [10, 15, 116, 45],
    pp: [35, 30, 30, 40],
    evs: [0, 3, 2, 1, 0, 0],
  });
  assert.equal(solve(corrected).length, 68);
  assert.deepEqual(
    corrected.slice(1, 4).map((s) => s.supersededBy),
    Array(3).fill(snapshots[0].id),
  );
  assert.equal(corrected.length, snapshots.length);
  for (let i = 0; i < snapshots.length; i++)
    assert.deepEqual(
      corrected[i].observations,
      snapshots[i].observations,
      "every original pixel remains saved",
    );
  assert.equal(
    corrected[4],
    snapshots[4],
    "the original level-5 EVs must not be changed",
  );
  const restored = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "static",
      identity,
      snapshots: corrected,
      activeId: corrected[0].id,
      ownedItems: [],
      sidRng: saved.sidRng,
    }),
  );
  assert.deepEqual(solve(restored.snapshots), solve(corrected));
  const result = computeDeduction({
    identity,
    snapshots: restored.snapshots,
    activeId: restored.activeId,
    sidRng: saved.sidRng,
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
  });
  assert.deepEqual(
    result.sidAnalysis?.sidValues,
    solve(corrected),
    "the production RNG and SID pipeline uses only the corrected revision",
  );

  const uncertain = correctStarterCheckpointFacts(snapshots, snapshots[0].id, {
    moves: [10, null, 116, null],
    pp: [35, null, 30, null],
    evs: [0, 3, 2, 1, 0, 0],
  });
  assert.ok(solve(uncertain).length >= 68);
  assert.deepEqual(
    solve(uncertain).filter((sid) => solve(corrected).includes(sid)),
    solve(corrected),
  );
  assert.equal(
    uncertain[0].knownFacts.moves?.[1],
    null,
    "an uncertain order is never selected automatically",
  );
});

test("correction preserves genuine older training, different drawings and experiment sources", () => {
  const snapshots = savedCheckpoints();
  snapshots[1].starterCheckpointId = "genuine-earlier-training";
  snapshots[2].observations = snapshots[2].observations.slice();
  snapshots[2].observations[16] = 1; // Disagrees with the current drawing.
  snapshots.push({
    ...newSnapshot("item-experiment", "Recorded item test", saved.facts),
    itemTest: { sourceId: snapshots[3].id, phase: "recorded", changed: true },
  });
  const corrected = correctStarterCheckpointFacts(snapshots, snapshots[0].id, {
    moves: [10, null, 116, null],
    pp: [35, null, 30, null],
  });
  for (let i = 1; i < snapshots.length; i++)
    assert.equal(corrected[i], snapshots[i]);
});

test("move-order corrections propagate through a recorded item test and relative move swap", () => {
  const baseline = savedCheckpoints()[0];
  const item: Snapshot = {
    ...newSnapshot("item", "Held item", {
      ...baseline.knownFacts,
      heldItem: 13,
    }),
    itemTest: { sourceId: baseline.id, phase: "recorded", changed: true },
  };
  const swap: Snapshot = {
    ...newSnapshot("swap", "Swapped moves", {
      ...item.knownFacts,
      moves: [10, 15, 116, 45],
      pp: [35, 30, 30, 40],
    }),
    itemTest: {
      sourceId: item.id,
      phase: "recorded",
      changed: true,
      actionId: "moves-1-3",
    },
  };
  const corrected = correctStarterCheckpointFacts(
    [baseline, swap, item],
    baseline.id,
    {
      moves: [10, 15, 116, 45],
      pp: [35, 30, 30, 40],
    },
  );
  assert.deepEqual(corrected[2].knownFacts.moves, [10, 15, 116, 45]);
  assert.deepEqual(corrected[1].knownFacts.moves, [10, 45, 116, 15]);
  assert.deepEqual(corrected[1].knownFacts.pp, [35, 40, 30, 30]);
  assert.equal(corrected[2].knownFacts.heldItem, 13);
});

test("zero SID results explain the conflicting field and offer setup correction without requiring a successful search", () => {
  const baseline = savedCheckpoints()[0];
  const assistance = pixelAssistance(baseline.observations, {
    ...saved.identity,
    ...saved.facts,
  } as KnownFacts);
  const lab = {
    canvasRef: { current: null },
    analysisBusy: false,
    analysisError: "",
    obs: baseline.observations,
    identity: saved.identity,
    assistance,
    predictions: assistance.predictions,
    sidAnalysis: { sidValues: [], candidates: [] },
  } as unknown as Parameters<typeof StarterCurtainStep>[0]["lab"];
  const html = renderToStaticMarkup(
    createElement(StarterCurtainStep, {
      lab,
      state: newStarterGuide(),
      onTraining: () => {},
      onMoreInfo: () => {},
    }),
  );
  assert.match(html, /row 14, column 3/);
  assert.match(html, /Move 2 PP/);
  assert.match(html, /predicts Transparent/);
  assert.match(html, /Check battle log and moves/);
});

test("correcting forgotten Defense EVs recovers the SID without changing the black pixel, in all 24 permutations", () => {
  for (let permutation = 0; permutation < 24; permutation++) {
    const pid = 0x12345678 + permutation;
    const tid = 123;
    // The low Defense EV nibble is four nibbles into the EV substructure.
    // Arrange a zero XOR-key nibble there: actual Defense=2 is black, but
    // the mistakenly recorded Defense=0 would require transparency.
    const physical = SUBSTRUCT_POSITIONS[pid % 24][2] * 24 + 4;
    const sid = (pid >>> 16) & 15;
    const baseline = newSnapshot("curtain", "Saved curtain", {
      evs: [0, 0, 0, 1, 0, 0],
    });
    const pixel = 16 + 64 + physical;
    baseline.observations[pixel] = 1;
    const original = structuredClone(baseline);
    const solve = (snapshots: Snapshot[]) =>
      solveSids({ tid }, snapshots, [pid], undefined, Infinity, [sid])
        .sidValues;
    assert.deepEqual(solve([baseline]), []);
    const corrected = correctStarterCheckpointEvs(
      [baseline],
      baseline.id,
      [0, 0, 2, 1, 0, 0],
    );
    assert.deepEqual(solve(corrected), [sid]);
    assert.deepEqual(corrected[0].observations, original.observations);
    assert.deepEqual(
      baseline,
      original,
      "the repair must not mutate old state",
    );

    corrected[0] = {
      ...corrected[0],
      observations: corrected[0].observations.slice(),
    };
    corrected[0].observations[pixel] = 0;
    assert.deepEqual(
      solve(corrected),
      [],
      "genuinely wrong pixels still require review",
    );
  }
});

test("EV corrections follow linked experiments while retaining their training gains and earlier independent summaries", () => {
  const baseline = newSnapshot("baseline", "Current curtain", {
    evs: [0, 3, 0, 1, 0, 0],
  });
  baseline.observations[28] = 1;
  const linked = (id: string, sourceId: string, defense: number): Snapshot => ({
    ...newSnapshot(id, id, { evs: [0, 3, defense, 1, 0, 0], heldItem: 13 }),
    itemTest: { sourceId, phase: "recorded" },
    notes: "Recorded in game",
  });
  const item = linked("item", baseline.id, 0);
  item.observations[110] = 0;
  const moves = linked("moves", item.id, 0);
  const trained = linked("trained", moves.id, 4);
  const earlier = newSnapshot("before-training", "Earlier curtain", {
    evs: [0, 0, 0, 1, 0, 0],
  });
  earlier.summaryStats = { level: 5, stats: [20, 11, 9, 10, 13, 10] };
  const snapshots = [baseline, trained, moves, item, earlier];
  const corrected = correctStarterCheckpointEvs(
    snapshots,
    baseline.id,
    [0, 3, 2, 1, 0, 0],
  );
  assert.deepEqual(
    corrected.map((s) => s.knownFacts.evs?.[2]),
    [2, 6, 2, 2, 0],
  );
  assert.equal(corrected[4], earlier);
  for (let i = 0; i < snapshots.length; i++) {
    assert.equal(corrected[i].observations, snapshots[i].observations);
    assert.equal(corrected[i].itemTest, snapshots[i].itemTest);
    assert.equal(corrected[i].notes, snapshots[i].notes);
    assert.equal(
      corrected[i].knownFacts.heldItem,
      snapshots[i].knownFacts.heldItem,
    );
  }
  const unknown = correctStarterCheckpointEvs(
    snapshots,
    baseline.id,
    Array(6).fill(null),
  );
  assert.deepEqual(unknown[0].knownFacts.evs, Array(6).fill(null));
  assert.deepEqual(unknown[1].knownFacts.evs, Array(6).fill(null));
});

test("saved guide recovery recognizes a corrected log, without rewriting a new training checkpoint or another starter", () => {
  const state = newStarterGuide();
  state.step = 2;
  state.tid = "123";
  state.identifiedStarter = { pid: 0x12345678 } as RngSpread;
  state.battles.push({
    id: "forgotten",
    species: 301,
    count: 2,
    multiplier: 1,
  }); // Nincada
  const identity = {
    tid: 123,
    pid: state.identifiedStarter.pid,
    species: state.species,
  };
  const baseline = newSnapshot("baseline", "Curtain", {
    evs: [0, 0, 0, 1, 0, 0],
  });
  baseline.observations[28] = 1;
  const needsCorrection = () =>
    starterEvsNeedCorrection(state, identity, baseline, false, false);
  assert.equal(needsCorrection(), true);
  assert.equal(
    starterEvsNeedCorrection(state, identity, baseline, true, false),
    false,
  );
  assert.equal(
    starterEvsNeedCorrection(state, identity, baseline, false, true),
    false,
  );
  assert.equal(
    starterEvsNeedCorrection(
      state,
      { ...identity, pid: 1 },
      baseline,
      false,
      false,
    ),
    false,
  );
  assert.equal(
    starterEvsNeedCorrection(
      state,
      { ...identity, tid: 1 },
      baseline,
      false,
      false,
    ),
    false,
  );
  state.route = {
    train: { species: 301, count: 2 },
    facts: {},
    instructions: [],
    done: [],
    score: { total: 1, expected: 1, worstCase: 1 },
  };
  assert.equal(
    needsCorrection(),
    false,
    "a newly trained Pokémon needs a separate checkpoint",
  );
  state.route = null;
  baseline.knownFacts.evs = [0, 0, 2, 1, 0, 0];
  assert.equal(
    needsCorrection(),
    false,
    "a repaired save must not loop on reload",
  );
});
