import test from "node:test";
import assert from "node:assert/strict";
import {
  controlledActions,
  displayActionInstructions,
  createControlledTest,
  actionPixels,
  rankControlledExperiments,
  levelExperience,
  type ControlledAction,
} from "../src/core/controlledExperiments";
import {
  decodePokemon,
  exampleRecord,
  SUBSTRUCT_POSITIONS,
} from "../src/core/pokemon";
import { emptyObservations } from "../src/core/constraints";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
  type Snapshot,
} from "../src/core/investigation";
import { makeHypothesis, diagnoseHypothesis, solveSids } from "../src/core/sid";
import {
  answerItemTest,
  finishItemTest,
  recordItemTest,
} from "../src/core/itemTests";
import { PROFILE } from "../src/core/memory";
import {
  freshCapturePreset,
  refreshCaptureDefaults,
  draftToFacts,
  factsToDraft,
} from "../src/core/facts";

test("boxed move instructions omit PP-use warnings, including saved legacy actions", () => {
  const source = newSnapshot("base", "Baseline", { moves: [52, 45, 116, 10] });
  const actions = controlledActions(source);
  assert.ok(actions.length > 0);
  for (const action of actions) {
    assert.doesNotMatch(action.instructions, /do not use|lower.*PP/i);
    assert.match(action.instructions, /PP and PP Ups follow their moves/);
  }
  const legacy = {
    ...actions[0],
    instructions:
      "Swap moves. Do not use either move or change anything else. Current PP and PP Ups follow their moves.",
  };
  const original = legacy.instructions;
  assert.match(displayActionInstructions(legacy), /Keep other data unchanged/);
  assert.doesNotMatch(displayActionInstructions(legacy), /Do not use/);
  assert.equal(legacy.instructions, original);
});

function modify(
  bytes: Uint8Array,
  apply: (payload: DataView, positions: number[]) => void,
) {
  const b = bytes.slice(),
    v = new DataView(b.buffer),
    d = decodePokemon(b);
  for (let i = 32; i < 80; i += 4)
    v.setUint32(i, v.getUint32(i, true) ^ d.key, true);
  apply(
    v,
    SUBSTRUCT_POSITIONS[d.pid % 24].map((n) => 32 + n * 12),
  );
  let sum = 0;
  for (let i = 32; i < 80; i += 2) sum = (sum + v.getUint16(i, true)) & 65535;
  v.setUint16(28, sum, true);
  for (let i = 32; i < 80; i += 4)
    v.setUint32(i, v.getUint32(i, true) ^ d.key, true);
  return b;
}
function observe(bytes: Uint8Array) {
  const obs = emptyObservations();
  bytes.forEach((b, i) => {
    obs[16 + 2 * i] = b & 15 ? 1 : 0;
    obs[17 + 2 * i] = b >>> 4 ? 1 : 0;
  });
  return obs;
}
function fixture() {
  const bytes = modify(exampleRecord(), (v, p) => {
    v.setUint16(p[1] + 2, 45, true);
    v.setUint16(p[1] + 4, 98, true);
    v.setUint16(p[1] + 6, 86, true);
    v.setUint8(p[1] + 9, 40);
    v.setUint8(p[1] + 10, 30);
    v.setUint8(p[1] + 11, 20);
    v.setUint8(p[0] + 8, 9);
  });
  const d = decodePokemon(bytes);
  const source: Snapshot = {
    ...newSnapshot("base", "Original", {
      moves: d.moves,
      pp: d.pp,
      ppBonuses: d.ppBonuses,
      experience: d.experience,
      evs: d.evs,
      heldItem: d.heldItem,
      friendship: d.friendship,
      checksum: d.checksum,
    }),
    observations: observe(bytes),
    summaryStats: { level: 10, stats: [30, 20, 20, 20, 20, 20] },
  };
  return {
    bytes,
    d,
    source,
    identity: { pid: d.pid, tid: d.tid, species: d.species },
  };
}
function perform(bytes: Uint8Array, action: ControlledAction) {
  return modify(bytes, (v, p) => {
    if (action.kind === "moves") {
      // Independent implementation of swapping the game's slots, PP and counters.
      const a = 0,
        b = 1,
        ma = v.getUint16(p[1] + a * 2, true),
        pa = v.getUint8(p[1] + 8 + a),
        bonuses = v.getUint8(p[0] + 8);
      v.setUint16(p[1] + a * 2, v.getUint16(p[1] + b * 2, true), true);
      v.setUint16(p[1] + b * 2, ma, true);
      v.setUint8(p[1] + 8 + a, v.getUint8(p[1] + 8 + b));
      v.setUint8(p[1] + 8 + b, pa);
      v.setUint8(
        p[0] + 8,
        (bonuses & 0xf0) | ((bonuses & 3) << 2) | ((bonuses >>> 2) & 3),
      );
    } else if (action.kind === "candy") v.setUint32(p[0] + 4, 1331, true);
    else v.setUint8(p[2], v.getUint8(p[2]) + 10);
  });
}
test("move, EXP and EV predictions match independently modified encrypted records and preserve the genuine SID", () => {
  const { bytes, d, source, identity } = fixture();
  const actions = controlledActions(source, d.species);
  for (const id of ["moves-0-1", "rare-candy", "vitamin-0"]) {
    const action = actions.find((a) => a.id === id)!,
      changed = perform(bytes, action),
      snapshot = createControlledTest(source, id, action, []);
    snapshot.observations = observe(changed);
    assert.ok(decodePokemon(changed).checksumValid);
    const h = makeHypothesis(d.pid, d.tid, d.sid);
    assert.equal(diagnoseHypothesis(identity, snapshot, h), null, id);
    for (const pixel of actionPixels(source, action, h))
      assert.equal(snapshot.observations[pixel.index], pixel.value, id);
    assert.ok(
      solveSids(identity, [source, snapshot], [d.pid]).sidValues.includes(
        d.sid,
      ),
      id,
    );
    assert.equal(snapshot.knownFacts.friendship, undefined);
    assert.equal(snapshot.knownFacts.checksum, undefined);
    if (action.kind !== "moves")
      assert.deepEqual(snapshot.summaryStats?.stats, Array(6).fill(null));
  }
  const swapped = createControlledTest(
    source,
    "s",
    actions.find((a) => a.id === "moves-0-1")!,
    [],
  );
  assert.deepEqual(swapped.knownFacts.moves, [45, 33, 98, 86]);
  assert.deepEqual(swapped.knownFacts.pp, [40, 35, 30, 20]);
  assert.equal(swapped.knownFacts.ppBonuses, 6);
  assert.deepEqual(source.knownFacts.pp, [35, 40, 30, 20]);
});
test("controlled tests use the saved baseline, round trip, and rank real distinct pixel patterns", () => {
  const { source, identity, d, bytes } = fixture(),
    analysis = solveSids(identity, [source], [d.pid]);
  const ranked = rankControlledExperiments(
    source,
    d.species,
    analysis.candidates,
  );
  assert.ok(ranked.some((e) => e.groups > 1));
  assert.ok(
    ranked.every((e, i) => i === 0 || ranked[i - 1].worstCase <= e.worstCase),
  );
  const action = controlledActions(source, d.species).find(
    (a) => a.id === "moves-0-1",
  )!;
  let next = answerItemTest(
    createControlledTest(source, "test", action, [100]),
    source,
    true,
  );
  next.observations = observe(perform(bytes, action));
  next = next.observations.some((p, n) => p !== source.observations[n])
    ? finishItemTest(next, source)
    : answerItemTest(next, source, false);
  const saved = recordItemTest([source, next], next);
  assert.equal(saved.baseline, source);
  const restored = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "unknown",
      identity,
      activeId: source.id,
      snapshots: saved.snapshots,
      ownedItems: [],
    }),
  );
  assert.equal(restored.snapshots[1].itemTest?.action?.kind, "moves");
  assert.deepEqual(restored.snapshots[0].observations, source.observations);
  assert.match(restored.snapshots[1].itemTest!.action!.restore, /back/);
});
test("vitamin caps, missing EVs and level 100 prevent unsupported actions", () => {
  const { source } = fixture();
  assert.equal(
    controlledActions({
      ...source,
      knownFacts: { evs: [null, 0, 0, 0, 0, 0] },
    }).filter((a) => a.kind === "vitamin").length,
    0,
  );
  assert.equal(
    controlledActions({
      ...source,
      knownFacts: { evs: [100, 100, 100, 100, 100, 10] },
    }).filter((a) => a.kind === "vitamin").length,
    0,
  );
  const capped = controlledActions({
    ...source,
    knownFacts: { evs: [99, 100, 100, 100, 100, 9] },
  });
  assert.equal(capped.find((a) => a.id === "vitamin-0")!.changes.evs![0], 100);
  assert.equal(
    capped.find((a) => a.id === "vitamin-5")!.changes.evs![5],
    11,
    "total cap leaves only 2 EVs",
  );
  assert.equal(
    controlledActions(
      { ...source, summaryStats: { level: 100, stats: Array(6).fill(null) } },
      25,
    ).some((a) => a.kind === "candy"),
    false,
  );
  assert.equal(
    controlledActions(
      {
        ...source,
        knownFacts: { ...source.knownFacts, moves: [33, 45, 0, 0] },
      },
      25,
    ).some((a) => a.kind === "candy"),
    false,
    "empty slots might automatically learn a move",
  );
});
test("EXP checkpoints respect the six growth curves and integer division boundaries", () => {
  // Species cover all six pret growth tables; fixed published end-of-table totals.
  assert.equal(levelExperience(1, 100), 1059860);
  assert.equal(levelExperience(25, 100), 1000000);
  assert.equal(levelExperience(35, 100), 800000);
  assert.equal(levelExperience(147, 100), 1250000);
  assert.equal(levelExperience(301, 100), 600000); // Nincada
  assert.equal(levelExperience(306, 100), 1640000); // Shroomish (internal Gen 3 ID)
  assert.equal(levelExperience(1, 2), 9);
  assert.throws(() => levelExperience(25, 101), /2–100/);
});
test("fresh capture assumptions include species friendship and move PP, track later selections and preserve manual exceptions", () => {
  const initial = freshCapturePreset({ species: 1, moves: [33, 45, 0, null] });
  assert.equal(initial.friendship, 70);
  assert.equal(initial.heldItem, 0);
  assert.deepEqual(initial.pp, [35, 40, 0, null]);
  assert.equal(initial.ivs, undefined);
  assert.equal(initial.pid, undefined);
  assert.ok(initial.assumed!.includes("friendship"));
  assert.deepEqual(
    draftToFacts(factsToDraft(initial), initial.assumed),
    initial,
  );
  const changed = refreshCaptureDefaults(
    { ...initial, species: 35 },
    "species",
  );
  assert.equal(changed.friendship, 140);
  assert.equal(
    refreshCaptureDefaults(
      {
        ...changed,
        friendship: 12,
        assumed: changed.assumed!.filter((k) => k !== "friendship"),
        species: 1,
      },
      "species",
    ).friendship,
    12,
  );
  const moves = refreshCaptureDefaults(
    { ...initial, moves: [52, 45, 0, null] },
    "move_0",
  );
  assert.equal(moves.pp![0], 25);
  assert.equal(
    refreshCaptureDefaults({ ...moves, ppBonuses: 3 }, "ppBonuses").pp![0],
    40,
  );
  const baseline = {
    ...newSnapshot("fresh", "Fresh", initial),
    summaryStats: { level: 5, stats: Array(6).fill(null) },
  };
  const vitamin = controlledActions(baseline, 1).find(
    (a) => a.id === "vitamin-0",
  )!;
  const changedEv = createControlledTest(baseline, "ev", vitamin, []);
  assert.equal(changedEv.knownFacts.evs![0], 10);
  assert.ok(
    changedEv.knownFacts.assumed!.includes("ev_0"),
    "derived EVs still depend on assumed baseline EVs",
  );
  assert.deepEqual(
    draftToFacts(
      factsToDraft(changedEv.knownFacts),
      changedEv.knownFacts.assumed,
    ),
    changedEv.knownFacts,
  );
});
