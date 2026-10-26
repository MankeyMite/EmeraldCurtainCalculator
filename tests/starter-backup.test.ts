import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  backupMoves,
  backupPokemonInput,
  intersectBackupSids,
  preferBackupPokemon,
  sharedSidLabView,
} from "../src/core/starterBackup";
import {
  newStarterGuide,
  newStarterAttempt,
  validateStarterGuide,
  GUIDE_KEY,
  GUIDE_LAB_KEY,
  GUIDE_BACKUP_LAB_KEY,
} from "../src/core/starterGuide";
import { snapshotPlaintext } from "../src/core/summaryPlaintext";
import { knownPlaintext } from "../src/core/inference";
import { calculateStat } from "../src/core/stats";
import { speciesTraits, genderForPid } from "../src/core/traits";
import {
  newSnapshot,
  splitFacts,
  saveInvestigation,
  loadInvestigation,
  type Snapshot,
} from "../src/core/investigation";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { compileHypothesisValidator, makeHypothesis } from "../src/core/sid";
import { generateSidRng } from "../src/core/sidRng";
import { computeDeduction, type DeductionInput } from "../src/core/deduction";
import { createControlledTest } from "../src/core/controlledExperiments";
import {
  targetExperiment,
  answerExperimentPixel,
  undoExperimentAnswer,
} from "../src/core/itemTests";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";
import {
  resetGuideProgress,
  restoreGuideProgress,
} from "../src/core/starterGuideStorage";
import { emptyObservations, type KnownFacts } from "../src/core/constraints";
import { PROFILE } from "../src/core/memory";

function fixture(pid = 2932254788, tid = 50998, sid?: number) {
  const state = newStarterGuide();
  state.tid = String(tid);
  state.playerGender = "male";
  const window = tid
    ? { minAdvance: 1244, maxAdvance: 1246 }
    : { minAdvance: 1, maxAdvance: 3 };
  const rows = generateSidRng(tid, window);
  sid ??= tid ? 6425 : 0;
  const ivs = [31, 12, 7, 19, 20, 11],
    species = 288,
    level = 4,
    traits = speciesTraits(species)!;
  const moves = backupMoves(species, level);
  const draft = {
    species: String(species),
    nature: String(pid % 25),
    gender: genderForPid(species, pid)!,
    ability: String(traits.abilities[0].id),
    heldItem: "0",
    level: String(level),
    ...Object.fromEntries(moves.map((m, n) => [`move_${n}`, String(m)])),
    ...Object.fromEntries(
      ivs.map((iv, n) => [
        `stat_${n}`,
        String(
          calculateStat(traits.summaryBaseStats[n], iv, 0, level, n, pid % 25),
        ),
      ]),
    ),
  };
  const parsed = backupPokemonInput(state, draft);
  // Independent canonical bytes, permutation, XOR encryption and checksum.
  const record = (facts: KnownFacts = parsed.facts) => {
    const logical = new Uint8Array(48),
      v = new DataView(logical.buffer);
    v.setUint16(0, species, true);
    v.setUint16(2, facts.heldItem ?? 0, true);
    v.setUint32(4, 64, true);
    logical[8] = facts.ppBonuses ?? 0;
    logical[9] = 70;
    facts.moves!.forEach((m, n) => v.setUint16(12 + n * 2, m ?? 0, true));
    logical.set(facts.pp as number[], 20);
    logical[37] = 16;
    v.setUint16(38, level | (3 << 7) | (4 << 11), true);
    v.setUint32(
      40,
      ivs.reduce((w, iv, n) => w + iv * 2 ** (5 * n), 0),
      true,
    );
    const bytes = new Uint8Array(80),
      h = new DataView(bytes.buffer);
    h.setUint32(0, pid, true);
    h.setUint16(4, tid, true);
    h.setUint16(6, sid!, true);
    bytes.fill(255, 8, 18);
    bytes[18] = 2;
    bytes[19] = 2;
    bytes.fill(255, 20, 27);
    let sum = 0;
    for (let n = 0; n < 48; n += 2) sum = (sum + v.getUint16(n, true)) & 65535;
    h.setUint16(28, sum, true);
    SUBSTRUCT_POSITIONS[pid % 24].forEach((physical, block) =>
      bytes.set(
        logical.subarray(block * 12, block * 12 + 12),
        32 + physical * 12,
      ),
    );
    for (let n = 32; n < 80; n += 4)
      h.setUint32(n, h.getUint32(n, true) ^ pid ^ ((sid! << 16) | tid), true);
    return bytes;
  };
  const snapshot: Snapshot = {
    ...newSnapshot("backup", "Backup", parsed.facts),
    summaryStats: parsed.summary,
    useSummaryStats: true,
  };
  const pixel = (bytes: Uint8Array, n: number): 0 | 1 =>
    ((bytes[(n - 16) >> 1] >>> (((n - 16) % 2) * 4)) & 15) === 0 ? 0 : 1;
  for (let n = 16; n < 176; n++) snapshot.observations[n] = pixel(record(), n);
  const input: DeductionInput = {
    identity: splitFacts(parsed.facts).identity,
    snapshots: [snapshot],
    activeId: snapshot.id,
    sidRng: window,
    sidCandidates: rows.map((r) => r.sid),
    starterGuide: true,
    backupGuide: true,
  };
  return {
    state,
    draft,
    parsed,
    pid,
    tid,
    sid: sid!,
    ivs,
    rows,
    input,
    record,
    pixel,
  };
}

test("the backup threshold is above five total EVs and its input never assumes a PID", () => {
  assert.equal(preferBackupPokemon(5), false);
  assert.equal(preferBackupPokemon(6), true);
  assert.equal(preferBackupPokemon(), false);
  const f = fixture();
  assert.equal(f.parsed.facts.pid, undefined);
  assert.equal(f.parsed.facts.otGender, "male");
  assert.deepEqual(f.parsed.facts.evs, [0, 0, 0, 0, 0, 0]);
  assert.throws(
    () => backupPokemonInput(f.state, { ...f.draft, stat_0: "9999" }),
    /do not fit/,
  );
  assert.throws(
    () => backupPokemonInput(f.state, { ...f.draft, ability: "" }),
    /actual ability/,
  );
});

test("opt-in summary bounds preserve actual IVs across every data permutation and leave advanced observations unchanged", () => {
  for (let order = 0; order < 24; order++) {
    const pid = 0x12340000 - (0x12340000 % 24) + order,
      f = fixture(pid),
      snapshot = f.input.snapshots[0];
    const plain = snapshotPlaintext(f.parsed.facts, snapshot),
      packed = f.ivs.reduce((w, iv, n) => w + iv * 2 ** (5 * n), 0);
    for (let n = 0; n < 8; n++)
      assert.ok(plain[80 + n] & (1 << ((packed >>> (n * 4)) & 15)));
    assert.equal(
      compileHypothesisValidator(f.input.identity, [snapshot])(
        makeHypothesis(pid, f.tid, f.sid),
      ),
      true,
    );
    assert.deepEqual(
      snapshotPlaintext(f.parsed.facts, {
        ...snapshot,
        useSummaryStats: undefined,
      }),
      knownPlaintext(f.parsed.facts),
    );
  }
  const f = fixture(),
    summary = {
      level: 100,
      stats: f.ivs.map((iv, n) =>
        calculateStat(
          speciesTraits(288)!.summaryBaseStats[n],
          iv,
          0,
          100,
          n,
          f.pid % 25,
        ),
      ),
    };
  const plain = snapshotPlaintext(f.parsed.facts, {
    ...f.input.snapshots[0],
    summaryStats: summary,
  });
  const packed = f.ivs.reduce((w, iv, n) => w + iv * 2 ** (5 * n), 0);
  for (let n = 0; n < 8; n++)
    assert.equal(plain[80 + n], 1 << ((packed >>> (n * 4)) & 15));
});

test("unknown-PID backup deduction retains the genuine SID and does not promote witness PIDs", () => {
  const f = fixture(),
    out = computeDeduction(f.input);
  assert.ok(out.sidResult!.rows.some((r) => r.sid === f.sid));
  if (out.sidResult!.pidValues === null) assert.equal(out.sidAnalysis, null);
  else assert.ok(out.sidResult!.pidValues.includes(f.pid));
  assert.ok(out.controlledExperiments.some((e) => e.action.id === "teach-15"));
  assert.ok(
    out.controlledExperiments.every(
      (e) => e.action.kind === "moves" || /^teach-15(?:-|$)/.test(e.action.id),
    ),
  );
  assert.equal(f.input.identity.pid, undefined);
});

test("Cut answers use their own current setup and preserve the original backup and starter evidence", () => {
  const f = fixture(),
    before = JSON.stringify(f.input.snapshots[0]),
    out = computeDeduction(f.input);
  const action = out.controlledExperiments.find(
    (e) => e.action.id === "teach-15",
  )!;
  assert.ok(action);
  let next = targetExperiment(
    createControlledTest(
      f.input.snapshots[0],
      "cut",
      action.action,
      action.pixels
        .filter((p) => p.index >= 80)
        .slice(0, 4)
        .map((p) => p.index),
    ),
  );
  const bytes = f.record({ ...f.parsed.facts, ...next.knownFacts });
  for (const n of next.targets!)
    next = answerExperimentPixel(next, n, f.pixel(bytes, n));
  const changed = computeDeduction({
    ...f.input,
    snapshots: [...f.input.snapshots, next],
    activeId: next.id,
  });
  assert.ok(changed.sidResult!.rows.some((r) => r.sid === f.sid));
  assert.equal(JSON.stringify(f.input.snapshots[0]), before);
  const restored = [...f.input.snapshots, undoExperimentAnswer(next)];
  const undone = computeDeduction({
    ...f.input,
    snapshots: restored,
    activeId: restored.find((s) => s.id === next.id)!.id,
  });
  for (const row of changed.sidResult!.rows)
    assert.ok(undone.sidResult!.rows.some((r) => r.sid === row.sid));
});

test("two Pokemon share only SID compatibility and clearing backup evidence can restore candidates", () => {
  const f = fixture(0x12340000, 0),
    out = computeDeduction(f.input);
  assert.deepEqual(
    out.sidResult!.rows.map((r) => r.sid),
    [0],
  );
  const starter = f.rows.map((r) => r.sid);
  assert.deepEqual(
    intersectBackupSids(
      starter,
      out.sidResult!.rows.map((r) => r.sid),
    ),
    [0],
  );
  assert.deepEqual(intersectBackupSids(starter, starter), starter);
  const starterLab = {
    sidAnalysis: {
      candidates: [makeHypothesis(0x87654321, 0, 0)],
      sidValues: starter,
    },
  } as any;
  const view = sharedSidLabView(starterLab, [0]);
  assert.equal(view.sidAnalysis!.candidates[0].pid, 0x87654321);
  assert.deepEqual(starterLab.sidAnalysis.sidValues, starter);
});

function mockLab(target: number) {
  const baseline = newSnapshot("baseline", "Starter", {
    heldItem: 0,
    moves: [10, 45, 0, 0],
    pp: [35, 40, 0, 0],
    evs: [0, 0, 2, 1, 0, 0],
  });
  baseline.observations = emptyObservations().map((v, n) =>
    n >= 16 && n < 176 ? 1 : v,
  );
  return {
    identity: { pid: 0, tid: 50998 },
    sidAnalysis: {
      candidates: [makeHypothesis(0, 50998, 5), makeHypothesis(0, 50998, 6)],
      sidValues: [5, 6],
    },
    sidRngRows: [
      { sid: 5, advances: [1245] },
      { sid: 6, advances: [1246] },
    ],
    activeSnapshot: baseline,
    activeId: baseline.id,
    itemTestBaseline: baseline,
    obs: baseline.observations,
    starterHasDrawing: true,
    canvasRef: { current: null },
    assistance: { contradictions: new Set() },
    predictions: emptyObservations(),
    experiments: [],
    controlledExperiments: [
      {
        action: {
          id: `ev-2-${target}`,
          name: `Defense EVs to ${target}`,
          kind: "ev",
          changes: { evs: [0, 0, target, 1, 0, 0] },
          logical: [52, 53],
          training: {
            target,
            vitamins: 0,
            battles: target - 2,
            seconds: 90,
            lastResort: false,
          },
        },
        pixels: [{ index: 132 }],
        informationGain: 1,
      },
    ],
    analysisBusy: false,
    analysisError: "",
  };
}
test("the existing recommendation offers the backup before an EV target above five and never confirms during unresolved joint analysis", () => {
  const render = (target: number) =>
    renderToStaticMarkup(
      createElement(StarterCurtainStep, {
        lab: mockLab(target),
        state: newStarterGuide(),
        onTraining: () => {},
        onMoreInfo: () => {},
        onBackup: () => {},
        backupAvailable: true,
      } as any),
    );
  assert.match(render(6), /Next: check your second/);
  assert.doesNotMatch(render(6), />Try this experiment/);
  assert.match(render(5), />Try this experiment/);
  assert.doesNotMatch(render(5), /Next: check your second/);
  const lab = mockLab(6);
  lab.sidAnalysis.sidValues = [5];
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(StarterCurtainStep, {
        lab,
        state: newStarterGuide(),
        onTraining: () => {},
        onMoreInfo: () => {},
        confirmationReady: false,
      } as any),
    ),
    /One SID matches:/,
  );
});

test("backup drafts and summary evidence persist; guide reset and undo include both investigations", () => {
  const f = fixture();
  f.state.backup = {
    active: true,
    configured: true,
    phase: "curtains",
    draft: f.draft,
  };
  assert.deepEqual(
    validateStarterGuide(JSON.parse(JSON.stringify(f.state))).backup,
    f.state.backup,
  );
  assert.equal(newStarterAttempt(f.state).backup, undefined);
  const saved = saveInvestigation({
    format: "emerald-curtain-investigation",
    schemaVersion: 1,
    mappingVersion: PROFILE.id,
    origin: "wild",
    identity: f.input.identity,
    snapshots: f.input.snapshots,
    activeId: "backup",
    ownedItems: [],
  });
  assert.equal(loadInvestigation(saved).snapshots[0].useSummaryStats, true);
  const data = new Map<string, string>([
    [GUIDE_KEY, JSON.stringify(f.state)],
    [GUIDE_LAB_KEY, "starter evidence"],
    [GUIDE_BACKUP_LAB_KEY, saved],
  ]);
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  resetGuideProgress(storage, f.state);
  assert.equal(data.has(GUIDE_BACKUP_LAB_KEY), false);
  restoreGuideProgress(storage);
  assert.equal(data.get(GUIDE_BACKUP_LAB_KEY), saved);
  assert.equal(data.get(GUIDE_LAB_KEY), "starter evidence");
});
