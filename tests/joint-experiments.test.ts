import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeConstraints } from "../src/core/inference";
import { analyzeObservations } from "../src/core/jointInference";
import { computeDeduction } from "../src/core/deduction";
import {
  rankDomainExperiments,
  type ExperimentDomain,
} from "../src/core/domainExperiments";
import { scopeExperimentDomain } from "../src/core/experimentScope";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
  type Snapshot,
} from "../src/core/investigation";
import {
  createItemTest,
  answerExperimentPixel,
  targetExperiment,
} from "../src/core/itemTests";
import {
  controlledActions,
  createControlledTest,
} from "../src/core/controlledExperiments";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import {
  makeHypothesis,
  compileHypothesisValidator,
  type Hypothesis,
} from "../src/core/sid";
import { genderForPid } from "../src/core/traits";
import type { KnownFacts } from "../src/core/constraints";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestigationResults } from "../src/components/Investigator";
import type { CurtainLab } from "../src/hooks/useCurtainLab";
import { checksumRankingExample } from "../scripts/deduction-examples";

const inputFile = "research/fixtures/unknown-sid-user-investigation.json";
const uploaded = () => loadInvestigation(fs.readFileSync(inputFile, "utf8"));
const blankCounts = () =>
  Array.from({ length: 24 }, () =>
    Array.from({ length: 8 }, () => Array<number>(16).fill(0)),
  );

test("weighted joint key marginals equal exhaustive PID/SID enumeration, including shiny, gender, nature and all 24 orders", () => {
  for (const extra of [
    {},
    { shiny: true },
    { shiny: false },
    { nature: 1, gender: "male" as const, shiny: false },
  ]) {
    const facts: KnownFacts = { tid: 0, species: 280, ...extra };
    const masks = Array<number>(160).fill(65535);
    // 1,024 possible PIDs and 32 possible SIDs. No candidate list enters DP.
    masks[2] = 15;
    for (let n = 3; n < 8; n++) masks[n] = 1;
    masks[13] = 3;
    masks[14] = masks[15] = 1;
    const keys = Array.from({ length: 24 }, (_, o) =>
      Array.from({ length: 8 }, (_, n) =>
        n === 4 ? 65535 ^ (1 << ((o + 7) % 16)) : 65535,
      ),
    );
    const result = analyzeConstraints(masks, facts, keys);
    const counts = blankCounts(),
      pids = new Set<number>();
    let pairs = 0;
    for (let pid = 0; pid < 1024; pid++)
      for (let sid = 0; sid < 32; sid++) {
        const key = (pid ^ (sid * 65536)) >>> 0;
        if (facts.nature !== undefined && pid % 25 !== facts.nature) continue;
        if (facts.gender && genderForPid(280, pid) !== facts.gender) continue;
        if (
          facts.shiny !== undefined &&
          ((key & 65535) ^ (key >>> 16)) < 8 !== facts.shiny
        )
          continue;
        if (
          keys[pid % 24].some(
            (mask, n) => !(mask & (1 << ((key >>> (4 * n)) & 15))),
          )
        )
          continue;
        pairs++;
        pids.add(pid);
        for (let n = 0; n < 8; n++)
          counts[pid % 24][n][(key >>> (4 * n)) & 15]++;
      }
    assert.equal(result.headerPairCount, BigInt(pairs));
    assert.equal(result.pidCount, BigInt(pids.size));
    assert.deepEqual(result.orderKeyCounts, counts);
    for (let n = 0; n < 8; n++)
      assert.equal(
        result.orderKeyCounts.reduce(
          (s, o) => s + o[n].reduce((a, b) => a + b, 0),
          0,
        ),
        pairs,
      );
    if (!Object.keys(extra).length) assert.equal(result.orders.length, 24);
  }
});

// Independent byte packing oracle: never calls knownPlaintext or actionPixels.
function logicalPayload(facts: KnownFacts): (number | null)[] {
  const bytes: (number | null)[] = Array(48).fill(null);
  const write = (
    at: number,
    value: number | undefined | null,
    size: number,
  ) => {
    if (value == null) return;
    for (let i = 0; i < size; i++) bytes[at + i] = (value >>> (8 * i)) & 255;
  };
  write(0, facts.species, 2);
  write(2, facts.heldItem, 2);
  write(4, facts.experience, 4);
  write(8, facts.ppBonuses, 1);
  facts.moves?.forEach((v, i) => write(12 + 2 * i, v, 2));
  facts.pp?.forEach((v, i) => write(20 + i, v, 1));
  facts.evs?.forEach((v, i) => write(24 + i, v, 1));
  return bytes.flatMap((b) => (b === null ? [null, null] : [b & 15, b >>> 4]));
}
function outcomes(h: Hypothesis, facts: KnownFacts, index: number) {
  const physical = index - 80,
    positions = SUBSTRUCT_POSITIONS[h.pid % 24];
  const logical =
    positions.indexOf(Math.floor(physical / 24)) * 24 + (physical % 24);
  const plain = logicalPayload(facts)[logical];
  // Unknown nibble is existential, not a randomly chosen default.
  const values =
    plain === null ? Array.from({ length: 16 }, (_, n) => n) : [plain];
  return new Set(
    values.map((p) =>
      (p ^ ((h.key >>> (4 * (physical % 8))) & 15)) === 0 ? 0 : 1,
    ),
  );
}
function model(candidates: Hypothesis[]): ExperimentDomain {
  const counts = blankCounts();
  for (const h of candidates)
    for (let n = 0; n < 8; n++)
      counts[h.pid % 24][n][(h.key >>> (4 * n)) & 15]++;
  return {
    consistent: !!candidates.length,
    headerPairCount: BigInt(candidates.length),
    orders: [...new Set(candidates.map((h) => h.pid % 24))],
    orderKeyCounts: counts,
  };
}

test("unknown Growth/Attacks/EV positions use real binary outcomes with overlapping candidate sets", () => {
  const identity = { tid: 0, species: 280 };
  const source = newSnapshot("base", "Unknown positions", {
    heldItem: 0,
    moves: [52, 45, 116, 10],
    pp: [25, 40, 30, 35],
    ppBonuses: 0,
    experience: 864,
    evs: [0, 0, 0, 0, 0, 0],
  });
  const candidates = Array.from({ length: 48 }, (_, pid) =>
    [0, 3, 7, 15].map((sid) => makeHypothesis(pid, 0, sid)),
  ).flat();
  const ranked = rankDomainExperiments(
    identity,
    [source],
    source,
    model(candidates),
  );
  assert.ok(ranked.experiments.length > 0);
  assert.equal(
    ranked.controlledExperiments.filter((e) => e.action.kind === "moves")
      .length,
    6,
  );
  assert.ok(
    ranked.controlledExperiments.some((e) => e.action.kind === "vitamin"),
  );
  assert.ok(Object.values(ranked.questions).some((q) => q.conditional));
  for (const e of [...ranked.experiments, ...ranked.controlledExperiments]) {
    const id = "item" in e ? `item-${e.item.id}` : e.action.id;
    const changes = "item" in e ? { heldItem: e.item.id } : e.action.changes;
    const q = ranked.questions[id],
      facts = { ...source.knownFacts, ...identity, ...changes };
    const transparent = candidates.filter((h) =>
      outcomes(h, facts, q.index).has(0),
    ).length;
    const black = candidates.filter((h) =>
      outcomes(h, facts, q.index).has(1),
    ).length;
    assert.equal(q.transparentCount, transparent, id);
    assert.equal(q.blackCount, black, id);
    assert.equal(e.worstCase, Math.max(transparent, black), id);
    assert.equal(q.countBasis, "PID/SID pair");
    if (q.conditional) assert.ok(transparent + black > candidates.length);
  }
});

test("unchanged black does not imply unchanged plaintext; transparent can eliminate whole permutations", () => {
  const identity = { tid: 0, species: 280 };
  const source = newSnapshot("base", "Positions", { heldItem: 0 });
  const before = analyzeObservations(identity, [source], source);
  const index = 84; // Growth item low nibble if Growth is physical block 0.
  const target = targetExperiment(createItemTest(source, "item", 4, [index]));
  for (const value of [0, 1] as const) {
    const after = answerExperimentPixel(target, index, value);
    const result = analyzeObservations(identity, [source, after], source);
    for (let pid = 0; pid < 96; pid++)
      for (const sid of [0, 3, 7, 15]) {
        const h = makeHypothesis(pid, 0, sid);
        if (
          outcomes(h, { ...target.knownFacts, ...identity }, index).has(value)
        ) {
          assert.ok(result.orders.includes(pid % 24));
          for (let n = 0; n < 8; n++)
            assert.ok(result.keyMasks[n] & (1 << ((h.key >>> (4 * n)) & 15)));
        }
      }
  }
  // k=3, item 0 -> 4: ciphertext 3 -> 7, both black.
  assert.deepEqual(
    [...outcomes(makeHypothesis(0, 0, 3), { heldItem: 0 }, index)],
    [1],
  );
  assert.deepEqual(
    [...outcomes(makeHypothesis(0, 0, 3), { heldItem: 4 }, index)],
    [1],
  );
  assert.equal(before.orders.length, 24);
  // Baseline offset 4 is known zero in every logical block. Black therefore
  // rules out key digit 4 = 0. Changing the item to 4 can make this physical
  // pixel transparent only when Growth is there, regardless of other digits.
  const positioned = newSnapshot("positioned", "Known zero fields", {
    heldItem: 0,
    moves: [1, 0, 0, 0],
    evs: [0, 0, 0, 0, 0, 0],
  });
  positioned.observations[index] = 1;
  const positionIdentity = {
    ...identity,
    metLevel: 0,
    metGame: 0,
    ball: 0,
    otGender: "male" as const,
  };
  const allOrders = analyzeObservations(
    positionIdentity,
    [positioned],
    positioned,
  );
  assert.equal(allOrders.orders.length, 24);
  const question = targetExperiment(
    createItemTest(positioned, "position-test", 4, [index]),
  );
  const zero = answerExperimentPixel(question, index, 0);
  const reduced = analyzeObservations(
    positionIdentity,
    [positioned, zero],
    positioned,
  );
  assert.ok(reduced.orders.length > 0 && reduced.orders.length < 24);
  assert.ok(reduced.orders.every((o) => SUBSTRUCT_POSITIONS[o][0] === 0));
});

test("all four known/unknown PID and SID workflows remain supported", () => {
  const source = newSnapshot("base", "Source", {
    heldItem: 0,
    moves: [52, 45, 116, 10],
    pp: [25, 40, 30, 35],
    ppBonuses: 0,
  });
  for (const extra of [
    {},
    { sid: 1234 },
    { pid: 0x12345678 },
    { sid: 1234, pid: 0x12345678 },
  ]) {
    const identity = { species: 280, tid: 11558, ...extra };
    const r = computeDeduction({
      identity,
      snapshots: [source],
      activeId: source.id,
    });
    assert.ok(r.inference.consistent);
    if (extra.pid !== undefined && extra.sid !== undefined) {
      assert.equal(r.sidAnalysis?.candidates.length, 1);
      assert.ok(!r.experiments.some((e) => e.groups > 1));
    } else assert.ok(r.experiments.some((e) => e.groups > 1));
  }
});

test("actual uploaded Torchic JSON offers item and move questions, with and without optional SID RNG, and round trips unchanged", () => {
  const investigation = uploaded(),
    before = saveInvestigation(investigation);
  assert.equal(investigation.identity.pid, undefined);
  assert.equal(investigation.identity.sid, undefined);
  assert.equal(investigation.identity.species, 280);
  assert.equal(investigation.snapshots[0].knownFacts.evs, undefined);
  const results = [undefined, investigation.sidRng].map((sidRng) =>
    computeDeduction({ ...investigation, sidRng }),
  );
  for (const r of results) {
    assert.equal(r.experimentStatus, "available");
    assert.equal(r.inference.headerPairCount, 17077510n);
    assert.equal(r.inference.pidCount, 148515n);
    assert.deepEqual(r.inference.orders, [20]);
    assert.equal(r.experiments.length, 209);
    assert.equal(
      r.controlledExperiments.filter((e) => e.action.kind === "moves").length,
      5,
    );
    assert.ok(r.controlledExperiments.some((e) => e.action.kind === "candy"));
    assert.ok(
      !r.controlledExperiments.some((e) => e.action.kind === "vitamin"),
    );
    const move = r.controlledExperiments.find(
      (e) => e.action.id === "moves-0-3",
    )!;
    assert.equal(move.worstCase, 8539084);
    assert.equal(r.domainQuestions[move.action.id].index, 104);
    assert.equal(r.domainQuestions[move.action.id].transparentCount, 8539084);
    assert.equal(r.domainQuestions[move.action.id].blackCount, 8538426);
  }
  assert.equal(results[1].sidResult?.rows.length, 1374);
  assert.equal(results[1].sidResult?.pidValues, null);
  assert.ok(
    Object.values(results[1].domainQuestions).every((q) => q.scopeRelaxed),
  );
  // A witness proves compatibility, but was not substituted for the PID set.
  const witness = results[1].sidResult!.rows.find(
    (r) => r.witnessPid !== undefined,
  )!;
  const h = makeHypothesis(
    witness.witnessPid!,
    investigation.identity.tid!,
    witness.sid,
  );
  assert.ok(
    compileHypothesisValidator(
      investigation.identity,
      investigation.snapshots,
    )(h),
  );
  assert.ok(
    results[1].inference.pidCount > BigInt(results[1].sidResult!.rows.length),
  );

  const baseline = investigation.snapshots[0],
    ranked = results[0];
  const tests = [ranked.experiments[0], ...ranked.controlledExperiments];
  for (const e of tests) {
    const id = "item" in e ? `item-${e.item.id}` : e.action.id;
    const q = ranked.domainQuestions[id];
    const draft = targetExperiment(
      "item" in e
        ? createItemTest(baseline, id, e.item.id, [q.index])
        : createControlledTest(baseline, id, e.action, [q.index]),
    );
    for (const value of [0, 1] as const) {
      const answered = answerExperimentPixel(draft, q.index, value);
      const after = analyzeObservations(
        investigation.identity,
        [baseline, answered],
        baseline,
      );
      assert.equal(
        Number(after.headerPairCount),
        value ? q.blackCount : q.transparentCount,
        id,
      );
      assert.ok(after.headerPairCount < ranked.inference.headerPairCount);
    }
  }
  assert.equal(saveInvestigation(investigation), before);
  assert.deepEqual(loadInvestigation(before), investigation);
});

test("SID scopes preserve unresolved rows and never count witness PIDs as an exhaustive identity set", () => {
  const source = newSnapshot("base", "Source", { heldItem: 0 });
  const identity = { tid: 0 };
  const rows = [
    { sid: 1, witnessPid: 0 },
    { sid: 17, unresolved: true },
  ];
  const exact = scopeExperimentDomain(identity, [source], source, rows);
  assert.equal(exact.scopeRelaxed, false);
  assert.equal(exact.inference.headerPairCount, 2n * (1n << 32n));
  const marginals = blankCounts();
  for (const { sid } of rows) {
    const one = analyzeObservations({ ...identity, sid }, [source], source);
    one.orderKeyCounts.forEach((o, i) =>
      o.forEach((d, n) => d.forEach((v, k) => (marginals[i][n][k] += v))),
    );
  }
  assert.deepEqual(exact.inference.orderKeyCounts, marginals);
  const many = Array.from({ length: 9 }, (_, n) => ({
    sid: n * 257,
    unresolved: true,
  }));
  const fallback = scopeExperimentDomain(identity, [source], source, many);
  assert.equal(fallback.scopeRelaxed, true);
  assert.ok(fallback.inference.headerPairCount >= 9n * (1n << 32n));
  const ranked = rankDomainExperiments(
    identity,
    [source],
    source,
    fallback.inference,
    { scopeRelaxed: true },
  );
  assert.ok(ranked.experiments.length > 0);
  assert.ok(
    Object.values(ranked.questions).every(
      (q) => q.countKind === "upper-bound" && q.scopeRelaxed,
    ),
  );
});

test("linked checksum wraparound detects contradictions without PID, SID, order or a guessed baseline", () => {
  const identity = { tid: 11558 };
  const source = newSnapshot("base", "Source", { heldItem: 0 });
  source.observations[72] = 1;
  source.observations[73] =
    source.observations[74] =
    source.observations[75] =
      1;
  // Checksum 0xffff is compatible with these pixels; +1 can wrap to zero.
  const target = createItemTest(source, "after", 1, []);
  target.itemTest!.phase = "recorded";
  target.observations.fill(-1);
  for (let n = 72; n < 76; n++) target.observations[n] = 0;
  assert.equal(
    analyzeObservations(identity, [source, target], source).consistent,
    true,
  );
  // Baseline low digit zero is impossible if incrementing it produces zero.
  source.observations[72] = 0;
  const conflict = analyzeObservations(identity, [source, target], source);
  assert.equal(conflict.consistent, false);
  assert.match(conflict.reason!, /linked modulo-65536/);
  const r = computeDeduction({
    identity,
    snapshots: [source, target],
    activeId: source.id,
  });
  assert.equal(r.experimentStatus, "inconsistent");
  assert.equal(r.experiments.length, 0);
  assert.equal(r.controlledExperiments.length, 0);
});

test("multi-position checksum scoring does not double-count identical checksum evidence", () => {
  const identity = { tid: 0, species: 280 };
  const source = newSnapshot("base", "Source", {
    heldItem: 0,
    checksum: 65535,
  });
  const candidates = [
    makeHypothesis(0, 0, 0),
    makeHypothesis(1, 0, 1),
    makeHypothesis(2, 0, 2),
  ];
  const r = rankDomainExperiments(
    identity,
    [source],
    source,
    model(candidates),
    { candidates },
  );
  assert.ok(r.experiments.length > 0);
  assert.ok(r.experiments.every((e) => e.checksumDelta === e.item.id));
  assert.ok(
    r.experiments.every((e) => !e.checksumContributes),
    "identical known checksums cannot distinguish identities",
  );
});

test("domain fallback combines linked checksums even when encrypted pixels alone are deterministic", () => {
  const example = checksumRankingExample();
  const identity = { ...example.identity };
  delete identity.pid;
  assert.equal(identity.sid, undefined);
  const encrypted = rankDomainExperiments(
    identity,
    [example.source],
    example.source,
    model(example.candidates),
  );
  const combined = rankDomainExperiments(
    identity,
    [example.source],
    example.source,
    model(example.candidates),
    { candidates: example.candidates },
  );
  const gain = combined.experiments.find(
    (e) => e.item.id === example.gain.item.id,
  )!;
  assert.ok(gain.checksumContributes);
  assert.equal(gain.worstCase, 2);
  assert.equal(
    encrypted.experiments.find((e) => e.item.id === gain.item.id),
    undefined,
  );
  assert.ok(gain.checksumQuestions.length > 0);
});

test("enumeration limit falls back to symbolic ranking without truncating candidates", () => {
  const source = newSnapshot("base", "15 possible PIDs", { heldItem: 0 });
  source.observations[16] = 1;
  for (let n = 17; n < 24; n++) source.observations[n] = 0;
  const result = computeDeduction({
    identity: { tid: 0 },
    snapshots: [source],
    activeId: source.id,
  });
  assert.equal(result.inference.pidCount, 15n);
  assert.equal(result.inference.headerPairCount, 15n * 65536n);
  assert.equal(result.sidAnalysis, null);
  assert.ok(
    result.experimentLimitations.some((message) => /200,000/.test(message)),
  );
  assert.ok(result.experiments.length > 0);
  assert.ok(
    Object.values(result.domainQuestions).every((q) => q.total === 15 * 65536),
  );
});

test("unknown-SID UI explains joint bounds and distinguishes running, conflicts, missing facts and identical outcomes", () => {
  const f = uploaded(),
    source = f.snapshots[0];
  const r = computeDeduction({ ...f, sidRng: undefined });
  const lab = {
    ...r,
    identity: f.identity,
    facts: { ...source.knownFacts, ...f.identity },
    activeSnapshot: source,
    activeId: source.id,
    itemTestBaseline: source,
    currentSnapshots: [source],
    obs: source.observations,
    wildRng: { result: null },
    rngActive: false,
    factError: "",
    summaryError: "",
    ppError: "",
  } as unknown as CurtainLab;
  const render = (overrides = {}) =>
    renderToStaticMarkup(
      createElement(InvestigationResults, { lab: { ...lab, ...overrides } }),
    );
  const html = render();
  assert.match(html, /Try Swap moves 1 and 4/);
  assert.match(html, /PID\/SID pair possibilities/);
  assert.match(html, /8,539,084/);
  assert.match(html, /conservative single-pixel bounds/);
  assert.doesNotMatch(html, /Enter the original trainer TID and SID/);
  assert.match(render({ analysisBusy: true }), /Analysis still running/);
  assert.match(
    render({ experimentStatus: "inconsistent" }),
    /constraints are inconsistent/,
  );
  assert.match(
    render({ experimentStatus: "insufficient-information" }),
    /Insufficient known information/,
  );
  assert.match(
    render({ experimentStatus: "indistinguishable" }),
    /indistinguishable identity outcomes/,
  );
  assert.match(
    render({ experimentStatus: "computation-limited" }),
    /could not rank experiments/,
  );
});
