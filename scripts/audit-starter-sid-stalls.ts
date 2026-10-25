/** Diagnostic continuation only. Never counted as current-guide successes. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { oracleRecord, oracleStarter } from "./simulate-starter-sid-recovery";
import {
  newStarterGuide,
  searchStarter,
  starterIdentity,
} from "../src/core/starterGuide";
import { routeCheckpoint, usefulStarterPixels } from "../src/core/starterRoute";
import { starterBattleExperience } from "../src/core/starterJourney";
import {
  newSnapshot,
  splitFacts,
  type Snapshot,
} from "../src/core/investigation";
import { emptyObservations, type KnownFacts } from "../src/core/constraints";
import { solveSids, type Hypothesis } from "../src/core/sid";
import { generateSidRng } from "../src/core/sidRng";
import { estimatedSidWindow } from "../src/core/starterTiming";
import { SUBSTRUCT_POSITIONS, hex } from "../src/core/pokemon";
import {
  createItemTest,
  targetExperiment,
  answerExperimentPixel,
  finishPixelExperiment,
  isEvidence,
} from "../src/core/itemTests";
import {
  createControlledTest,
  controlledActions,
  rankControlledExperiments,
  type ControlledAction,
} from "../src/core/controlledExperiments";
import { swapMoveFacts } from "../src/core/moveLearningExperiments";
import { compareSidSteps } from "../src/core/nextSidStep";

const speciesIds: Record<string, number> = {
  Treecko: 277,
  Torchic: 280,
  Mudkip: 283,
};
const canonical = "research/starter-sid-recovery-simulation.json";
const rows: any[] = fs.existsSync(canonical)
  ? JSON.parse(fs.readFileSync(canonical, "utf8")).rows
  : Array.from({ length: 8 }, (_, i) =>
      fs
        .readFileSync(`research/local-history/sid-sim-shard-${i}.jsonl`, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        }),
    ).flat();

function replay(row: any) {
  const species = speciesIds[row.species],
    state = newStarterGuide();
  Object.assign(state, {
    tid: String(row.tid),
    species,
    nature: String(oracleStarter(row.starter.advance).pid % 25),
    gender: row.starter.gender,
    ability: String(species === 277 ? 65 : species === 280 ? 66 : 67),
    starter: {
      first: 5,
      second: 20,
      uncertainty: 60,
      offset: 0,
      calibration: 0,
    },
    readings: [
      {
        id: "stats",
        evs: [0, 0, 0, 1, 0, 0],
        summary: { level: 5, stats: row.starter.stats },
      },
    ],
  });
  const identified = searchStarter(state);
  assert.equal(identified.length, 1);
  assert.equal(hex(identified[0].pid, 8), row.starter.pid);
  state.identifiedStarter = identified[0];
  state.battles = row.route.battles;
  state.moves = row.route.moves;
  const { identity, mutable } = splitFacts({
    ...starterIdentity(state),
    ...routeCheckpoint(state),
    heldItem: row.route.heldItem,
  });
  const actual = oracleStarter(row.starter.advance);
  let experience = starterBattleExperience(
    state.battles.map((b) => ({
      ...b,
      level: b.level ?? (b.id === "birch" ? 2 : 5),
      trainer: b.trainer ?? false,
    })),
  )!;
  let baseline = newSnapshot("original", "Original", mutable);
  baseline.observations = oracleRecord(
    row.tid,
    row.trueSid,
    actual,
    species,
    mutable,
    experience,
  );
  let snapshots: Snapshot[] = [baseline];
  const allowed = generateSidRng(row.tid, estimatedSidWindow(state.intro)).map(
    (r) => r.sid,
  );
  const solve = () =>
    solveSids(
      identity,
      snapshots.filter(isEvidence),
      [identity.pid!],
      undefined,
      Infinity,
      allowed,
    );
  for (const e of row.experiments) {
    if (e.kind === "ev") {
      const stat = Number(e.id.split("-")[1]);
      const evs = baseline.knownFacts.evs!.slice();
      evs[stat] = e.training.target;
      experience +=
        e.training.battles * Math.floor(((stat === 2 ? 74 : 60) * 5) / 7);
      baseline = newSnapshot(`replayed-${e.number}`, e.name, {
        ...baseline.knownFacts,
        evs,
      });
      baseline.observations = oracleRecord(
        row.tid,
        row.trueSid,
        actual,
        species,
        baseline.knownFacts,
        experience,
      );
      snapshots.unshift(baseline);
    } else {
      const action: ControlledAction = {
        id: e.id,
        kind: "moves",
        name: e.name,
        instructions: "Replay recorded observation",
        restore: "Restore baseline",
        logical: [],
        changes:
          e.kind === "moves"
            ? swapMoveFacts(
                baseline.knownFacts,
                ...(e.id.split("-").slice(1).map(Number) as [number, number]),
              )
            : {},
      };
      let pending = targetExperiment(
        e.kind === "item"
          ? createItemTest(
              baseline,
              `replayed-${e.number}`,
              e.item,
              e.targets,
              e.before,
            )
          : createControlledTest(
              baseline,
              `replayed-${e.number}`,
              action,
              e.targets,
              e.before,
            ),
      );
      for (const answer of e.answers)
        pending = answerExperimentPixel(pending, answer.index, answer.value);
      snapshots.push(finishPixelExperiment(pending));
    }
  }
  const before = solve();
  assert.deepEqual(
    before.sidValues,
    row.finalSids,
    "replayed evidence must exactly reproduce the primary run",
  );
  assert.equal(identity.sid, undefined);
  return {
    state,
    identity,
    actual,
    species,
    baseline,
    snapshots,
    experience,
    allowed,
    before,
    solve,
  };
}

function manualOptions(
  candidates: Hypothesis[],
  identity: KnownFacts,
  baseline: Snapshot,
) {
  const facts = { ...baseline.knownFacts, ...identity };
  const evs = facts.evs as number[],
    total = evs.reduce((a, b) => a + b, 0);
  const options: any[] = [];
  for (const stat of [2, 3])
    for (
      let target = evs[stat] + 1;
      target <= Math.min(255, evs[stat] + 510 - total);
      target++
    ) {
      const changed = evs.slice();
      changed[stat] = target;
      const physical =
        SUBSTRUCT_POSITIONS[identity.pid! % 24][2] * 24 + stat * 2;
      const questions = usefulStarterPixels(
        candidates,
        { ...facts, evs: changed },
        emptyObservations(),
      ).filter((q) => q.index === 80 + physical || q.index === 81 + physical);
      if (!questions.length) continue;
      const q = questions[0],
        battles = target - evs[stat];
      options.push({
        id: `manual-ev-${stat}-${target}`,
        stat,
        target,
        evs: changed,
        battles,
        lastResort: target > 110,
        seconds: 30 + battles * 60,
        informationGain: Math.log2(
          q.total /
            Math.max(
              1,
              (q.transparent * q.transparent + q.black * q.black) /
                (q.transparent + q.black),
            ),
        ),
        targets: questions.map((q) => q.index),
      });
    }
  return options.sort(compareSidSteps);
}

const diagnostics: any[] = [];
for (const row of rows.filter((r) => r.status !== "recovered")) {
  const r = replay(row),
    initial = r.before.sidValues.length;
  const keyMasks = Array.from({ length: 8 }, (_, n) =>
    r.before.candidates.reduce(
      (m, h) => m | (1 << ((h.key >>> (n * 4)) & 15)),
      0,
    ),
  );
  const actions = controlledActions(
    r.baseline,
    r.species,
    r.identity,
    keyMasks,
  );
  const ranked = rankControlledExperiments(
    r.baseline,
    r.species,
    r.before.candidates,
    r.identity,
    r.snapshots,
    false,
  );
  const firstManual = manualOptions(
    r.before.candidates,
    r.identity,
    r.baseline,
  )[0];
  const offered =
    firstManual &&
    actions.find(
      (a) => a.id === `ev-${firstManual.stat}-${firstManual.target}`,
    );
  const evidence = {
    firstManual: firstManual
      ? { stat: firstManual.stat, target: firstManual.target }
      : null,
    sameCheckpointGenerated: !!offered,
    generatedTraining: offered?.training,
    rankedTraining: ranked
      .filter((e) => e.action.kind === "ev")
      .map((e) => ({
        id: e.action.id,
        groups: e.groups,
        pixels: e.pixels.map((p) => p.index),
        training: e.action.training,
      })),
    generatedTrainingActions: actions
      .filter((a) => a.kind === "ev")
      .map((a) => ({ id: a.id, training: a.training })),
  };
  const steps: any[] = [];
  let result = r.before;
  for (let i = 0; result.sidValues.length > 1 && i < 64; i++) {
    const next = manualOptions(result.candidates, r.identity, r.baseline)[0];
    if (!next) break;
    const before = result.sidValues.length;
    r.experience +=
      next.battles * Math.floor(((next.stat === 2 ? 74 : 60) * 5) / 7);
    r.baseline = newSnapshot(
      `manual-${i}`,
      `Manual ${next.stat === 2 ? "Defense" : "Speed"} EVs to ${next.target}`,
      { ...r.baseline.knownFacts, evs: next.evs },
    );
    r.baseline.observations = oracleRecord(
      row.tid,
      row.trueSid,
      r.actual,
      r.species,
      r.baseline.knownFacts,
      r.experience,
    );
    r.snapshots.unshift(r.baseline);
    result = r.solve();
    assert.ok(result.sidValues.includes(row.trueSid));
    steps.push({
      stat: next.stat === 2 ? "Defense" : "Speed",
      target: next.target,
      battles: next.battles,
      before,
      after: result.sidValues.length,
      lastResort: next.lastResort,
      targets: next.targets,
    });
  }
  diagnostics.push({
    trial: row.trial,
    species: row.species,
    initialRemaining: initial,
    primaryExperiments: row.experimentCount,
    manuallyRecovered: result.sidValues.length === 1,
    additionalCheckpoints: steps.length,
    steps,
    finalSids: result.sidValues,
    evidence,
  });
  console.log(
    `${row.trial} ${row.species}: ${initial} -> ${result.sidValues.length} using ${steps.length} manual checkpoints`,
  );
}
const control = replay(rows.find((r) => r.status === "recovered")!);
const forbidden = control.allowed.filter(
  (s) => s !== rows.find((r) => r.status === "recovered")!.trueSid,
);
const negative = solveSids(
  control.identity,
  control.snapshots.filter(isEvidence),
  [control.identity.pid!],
  undefined,
  Infinity,
  forbidden,
);
assert.equal(
  negative.sidValues.length,
  0,
  "a unique correct SID deliberately excluded from the scope must not be magically recovered",
);
const output = {
  purpose: "Diagnostic manual-only EV continuation, not current-guide recovery",
  primaryStalls: diagnostics.length,
  manuallyRecovered: diagnostics.filter((r) => r.manuallyRecovered).length,
  additionalCheckpoints: diagnostics.reduce(
    (n, r) => n + r.additionalCheckpoints,
    0,
  ),
  lastResortCheckpoints: diagnostics
    .flatMap((r) => r.steps)
    .filter((s) => s.lastResort).length,
  negativeControlPassed: true,
  rows: diagnostics,
};
fs.writeFileSync(
  "research/starter-sid-stall-audit.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify({ ...output, rows: undefined }, null, 2));
