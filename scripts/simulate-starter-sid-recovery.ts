/** End-to-end, blind-solver simulation of the existing guided SID workflow.
 * Run: npx tsx scripts/simulate-starter-sid-recovery.ts [world-count] [output]
 * The independent oracle owns SID/PID/IV truth. Planning only sees the public
 * TID, summary traits/stats, the RNG window, and explicitly observed pixels.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import {
  newStarterGuide,
  searchStarter,
  starterIdentity,
  starterSettings,
  guideSidCandidates,
  creationMoves,
  readingSnapshots,
  checkStarterRoute,
  battleEvs,
  type StarterGuideState,
} from "../src/core/starterGuide";
import {
  defaultIntroTiming,
  estimatedSidWindow,
  EMERALD_FPS,
} from "../src/core/starterTiming";
import {
  planStarterRoute,
  usefulStarterPixels,
} from "../src/core/starterRoute";
import {
  starterBattleExperience,
  starterLevelAt,
} from "../src/core/starterJourney";
import { computeDeduction } from "../src/core/deduction";
import {
  emptyObservations,
  type KnownFacts,
  type Observations,
} from "../src/core/constraints";
import {
  newSnapshot,
  splitFacts,
  type Snapshot,
} from "../src/core/investigation";
import {
  createItemTest,
  targetExperiment,
  answerExperimentPixel,
  finishPixelExperiment,
  isEvidence,
} from "../src/core/itemTests";
import {
  controlledFacts,
  createControlledTest,
  type ControlledAction,
} from "../src/core/controlledExperiments";
import { isInformativeExperiment } from "../src/core/experiments";
import {
  STARTER_ITEM_IDS,
  starterItemSource,
  starterItemCost,
} from "../src/core/starterItems";
import { compareSidSteps, experimentSeconds } from "../src/core/nextSidStep";
import { encodeNickname, encodeOtName } from "../src/core/names";
import { decodePokemon, NATURES, hex } from "../src/core/pokemon";
import { calculateStat } from "../src/core/stats";
import { speciesTraits } from "../src/core/traits";
import { solveSids } from "../src/core/sid";
import baseExperience from "../src/data/starter-base-experience.json";

const SEED = 0x51d2026;
const count = Number(process.argv[2] ?? 100);
assert.ok(Number.isInteger(count) && count > 0 && count <= 1000);
const out = process.argv[3] ?? "research/starter-sid-recovery-simulation.json";
const shardIndex = Number(process.argv[4] ?? 0),
  shardCount = Number(process.argv[5] ?? 1);
assert.ok(shardIndex >= 0 && shardIndex < shardCount && shardCount <= 16);
const intro = defaultIntroTiming();
const sidAdvance = Math.round(intro.second * EMERALD_FPS) + intro.offset;
const starterTiming = {
  first: 5,
  second: 20,
  uncertainty: 60,
  offset: 0,
  calibration: 0,
};
const center = Math.round(starterTiming.second * EMERALD_FPS);
const names: Record<number, string> = {
  277: "Treecko",
  280: "Torchic",
  283: "Mudkip",
};
const bases: Record<number, number[]> = {
  277: [40, 45, 35, 70, 65, 55],
  280: [45, 60, 40, 45, 70, 50],
  283: [50, 70, 50, 40, 50, 50],
};
const ability: Record<number, number> = { 277: 65, 280: 66, 283: 67 };
let randomState = SEED;
function random() {
  randomState += 0x6d2b79f5;
  let x = randomState;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
// Independent arithmetic, not the app's nextSeed or static generator.
function oracleSequence(seed: number, advances: number) {
  let value = BigInt(seed);
  const next = () => {
    value = (value * 0x41c64e6dn + 0x6073n) & 0xffffffffn;
    return Number(value >> 16n);
  };
  for (let n = 0; n < advances; n++) next();
  return next;
}
function oracleSid(tid: number) {
  return oracleSequence(tid, sidAdvance - 1)();
}
function oracleStarter(advance: number) {
  const next = oracleSequence(0, advance);
  const lo = next(),
    hi = next(),
    a = next(),
    b = next();
  return {
    advance,
    pid: (hi * 65536 + lo) >>> 0,
    ivs: [
      a & 31,
      (a >>> 5) & 31,
      (a >>> 10) & 31,
      b & 31,
      (b >>> 5) & 31,
      (b >>> 10) & 31,
    ],
  };
}
function oracleStats(species: number, pid: number, ivs: number[]) {
  const nature = pid % 25,
    raised = [1, 2, 3, 4, 5][Math.floor(nature / 5)],
    lowered = [1, 2, 3, 4, 5][nature % 5];
  return bases[species].map((base, stat) => {
    const core = Math.floor(
      ((2 * base + ivs[stat] + Math.floor((stat === 3 ? 1 : 0) / 4)) * 5) / 100,
    );
    if (stat === 0) return core + 15;
    const percent =
      raised === lowered
        ? 100
        : stat === raised
          ? 110
          : stat === lowered
            ? 90
            : 100;
    const result = Math.floor(((core + 5) * percent) / 100);
    assert.equal(
      result,
      calculateStat(base, ivs[stat], stat === 3 ? 1 : 0, 5, stat, nature),
    );
    return result;
  });
}
// Independent physical block order table for the oracle record encoder.
const orders =
  "GAEM GAME GEAM GEMA GMAE GMEA AGEM AGME AEGM AEMG AMGE AMEG EGAM EGMA EAGM EAMG EMGA EMAG MGAE MGEA MAGE MAEG MEGA MEAG".split(
    " ",
  );
function oracleRecord(
  tid: number,
  sid: number,
  actual: ReturnType<typeof oracleStarter>,
  species: number,
  facts: KnownFacts,
  experience: number,
) {
  const data = new Uint8Array(80),
    view = new DataView(data.buffer);
  view.setUint32(0, actual.pid, true);
  view.setUint32(4, (sid * 65536 + tid) >>> 0, true);
  data.fill(255, 8, 18);
  data.set(encodeNickname(names[species].toUpperCase()), 8);
  data[18] = 2;
  data[19] = 2;
  data.fill(255, 20, 27);
  data.set(encodeOtName("SIM"), 20);
  const positions = orders[actual.pid % 24];
  const offset = (block: string) => 32 + positions.indexOf(block) * 12;
  const g = offset("G"),
    a = offset("A"),
    e = offset("E"),
    m = offset("M");
  view.setUint16(g, species, true);
  view.setUint16(g + 2, facts.heldItem ?? 0, true);
  view.setUint32(g + 4, experience, true);
  data[g + 8] = facts.ppBonuses ?? 0;
  // Nuisance plaintext is real in the oracle but is never supplied to planning.
  data[g + 9] = Math.min(
    255,
    70 + 5 * (starterLevelAt(species, experience) - 5),
  );
  facts.moves!.forEach((move, i) => view.setUint16(a + i * 2, move!, true));
  data.set(facts.pp as number[], a + 8);
  data.set(facts.evs as number[], e);
  data[m] = 0;
  data[m + 1] = 16;
  view.setUint16(m + 2, 5 | (3 << 7) | (4 << 11), true);
  const ivWord = actual.ivs.reduce((v, iv, i) => v | (iv << (i * 5)), 0) >>> 0;
  view.setUint32(m + 4, ivWord, true); // single-ability starter, ability bit zero
  let checksum = 0;
  for (let i = 32; i < 80; i += 2)
    checksum = (checksum + view.getUint16(i, true)) & 65535;
  view.setUint16(28, checksum, true);
  const key = (actual.pid ^ (sid * 65536 + tid)) >>> 0;
  for (let i = 32; i < 80; i += 4)
    view.setUint32(i, view.getUint32(i, true) ^ key, true);
  const decoded = decodePokemon(data);
  assert.ok(decoded.checksumValid);
  assert.equal(decoded.pid, actual.pid);
  assert.equal(decoded.sid, sid);
  assert.deepEqual(decoded.ivs, actual.ivs);
  assert.deepEqual(decoded.evs, facts.evs);
  const pixels = emptyObservations();
  for (let i = 0; i < 80; i++)
    for (let half = 0; half < 2; half++)
      pixels[16 + 2 * i + half] = ((data[i] >>> (half * 4)) & 15) === 0 ? 0 : 1;
  return pixels;
}

type Result = ReturnType<typeof computeDeduction>;
type Option = {
  id: string;
  name: string;
  kind: "item" | "moves" | "ev";
  itemId?: number;
  action?: ControlledAction;
  facts: KnownFacts;
  targets: number[];
  seconds: number;
  lastResort: boolean;
  informationGain: number;
  worstCase?: number;
};
/** Mirrors StarterCurtainStep's exact selection/filtering, using core rankers.
 * No oracle, actual SID or true-answer branch is available to this function.
 */
function chooseExperiment(
  result: Result,
  baseline: Snapshot,
  identity: KnownFacts,
  state: StarterGuideState,
) {
  const candidates = result.sidAnalysis!.candidates,
    base = baseline.knownFacts;
  const options: Option[] = [
    ...result.experiments
      .filter(
        (e) =>
          STARTER_ITEM_IDS.includes(e.item.id) &&
          !state.usedTms?.includes(e.item.id) &&
          e.item.id !== base.heldItem,
      )
      .map((e) => ({
        id: `item-${e.item.id}`,
        name: `Hold ${e.item.name}`,
        kind: "item" as const,
        itemId: e.item.id,
        facts: { ...identity, ...base, heldItem: e.item.id },
        targets: e.pixels.map((p) => p.index),
        informationGain: e.informationGain,
        seconds:
          30 +
          (state.route?.items?.includes(e.item.id)
            ? 0
            : starterItemCost([e.item.id]).seconds),
        lastResort: false,
      })),
    ...result.controlledExperiments
      .filter(
        (e) =>
          e.action.kind === "moves" ||
          (e.action.kind === "ev" && e.action.training?.vitamins === 0),
      )
      .map((e) => ({
        id: e.action.id,
        name: e.action.name,
        kind: e.action.kind as "moves" | "ev",
        action: e.action,
        facts: { ...identity, ...controlledFacts(base, e.action) },
        targets: e.pixels.map((p) => p.index),
        informationGain: e.informationGain,
        seconds: experimentSeconds(e.action),
        lastResort: e.action.training?.lastResort ?? false,
      })),
  ];
  return options
    .flatMap((option) => {
      const useful = usefulStarterPixels(
        candidates,
        option.facts,
        emptyObservations(),
      ).filter((q) => option.targets.includes(q.index));
      if (!useful.length) return [];
      const q = useful[0];
      return [
        {
          ...option,
          targets: useful.slice(0, 4).map((p) => p.index),
          worstCase: q.worstCase,
          informationGain: Math.log2(
            q.total /
              Math.max(
                1,
                (q.transparent * q.transparent + q.black * q.black) /
                  (q.transparent + q.black),
              ),
          ),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.lastResort) - Number(b.lastResort) || compareSidSteps(a, b),
    );
}

const worlds = Array.from({ length: count }, (_, i) => ({
  trial: i + 1,
  tid: Math.floor(random() * 65536),
  attempts: Array.from(
    { length: 40 },
    () => center + Math.floor(random() * 121) - 60,
  ),
}));
const sourceFiles = [
  "src/core/starterTiming.ts",
  "src/core/starterGuide.ts",
  "src/core/starterRoute.ts",
  "src/core/starterJourney.ts",
  "src/core/deduction.ts",
  "src/core/sid.ts",
  "src/core/sidRng.ts",
  "src/core/controlledExperiments.ts",
  "src/core/experiments.ts",
  "src/components/StarterCurtainStep.tsx",
];
const sourceHashes = Object.fromEntries(
  sourceFiles.map((f) => [
    f,
    crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"),
  ]),
);
const config = {
  seed: SEED,
  worlds: count,
  runs: count * 3,
  intro,
  sidAdvance,
  sidWindow: estimatedSidWindow(intro),
  starterTiming,
  starterTarget: center,
  starterErrorModel:
    "uniform integer advances -60 through +60 inclusive, same attempt sequence for paired starters",
  species: names,
  shardIndex,
  shardCount,
  experimentDefinition:
    "one suggested held-item setup, move swap or permanent EV-training checkpoint; initial route preparation and individual pixel answers are counted separately",
  oracle:
    "Independent BigInt RNG and packed 80-byte checksum-valid encrypted record; SID hidden from solver; all 160 curtain cells drawn before filtering",
  assumptions: [
    "Ordinary English Emerald, seed-zero Method 1 starters, no BIOS reset",
    "Perfect TID/SID timing at nominal advance 1245; actual timing uncertainty is not sampled",
    "All six level-5 stats, nature, gender and ability read without mistakes after the first 1-Speed-EV victory",
    "Retry starter until exactly one PID/IV spread matches; no oracle tie breaking",
    "Execute current route planner including the avoidable two-Nincada trainer; one starter receives all listed EXP and EVs",
    "No Pokerus, no EV multipliers, no unlogged battles, no evolution, no PP Ups; PC restores PP",
    "Only the guide's early held items, move swaps and zero-vitamin EV recommendations are allowed",
    "EV experiments create a new full drawing checkpoint, retaining all previous evidence, as the guide currently does",
    "Items/move experiments restore original baseline; EV training is permanent and never reloaded",
    "Extra EV-only route opponents not given a level by the planner are modeled at level 5 for nuisance EXP and friendship; neither is supplied as a known fact",
  ],
  sourceHashes,
};
const rows: any[] = [];
const checkpoint = out.replace(/\.json$/, ".jsonl");
let totalComputations = 0;

function simulate(world: (typeof worlds)[number], species: number) {
  const start = performance.now();
  const trueSid = oracleSid(world.tid); // Oracle/audit only; never added to state.
  let state = newStarterGuide();
  state.tid = String(world.tid);
  state.species = species;
  state.intro = { ...intro };
  state.starter = { ...starterTiming };
  state.moves = creationMoves(species);
  state.protectedSave = true;
  const attempts: any[] = [];
  let actual: ReturnType<typeof oracleStarter> | undefined;
  let spreads: ReturnType<typeof searchStarter> = [];
  for (const advance of world.attempts) {
    actual = oracleStarter(advance);
    state.nature = String(actual.pid % 25);
    state.gender = (actual.pid & 255) < 31 ? "female" : "male";
    state.ability = String(ability[species]);
    state.readings = [
      {
        id: "summary",
        evs: [0, 0, 0, 1, 0, 0],
        summary: {
          level: 5,
          stats: oracleStats(species, actual.pid, actual.ivs),
        },
      },
    ];
    spreads = searchStarter(state);
    attempts.push({
      advance,
      matchingPids: spreads.length,
      matchAdvances: spreads.map((s) => s.advance),
    });
    assert.ok(
      spreads.some(
        (s) => s.pid === actual!.pid && s.ivs.join() === actual!.ivs.join(),
      ),
      "true starter lost at stats search",
    );
    if (spreads.length === 1) break;
  }
  assert.ok(
    actual && spreads.length === 1,
    "no uniquely identifiable starter within 40 attempts",
  );
  state.identifiedStarter = spreads[0];
  const sidCandidates = guideSidCandidates(state);
  assert.ok(sidCandidates.includes(trueSid));
  const route = planStarterRoute(state, spreads, sidCandidates);
  state.route = route;
  for (let i = 0; i < route.instructions.length; i++)
    state = checkStarterRoute(state, i, true);
  state.routeDone = true;
  assert.deepEqual(battleEvs(state.battles), route.facts.evs);
  assert.deepEqual(state.moves, route.facts.moves);
  const { identity, mutable } = splitFacts({
    ...starterIdentity(state),
    ...route.facts,
  });
  assert.equal(identity.sid, undefined);
  assert.equal(state.confirmedSid, null);
  const knownRng = starterSettings(state),
    sidRng = estimatedSidWindow(state.intro);
  const actualBattles = state.battles.map((b) => ({
    ...b,
    level: b.level ?? (b.id === "birch" ? 2 : 5),
    trainer: b.trainer ?? false,
  }));
  let experience = starterBattleExperience(actualBattles)!;
  assert.ok(Number.isInteger(experience));
  let baseline = {
    ...newSnapshot("curtain-0", "Initial curtain", mutable),
    starterCheckpointId: "curtain-0",
  };
  const physicalFacts = { ...mutable, moves: state.moves, pp: route.facts.pp };
  baseline.observations = oracleRecord(
    world.tid,
    trueSid,
    actual!,
    species,
    physicalFacts,
    experience,
  );
  let snapshots: Snapshot[] = [baseline, ...readingSnapshots(state.readings)];
  let computeMs = 0;
  const compute = (activeId: string) => {
    assert.equal(identity.sid, undefined);
    const t = performance.now();
    const result = computeDeduction({
      identity,
      snapshots,
      activeId,
      rng: knownRng,
      sidRng,
      starterGuide: true,
    });
    computeMs += performance.now() - t;
    totalComputations++;
    assert.ok(
      result.sidAnalysis?.sidValues.includes(trueSid),
      "oracle SID was wrongly removed",
    );
    return result;
  };
  let result = compute(baseline.id);
  const afterDrawing = result.sidAnalysis!.sidValues.length;
  const experiments: any[] = [];
  const seen = new Set<string>();
  let status = "unresolved",
    blockedReason = "";
  while (result.sidAnalysis!.sidValues.length > 1 && experiments.length < 100) {
    const options = chooseExperiment(result, baseline, identity, state),
      next = options[0];
    if (!next) {
      blockedReason = "No further experiment offered by the current guide";
      break;
    }
    const before = result.sidAnalysis!.sidValues.length;
    const signature = JSON.stringify([
      baseline.knownFacts,
      result.sidAnalysis!.sidValues,
      next.id,
      next.targets,
    ]);
    if (seen.has(signature)) {
      blockedReason = "Repeated non-progressing recommendation";
      break;
    }
    seen.add(signature);
    const record: any = {
      number: experiments.length + 1,
      id: next.id,
      name: next.name,
      kind: next.kind,
      before,
      targets: next.targets,
      answers: [],
      lastResort: next.lastResort,
      ...(next.itemId
        ? {
            item: next.itemId,
            acquire: !state.route?.items?.includes(next.itemId),
          }
        : {}),
      ...(next.action?.training ? { training: next.action.training } : {}),
      alternativeNames: options.slice(1, 4).map((o) => o.name),
    };
    if (next.kind === "ev") {
      const action = next.action!,
        plan = action.training!;
      if (plan.vitamins || plan.gain !== 1) {
        blockedReason =
          "Training unsupported by the guided x1 no-vitamin route";
        break;
      }
      const knownFacts = { ...baseline.knownFacts, ...action.changes };
      delete knownFacts.experience;
      // Match the wizard's permanent training checkpoint, with no IV/stat oracle.
      // The guide uses a one-EV Seedot or Zigzagoon; model level-5 opponents.
      const opponent = action.id.startsWith("ev-2-") ? 298 : 288;
      const yieldExp =
        opponent === 298
          ? 74
          : (baseExperience as Record<number, number>)[opponent];
      experience += plan.battles * Math.floor((yieldExp * 5) / 7);
      const checkpointId = `curtain-ev-${experiments.length + 1}`;
      baseline = {
        ...newSnapshot(checkpointId, next.name, knownFacts),
        starterCheckpointId: checkpointId,
      };
      baseline.observations = oracleRecord(
        world.tid,
        trueSid,
        actual!,
        species,
        knownFacts,
        experience,
      );
      snapshots = [baseline, ...snapshots];
      record.fullRedraw = true;
      record.pixelAnswers = 160;
      result = compute(baseline.id);
    } else {
      const id = `experiment-${experiments.length + 1}`;
      let pending = targetExperiment(
        next.kind === "item"
          ? createItemTest(baseline, id, next.itemId!, next.targets, before)
          : createControlledTest(
              baseline,
              id,
              next.action!,
              next.targets,
              before,
            ),
      );
      snapshots.push(pending);
      const observation = oracleRecord(
        world.tid,
        trueSid,
        actual!,
        species,
        {
          ...baseline.knownFacts,
          ...(next.kind === "item"
            ? { heldItem: next.itemId }
            : next.action!.changes),
        },
        experience,
      );
      let active = compute(pending.id);
      while (active.sidAnalysis!.sidValues.length > 1) {
        const q = active.starterQuestions[0];
        if (!q) break;
        const value = observation[q.index];
        assert.notEqual(value, -1);
        record.answers.push({
          index: q.index,
          value,
          before: active.sidAnalysis!.sidValues.length,
        });
        pending = answerExperimentPixel(pending, q.index, value);
        snapshots = snapshots.map((s) => (s.id === id ? pending : s));
        active = compute(pending.id);
        record.answers.at(-1).after = active.sidAnalysis!.sidValues.length;
      }
      if (!record.answers.length) {
        blockedReason = "Suggested test yielded no useful pixel questions";
        snapshots.pop();
        break;
      }
      pending = finishPixelExperiment(pending);
      snapshots = snapshots.map((s) => (s.id === id ? pending : s));
      result = compute(baseline.id);
      record.pixelAnswers = record.answers.length;
    }
    record.after = result.sidAnalysis!.sidValues.length;
    experiments.push(record);
  }
  if (result.sidAnalysis!.sidValues.length === 1) {
    assert.equal(result.sidAnalysis!.sidValues[0], trueSid);
    status = "recovered";
  } else if (experiments.length === 100)
    blockedReason = "100-experiment safety cap";
  const finalSids = result.sidAnalysis!.sidValues;
  // Independent re-evaluation of every saved observation by the exact joint solver.
  const audit = solveSids(
    identity,
    snapshots.filter(isEvidence),
    [identity.pid!],
    undefined,
    Infinity,
    sidCandidates,
  );
  assert.deepEqual(audit.sidValues, finalSids);
  return {
    trial: world.trial,
    species: names[species],
    tid: world.tid,
    trueSid,
    trueSidHex: hex(trueSid, 4),
    sidAdvance,
    initialSidCandidates: sidCandidates.length,
    starter: {
      advance: actual!.advance,
      pid: hex(actual!.pid, 8),
      ivs: actual!.ivs,
      nature: NATURES[actual!.pid % 25],
      gender: state.gender,
      stats: state.readings[0].summary.stats,
      attempts,
      retries: attempts.length - 1,
    },
    route: {
      instructions: route.instructions,
      items: (route.items ?? []).map((id) => ({
        id,
        name: starterItemSource(id)!.item.name,
      })),
      heldItem: route.facts.heldItem,
      moves: route.facts.moves,
      pp: route.facts.pp,
      evs: route.facts.evs,
      battles: state.battles,
      level: starterLevelAt(species, experience),
      predicted: route.score,
      consumedItems: state.usedTms,
    },
    afterDrawing,
    experiments,
    experimentCount: experiments.length,
    pixelQuestions: experiments.reduce(
      (n, e) => n + (e.answers?.length ?? 0),
      0,
    ),
    fullRedraws: experiments.filter((e) => e.fullRedraw).length,
    status,
    blockedReason,
    finalSids,
    computeMs,
    elapsedMs: performance.now() - start,
    audits: {
      trueStarterRetained: true,
      trueSidRetained: true,
      exactSolverAgrees: true,
      noSecretSidSupplied: true,
    },
  };
}

export { oracleRecord, oracleStarter, oracleSid };

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(checkpoint, "");
  const tasks = worlds
    .flatMap((world) => [277, 280, 283].map((species) => ({ world, species })))
    .filter((_, i) => i % shardCount === shardIndex);
  for (const { world, species } of tasks) {
    const row = simulate(world, species);
    rows.push(row);
    fs.appendFileSync(checkpoint, JSON.stringify(row) + "\n");
    console.log(
      `${String(world.trial).padStart(3)} ${names[species].padEnd(7)} ${row.status} drawing=${row.afterDrawing} experiments=${row.experimentCount} questions=${row.pixelQuestions} retries=${row.starter.retries} ${Math.round(row.elapsedMs)}ms`,
    );
  }
  const aggregate = (sample: any[]) => {
    const values = sample.map((r) => r.experimentCount).sort((a, b) => a - b);
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    return {
      runs: sample.length,
      recovered: sample.filter((r) => r.status === "recovered").length,
      zeroExperiments: sample.filter(
        (r) => r.status === "recovered" && r.experimentCount === 0,
      ).length,
      meanExperiments: mean(values),
      medianExperiments:
        values.length % 2
          ? values[Math.floor(values.length / 2)]
          : (values[values.length / 2 - 1] + values[values.length / 2]) / 2,
      maxExperiments: Math.max(...values),
      p90Experiments: values[Math.ceil(0.9 * values.length) - 1],
      distribution: Object.fromEntries(
        [...new Set(values)].map((n) => [
          n,
          values.filter((v) => v === n).length,
        ]),
      ),
      meanAfterDrawing: mean(sample.map((r) => r.afterDrawing)),
      maxAfterDrawing: Math.max(...sample.map((r) => r.afterDrawing)),
      meanPixelQuestions: mean(sample.map((r) => r.pixelQuestions)),
      starterRetries: sample.reduce((n, r) => n + r.starter.retries, 0),
      ambiguousFirstAttempts: sample.filter(
        (r) => r.starter.attempts[0].matchingPids > 1,
      ).length,
      kinds: Object.fromEntries(
        ["item", "moves", "ev"].map((kind) => [
          kind,
          sample.flatMap((r) => r.experiments).filter((e) => e.kind === kind)
            .length,
        ]),
      ),
      lastResortExperiments: sample
        .flatMap((r) => r.experiments)
        .filter((e) => e.lastResort).length,
      meanRouteItems: mean(sample.map((r) => r.route.items.length)),
      routeTraining: sample.filter((r) =>
        r.route.battles.some((b: any) => b.id.startsWith("journey-ev-")),
      ).length,
    };
  };
  const summary = {
    overall: aggregate(rows),
    byStarter: Object.fromEntries(
      Object.values(names).map((name) => [
        name,
        aggregate(rows.filter((r) => r.species === name)),
      ]),
    ),
    totalComputations,
  };
  fs.writeFileSync(
    out,
    JSON.stringify({ config, summary, rows }, null, 2) + "\n",
  );
  const csv =
    [
      "trial,starter,TID,SID,starter_advance,PID,retries,SID_candidates,after_drawing,experiments,pixel_questions,EV_redraws,status",
      ...rows.map((r) =>
        [
          r.trial,
          r.species,
          r.tid,
          r.trueSid,
          r.starter.advance,
          r.starter.pid,
          r.starter.retries,
          r.initialSidCandidates,
          r.afterDrawing,
          r.experimentCount,
          r.pixelQuestions,
          r.fullRedraws,
          r.status,
        ].join(","),
      ),
    ].join("\n") + "\n";
  fs.writeFileSync(out.replace(/\.json$/, ".csv"), csv);
  console.log(JSON.stringify(summary, null, 2));
}
