import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeConstraints, knownPlaintext } from "../src/core/inference";
import { computeDeduction } from "../src/core/deduction";
import { analyzeObservations } from "../src/core/jointInference";
import { rankDomainExperiments } from "../src/core/domainExperiments";
import { emptyObservations, type KnownFacts } from "../src/core/constraints";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
  type Snapshot,
} from "../src/core/investigation";
import {
  createItemTest,
  targetExperiment,
  answerExperimentPixel,
} from "../src/core/itemTests";
import { createControlledTest } from "../src/core/controlledExperiments";
import { diagnoseHypothesis, makeHypothesis } from "../src/core/sid";
import { genderForPid } from "../src/core/traits";
import { PROFILE } from "../src/core/memory";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestigationResults } from "../src/components/Investigator";
import { ItemTestControls } from "../src/components/ItemTestControls";
import { hitForNibble } from "../src/components/WorkbenchData";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

const fixture = JSON.parse(
  fs.readFileSync("research/fixtures/combusken-experiments.json", "utf8"),
) as {
  identity: KnownFacts;
  snapshot: Snapshot;
  reference: { pid: number; tid: number; sid: number; key: number };
};
const h = makeHypothesis(
  fixture.reference.pid,
  fixture.reference.tid,
  fixture.reference.sid,
);

test("symbolic key counts match independent exhaustive PID enumeration across all orders, nature, gender and shiny states", () => {
  for (const extra of [
    {},
    { shiny: true },
    { shiny: false },
    { shiny: false, nature: 3, gender: "male" as const },
  ]) {
    const facts: KnownFacts = {
      tid: 26488,
      sid: 33789,
      species: 281,
      ...extra,
    };
    const input = Array<number>(160).fill(65535);
    for (let n = 3; n < 8; n++) input[n] = 1 << ((0x18c2f000 >>> (n * 4)) & 15);
    const keys = Array.from({ length: 24 }, (_, order) =>
      Array.from({ length: 8 }, (_, n) =>
        n === 1 || n === 2 ? 65535 ^ (1 << ((order + n) % 16)) : 65535,
      ),
    );
    const result = analyzeConstraints(input, facts, keys),
      counts = Array.from({ length: 24 }, () =>
        Array.from({ length: 8 }, () => Array<number>(16).fill(0)),
      );
    let count = 0;
    for (let low = 0; low < 4096; low++) {
      const pid = 0x18c2f000 + low,
        key = (pid ^ 0x83fd6778) >>> 0;
      if (facts.nature !== undefined && pid % 25 !== facts.nature) continue;
      if (
        facts.gender !== undefined &&
        genderForPid(facts.species!, pid & 255) !== facts.gender
      )
        continue;
      if (
        facts.shiny !== undefined &&
        ((key & 65535) ^ (key >>> 16)) < 8 !== facts.shiny
      )
        continue;
      if (
        keys[pid % 24].some(
          (mask, n) => !(mask & (1 << ((key >>> (n * 4)) & 15))),
        )
      )
        continue;
      count++;
      for (let n = 0; n < 8; n++) counts[pid % 24][n][(key >>> (n * 4)) & 15]++;
    }
    assert.equal(result.pidCount, BigInt(count));
    assert.deepEqual(result.orderKeyCounts, counts);
    assert.ok(count > 0, "exhaustive comparison is nonempty");
    if (!Object.keys(extra).length) assert.equal(result.orders.length, 24);
  }
});

function truth(snapshot: Snapshot, index: number) {
  const physical = index - 80,
    blocks = SUBSTRUCT_POSITIONS[h.pid % 24],
    logical = blocks.indexOf(Math.floor(physical / 24)) * 24 + (physical % 24),
    mask = knownPlaintext({ ...snapshot.knownFacts, ...fixture.identity })[
      logical
    ];
  assert.ok(
    mask && !(mask & (mask - 1)),
    "reference outcome uses a known field, never guessed EVs",
  );
  return (Math.log2(mask) ^ ((h.key >>> ((physical % 8) * 4)) & 15)) === 0
    ? (0 as const)
    : (1 as const);
}

test("trained Combusken offers held-item, move and Candy questions without RNG, PID, IVs or EV assumptions", () => {
  const { identity, snapshot } = structuredClone(fixture),
    before = JSON.stringify(snapshot),
    result = computeDeduction({
      identity,
      snapshots: [snapshot],
      activeId: snapshot.id,
    });
  assert.equal(result.inference.pidCount, 10984833n);
  assert.equal(result.sidAnalysis, null);
  assert.equal(identity.pid, undefined);
  assert.equal(identity.ivs, undefined);
  assert.equal(snapshot.knownFacts.evs, undefined);
  assert.ok(result.experiments.length > 100);
  assert.equal(
    result.controlledExperiments.filter((e) => e.action.kind === "moves")
      .length,
    6,
  );
  assert.ok(
    result.controlledExperiments.some((e) => e.action.kind === "candy"),
  );
  assert.ok(
    !result.controlledExperiments.some((e) => e.action.kind === "vitamin"),
  );
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(diagnoseHypothesis(identity, snapshot, h), null);

  const item = result.experiments.find((e) => e.item.name === "SMOKE BALL")!,
    q = result.domainQuestions[`item-${item.item.id}`];
  assert.equal(q.index, 109);
  assert.equal(q.blackCount, 10675313);
  assert.equal(q.transparentCount, 2762220);
  assert.ok(
    q.conditional,
    "unknown plaintext in other orders retains overlapping identity sets",
  );
  for (const value of [0, 1] as const) {
    const draft = targetExperiment(
      createItemTest(snapshot, "item", item.item.id, [q.index]),
    );
    assert.ok(draft.observations.every((v) => v === -1));
    const answered = answerExperimentPixel(draft, q.index, value),
      after = analyzeObservations(identity, [snapshot, answered], snapshot);
    assert.equal(
      Number(after.pidCount),
      value ? q.blackCount : q.transparentCount,
    );
    assert.equal(answered.observations.filter((v) => v !== -1).length, 1);
  }
  const draft = targetExperiment(
      createItemTest(snapshot, "item", item.item.id, [q.index]),
    ),
    answered = answerExperimentPixel(draft, q.index, truth(draft, q.index));
  const next = computeDeduction({
    identity,
    snapshots: [snapshot, answered],
    activeId: snapshot.id,
  });
  assert.equal(next.inference.pidCount, 10675313n);
  assert.equal(diagnoseHypothesis(identity, answered, h), null);
  assert.notEqual(
    next.domainQuestions[`item-${item.item.id}`]?.index,
    q.index,
    "an already verified question must not be recommended again",
  );
  assert.ok(next.experiments.some((e) => e.groups > 1));
  assert.deepEqual(snapshot.observations, fixture.snapshot.observations);

  const move = next.controlledExperiments.find((e) => {
    const p = e.pixels[0].index - 80,
      blocks = SUBSTRUCT_POSITIONS[h.pid % 24],
      n = blocks.indexOf(Math.floor(p / 24)) * 24 + (p % 24),
      mask = knownPlaintext({
        ...snapshot.knownFacts,
        ...identity,
        ...e.action.changes,
      })[n];
    return mask && !(mask & (mask - 1));
  })!;
  assert.ok(move, "a second informative test remains available");
  const moveDraft = targetExperiment(
      createControlledTest(
        snapshot,
        "move",
        move.action,
        move.pixels.map((p) => p.index),
      ),
    ),
    index = moveDraft.targets![0],
    outcome = truth(moveDraft, index),
    second = answerExperimentPixel(moveDraft, index, outcome),
    afterTwo = analyzeObservations(
      identity,
      [snapshot, answered, second],
      snapshot,
    ),
    moveQuestion = next.domainQuestions[move.action.id];
  assert.equal(
    Number(afterTwo.pidCount),
    outcome ? moveQuestion.blackCount : moveQuestion.transparentCount,
  );
  assert.ok(afterTwo.pidCount < next.inference.pidCount);
  for (const s of [snapshot, answered, second])
    assert.equal(diagnoseHypothesis(identity, s, h), null);
  assert.deepEqual(snapshot.observations, fixture.snapshot.observations);

  const restored = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "static",
      identity,
      activeId: snapshot.id,
      snapshots: [snapshot, answered, second],
      ownedItems: [],
    }),
  );
  assert.equal(restored.rng, undefined);
  assert.deepEqual(
    restored.snapshots,
    JSON.parse(JSON.stringify([snapshot, answered, second])),
  );
});

test("move/Candy binary survivor counts match full multi-observation inference and keep the verified Combusken", () => {
  const { identity, snapshot } = structuredClone(fixture),
    inference = analyzeObservations(identity, [snapshot], snapshot),
    ranked = rankDomainExperiments(identity, [snapshot], snapshot, inference);
  for (const e of ranked.controlledExperiments) {
    const q = ranked.questions[e.action.id];
    for (const value of [0, 1] as const) {
      const draft = targetExperiment(
          createControlledTest(snapshot, e.action.id, e.action, [q.index]),
        ),
        answered = answerExperimentPixel(draft, q.index, value),
        after = analyzeObservations(identity, [snapshot, answered], snapshot);
      assert.equal(
        Number(after.pidCount),
        value ? q.blackCount : q.transparentCount,
        `${e.action.id}/${value}`,
      );
      if (value === truth(draft, q.index))
        assert.equal(diagnoseHypothesis(identity, answered, h), null);
    }
  }
});

test("domain recommendations require both trainer IDs and never rank deterministic pixels or an inconsistent model", () => {
  const snapshot = newSnapshot("empty", "Empty"),
    inf = analyzeObservations({}, [snapshot], snapshot);
  assert.deepEqual(
    rankDomainExperiments({ tid: 1 }, [snapshot], snapshot, inf).experiments,
    [],
  );
  assert.deepEqual(
    rankDomainExperiments({ sid: 2 }, [snapshot], snapshot, inf).experiments,
    [],
  );
  const known = { tid: 1, sid: 2, pid: 0x12345678 },
    exact = analyzeObservations(known, [snapshot], snapshot);
  assert.deepEqual(
    rankDomainExperiments(known, [snapshot], snapshot, exact).experiments,
    [],
  );
  const invalid = { ...snapshot, observations: emptyObservations() };
  invalid.observations[24] = 0; // TID low nibble 1 cannot be transparent.
  const conflict = analyzeObservations(known, [invalid], invalid);
  assert.deepEqual(
    rankDomainExperiments(known, [invalid], invalid, conflict).experiments,
    [],
  );
});

test("known-SID scope remains compatible with RNG-free PID experiments, while an excluded SID offers none", () => {
  const input = {
    identity: fixture.identity,
    snapshots: [fixture.snapshot],
    activeId: fixture.snapshot.id,
  };
  const allowed = computeDeduction({
    ...input,
    sidRng: { minAdvance: 764, maxAdvance: 764 },
  });
  assert.equal(allowed.sidResult?.rows[0]?.sid, fixture.identity.sid);
  assert.ok(allowed.experiments.length > 0);
  assert.equal(allowed.wildResult, null);
  const rejected = computeDeduction({
    ...input,
    sidRng: { minAdvance: 1, maxAdvance: 1 },
  });
  assert.equal(rejected.sidResult?.rows.length, 0);
  assert.equal(rejected.experiments.length, 0);
});

test("Investigation UI renders actionable broad-set recommendations, mapped targets and count updates without an RNG result", () => {
  const { identity, snapshot } = fixture,
    result = computeDeduction({
      identity,
      snapshots: [snapshot],
      activeId: snapshot.id,
    });
  const lab = {
    ...result,
    identity,
    facts: { ...snapshot.knownFacts, ...identity },
    activeSnapshot: snapshot,
    activeId: snapshot.id,
    itemTestBaseline: snapshot,
    currentSnapshots: [snapshot],
    obs: snapshot.observations,
    wildRng: { result: null },
    rngActive: false,
    factError: "",
    summaryError: "",
    ppError: "",
  } as unknown as CurtainLab;
  const html = renderToStaticMarkup(
    createElement(InvestigationResults, { lab }),
  );
  assert.match(html, /Try Swap moves/);
  assert.match(html, /Try Rare Candy to level 23/);
  assert.match(html, /Why this item/);
  assert.match(html, /known TID\/SID, key restrictions also restrict PID/);
  assert.match(html, /10,984,833/);
  assert.doesNotMatch(
    html,
    /RNG filters first|seed and advance search to generate candidates/,
  );
  for (const e of [...result.experiments, ...result.controlledExperiments])
    for (const p of e.pixels)
      assert.equal(hitForNibble(p.index)?.nibble, p.index);
  const item = result.experiments[0],
    draft = targetExperiment(
      createItemTest(
        snapshot,
        "pending",
        item.item.id,
        item.pixels.map((p) => p.index),
        10984833,
      ),
    );
  const pending = renderToStaticMarkup(
    createElement(ItemTestControls, {
      lab: {
        ...lab,
        activeSnapshot: draft,
        pendingItemTest: draft,
        currentSnapshots: [snapshot, draft],
        experimentTargets: draft.targets,
      } as CurtainLab,
      openEditor: () => {},
      openResults: () => {},
    }),
  );
  assert.match(pending, /Locate pixel/);
  assert.match(pending, />Black<\/button>/);
  assert.match(pending, />Transparent<\/button>/);
  assert.match(pending, /Unexamined/);
  const completed = answerExperimentPixel(
    draft,
    draft.targets![0],
    truth(draft, draft.targets![0]),
  );
  const saved = renderToStaticMarkup(
    createElement(ItemTestControls, {
      lab: {
        ...lab,
        lastCompletedItemTest: completed,
        investigationInference: {
          ...result.investigationInference,
          pidCount: 10675313n,
        },
      } as CurtainLab,
      openEditor: () => {},
      openResults: () => {},
    }),
  );
  assert.match(saved, /10,984,833 → 10,675,313 PID possibilities/);
});
