import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  rankSurvivingSidTimings,
  estimatedSidTargetAdvance,
  prioritizeStarterSidPixels,
  compareStarterSidExperiments,
  leadingSidPixelReason,
} from "../src/core/starterSidPriority";
import {
  defaultIntroTiming,
  estimatedSidWindow,
} from "../src/core/starterTiming";
import { generateSidRng, type SidRngRow } from "../src/core/sidRng";
import { makeHypothesis, type Hypothesis } from "../src/core/sid";
import { StarterSidTimingOverview } from "../src/components/StarterSidTimingOverview";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";
import { newStarterGuide } from "../src/core/starterGuide";
import { emptyObservations, type KnownFacts } from "../src/core/constraints";
import { newSnapshot } from "../src/core/investigation";
import {
  createItemTest,
  targetExperiment,
  answerExperimentPixel,
} from "../src/core/itemTests";
import { computeDeduction } from "../src/core/deduction";
import { usefulStarterPixels } from "../src/core/starterRoute";

const target = 1245;
const rows: SidRngRow[] = [
  { sid: 0x84fd, advances: [1247] },
  { sid: 0xa29f, advances: [1276] },
  { sid: 0x63c1, advances: [1197] },
];
const candidates = rows.map((r) => makeHypothesis(0, 50998, r.sid));
const timing = rankSurvivingSidTimings(
  rows,
  rows.map((r) => r.sid),
  target,
);
function experiment(
  hypotheses: Hypothesis[],
  facts: KnownFacts,
  positions: number[],
  t = timing,
  seconds = 30,
) {
  const score = prioritizeStarterSidPixels(hypotheses, facts, positions, t);
  assert.ok(score);
  return { ...score, seconds };
}

test("surviving SID distance ranking preserves all advances, signs and equally close ties", () => {
  assert.deepEqual(
    timing.candidates.map((c) => c.sid),
    [0x84fd, 0xa29f, 0x63c1],
  );
  assert.deepEqual(
    timing.candidates.map((c) => c.distance),
    [2, 31, 48],
  );
  assert.deepEqual(
    timing.candidates.map((c) => c.closestAdvances[0] - target),
    [2, 31, -48],
  );
  const before = JSON.stringify(rows);
  const duplicated = rankSurvivingSidTimings(
    [...rows, { sid: 0x84fd, advances: [1190, 1243, 1247, 1300] }],
    [0x84fd, 0x84fd, 0xa29f],
    target,
  );
  assert.equal(duplicated.candidates.length, 2);
  assert.deepEqual(duplicated.leaders[0].advances, [1190, 1243, 1247, 1300]);
  assert.deepEqual(duplicated.leaders[0].closestAdvances, [1243, 1247]);
  const tied = rankSurvivingSidTimings(
    [
      { sid: 1, advances: [1243] },
      { sid: 2, advances: [1247] },
      { sid: 3, advances: [1280] },
    ],
    [3, 2, 1],
    target,
  );
  assert.deepEqual(
    tied.leaders.map((c) => c.sid),
    [1, 2],
  );
  assert.equal(JSON.stringify(rows), before);
  const partial = rankSurvivingSidTimings(rows, [0x84fd, 123], target);
  assert.equal(partial.candidates.length, 2);
  assert.equal(
    partial.candidates[1].distance,
    null,
    "missing timing never removes a surviving SID",
  );
  assert.equal(estimatedSidTargetAdvance(defaultIntroTiming()), 1245);
  assert.equal(
    estimatedSidTargetAdvance({
      ...defaultIntroTiming(),
      calibration: -7,
      offset: 45,
    }),
    1233,
  );
});

test("incompatible observations eliminate the timing leader and promote the next survivor", () => {
  const baseline = newSnapshot("baseline", "Starter", { heldItem: 0 });
  let item = targetExperiment(createItemTest(baseline, "potion", 13, [84]));
  const input = {
    identity: { pid: 0, tid: 50998 },
    snapshots: [baseline, item],
    activeId: item.id,
    sidCandidates: rows.map((r) => r.sid),
    starterGuide: true,
  };
  const before = computeDeduction(input);
  assert.deepEqual(
    rankSurvivingSidTimings(
      rows,
      before.sidAnalysis!.sidValues,
      target,
    ).leaders.map((c) => c.sid),
    [0x84fd],
  );
  item = answerExperimentPixel(item, 84, 1);
  const after = computeDeduction({ ...input, snapshots: [baseline, item] });
  assert.deepEqual(after.sidAnalysis!.sidValues, [0x63c1, 0xa29f]);
  assert.deepEqual(
    rankSurvivingSidTimings(
      rows,
      after.sidAnalysis!.sidValues,
      target,
    ).leaders.map((c) => c.sid),
    [0xa29f],
  );
});

test("a cheap leading-SID isolation beats an equally cheap test of a distant SID", () => {
  const leading = experiment(candidates, { heldItem: 13 }, [84]);
  const distant = experiment(candidates, { heldItem: 15 }, [84]);
  assert.equal(leading.isolatesLeading, true);
  assert.equal(distant.isolatesLeading, false);
  assert.ok(compareStarterSidExperiments(leading, distant) < 0);
  assert.match(
    leading.reason,
    /Transparent would uniquely confirm the leading SID/,
  );
  assert.match(leading.reason, /Black would eliminate the leading SID/);
  assert.match(leading.reason, /\+2 advances/);
});

test("leading confirmation is balanced against information gain and actual experiment effort", () => {
  const rs = [rows[0], { sid: 0x82f1, advances: [1250] }, ...rows.slice(1)];
  const hs = rs.map((r) => makeHypothesis(0, 50998, r.sid)),
    t = rankSurvivingSidTimings(
      rs,
      rs.map((r) => r.sid),
      target,
    );
  const isolate = experiment(hs, { heldItem: 13 }, [84], t);
  const balanced = experiment(hs, { heldItem: 0xf0 }, [85], t);
  assert.ok(balanced.informationGain > isolate.informationGain);
  assert.ok(compareStarterSidExperiments(isolate, balanced) < 0);
  assert.ok(
    compareStarterSidExperiments({ ...isolate, seconds: 3600 }, balanced) > 0,
    "hours of EV work cannot trump a cheap useful test merely because it isolates the leader",
  );
  const unavailable = rankSurvivingSidTimings(
    [],
    rs.map((r) => r.sid),
    target,
  );
  const a = experiment(hs, { heldItem: 13 }, [84], unavailable),
    b = experiment(hs, { heldItem: 0xf0 }, [85], unavailable);
  assert.ok(
    compareStarterSidExperiments(b, a) < 0,
    "without timing the information/cost fallback remains useful",
  );
  const nonisolating = experiment(hs, { heldItem: 0xf0 }, [85], t);
  assert.equal(nonisolating.isolatesLeading, false);
  assert.ok(nonisolating.leadingGain > 0);
});

test("equally informative fallback tests favour separating the closest competitor", () => {
  const rs = [rows[0], { sid: 0x82f1, advances: [1250] }, ...rows.slice(1)];
  const hs = rs.map((r) => makeHypothesis(0, 50998, r.sid));
  const t = rankSurvivingSidTimings(
    rs,
    rs.map((r) => r.sid),
    target,
  );
  const nearest = experiment(hs, { heldItem: 1 }, [84], t);
  const remote = experiment(hs, { heldItem: 0xf0 }, [85], t);
  assert.equal(nearest.isolatesLeading, false);
  assert.equal(remote.isolatesLeading, false);
  assert.equal(nearest.informationGain, remote.informationGain);
  assert.ok(nearest.closestSeparation > remote.closestSeparation);
  assert.ok(compareStarterSidExperiments(nearest, remote) < 0);
});

test("equally close SID candidates are treated symmetrically in experiment scoring", () => {
  const rs = [
    { sid: 1, advances: [1243] },
    { sid: 2, advances: [1247] },
  ];
  const hs = rs.map((r) => makeHypothesis(0, 50998, r.sid));
  const t = rankSurvivingSidTimings(rs, [1, 2], target);
  const a = experiment(hs, { heldItem: 1 }, [84], t);
  const b = experiment(hs, { heldItem: 2 }, [84], t);
  assert.equal(a.benefit, b.benefit);
  assert.equal(a.confirmsLeading, false);
  assert.match(a.reason, /equally close SID candidates/);
  assert.doesNotMatch(a.reason, /the leading SID|uniquely confirm/);
});

test("unknown plaintext and multiple PID/IV witnesses never become deterministic SID outcomes", () => {
  assert.equal(prioritizeStarterSidPixels(candidates, {}, [84], timing), null);
  assert.equal(leadingSidPixelReason(candidates, {}, 84, timing), "");
  const twoPids = [
    candidates[0],
    makeHypothesis(0x10000, 50998, 0x84fd),
    ...candidates.slice(1),
  ];
  const mixed = experiment(twoPids, { heldItem: 13 }, [84]);
  assert.equal(mixed.isolatesLeading, false);
  assert.match(mixed.reason, /Transparent would uniquely confirm/);
  assert.doesNotMatch(mixed.reason, /Black would eliminate/);
  const rs = [
    { sid: 1, advances: [1245] },
    { sid: 2, advances: [1275] },
  ];
  const hs = [
    {
      ...makeHypothesis(0, 50998, 1),
      rng: { ivs: [0, 0, 0, 2, 0, 0], abilitySlot: 0 },
    },
    {
      ...makeHypothesis(0, 50998, 1),
      rng: { ivs: [0, 0, 0, 0, 0, 0], abilitySlot: 0 },
    },
    {
      ...makeHypothesis(0, 50998, 2),
      rng: { ivs: [0, 0, 0, 0, 0, 0], abilitySlot: 0 },
    },
  ];
  const iv = experiment(
    hs,
    {},
    [164],
    rankSurvivingSidTimings(rs, [1, 2], target),
  );
  assert.equal(iv.isolatesLeading, false);
  assert.match(iv.reason, /Transparent would uniquely confirm/);
  assert.doesNotMatch(iv.reason, /Black would eliminate/);
  const unresolved = rankSurvivingSidTimings(
    [...rows, { sid: 12, advances: [1305] }],
    [...rows.map((r) => r.sid), 12],
    target,
  );
  const conservative = experiment(
    candidates,
    { heldItem: 13 },
    [84],
    unresolved,
  );
  assert.equal(
    conservative.confirmsLeading,
    false,
    "an unresolved distant SID permits every outcome",
  );
  assert.doesNotMatch(conservative.reason, /uniquely confirm/);
});

test("the complete configured window participates in prediction and solver confirmation", () => {
  const all = generateSidRng(50998, estimatedSidWindow(defaultIntroTiming()));
  const lead = all.find((r) => r.advances.includes(target))!;
  const far = all.find(
    (r) =>
      Math.min(...r.advances.map((a) => Math.abs(a - target))) > 19 &&
      (r.sid & 15) === (lead.sid & 15),
  )!;
  assert.ok(far);
  const other = all.find((r) => (r.sid & 15) !== (lead.sid & 15))!;
  const pool = [lead.sid, far.sid, other.sid];
  const fullTiming = rankSurvivingSidTimings(all, pool, target);
  const hs = pool.map((sid) => makeHypothesis(0, 50998, sid));
  const planned = experiment(hs, { heldItem: lead.sid & 15 }, [84], fullTiming);
  assert.equal(planned.confirmsLeading, false);
  assert.doesNotMatch(planned.reason, /uniquely confirm/);
  const baseline = newSnapshot("baseline", "Starter", { heldItem: 0 });
  let test = targetExperiment(
    createItemTest(baseline, "item", lead.sid & 15, [84]),
  );
  test = answerExperimentPixel(test, 84, 0);
  const r = computeDeduction({
    identity: { pid: 0, tid: 50998 },
    snapshots: [baseline, test],
    activeId: test.id,
    sidRng: estimatedSidWindow(defaultIntroTiming()),
    starterGuide: true,
  });
  assert.deepEqual(
    new Set(r.sidAnalysis!.sidValues),
    new Set(
      all
        .filter((row) => (row.sid & 15) === (lead.sid & 15))
        .map((row) => row.sid),
    ),
  );
  assert.ok(r.sidAnalysis!.sidValues.includes(lead.sid));
  assert.ok(r.sidAnalysis!.sidValues.includes(far.sid));
  assert.equal(r.sidRows.length, 121);
  assert.ok(
    rankSurvivingSidTimings(
      all,
      r.sidAnalysis!.sidValues,
      target,
    ).candidates.some((c) => c.sid === far.sid),
  );
  const incomplete = rankSurvivingSidTimings(all, [lead.sid, far.sid], target);
  const html = renderToStaticMarkup(
    createElement(StarterSidTimingOverview, { value: incomplete }),
  );
  assert.match(html, /All 2 surviving SIDs/);
  assert.match(html, /not confirmation/);
});

test("the overview displays signed distances, the next candidate, a complete table and explicit ties", () => {
  const html = renderToStaticMarkup(
    createElement(StarterSidTimingOverview, { value: timing }),
  );
  assert.match(html, /Most likely by timing: 0x84FD \(34045\)/);
  assert.match(html, /1247 \(\+2\)/);
  assert.match(html, /1276 \(\+31\)/);
  assert.match(html, /1197 \(-48\)/);
  assert.match(html, /Gap between closest generating advances: 29/);
  assert.equal(
    (html.match(/<tbody>.*?<\/tbody>/s)![0].match(/<tr/g) ?? []).length,
    3,
  );
  assert.doesNotMatch(html, /%|probability|confirmed/i);
  const tied = rankSurvivingSidTimings(
    [
      { sid: 1, advances: [1243, 1305] },
      { sid: 2, advances: [1247] },
      { sid: 3, advances: [1280] },
    ],
    [1, 2, 3],
    target,
  );
  const tieHtml = renderToStaticMarkup(
    createElement(StarterSidTimingOverview, { value: tied }),
  );
  assert.match(tieHtml, /2 SIDs tied closest/);
  assert.match(tieHtml, /1243, 1305/);
  assert.match(tieHtml, /Gap between closest generating advances: 33/);
  assert.doesNotMatch(tieHtml, /Most likely by timing/);
  assert.equal(
    renderToStaticMarkup(
      createElement(StarterSidTimingOverview, {
        value: timing,
        updating: true,
      }),
    ),
    "",
  );
});

test("Discover SID integrates the new display and leading-SID experiment reason without claiming a solved SID", () => {
  const baseline = newSnapshot("baseline", "Starter", {
    heldItem: 0,
    moves: [1, 43, 0, 0],
    pp: [35, 30, 0, 0],
  });
  baseline.observations = emptyObservations().map((_, n) =>
    n >= 16 && n < 176 ? 1 : -1,
  );
  const lab = {
    identity: { pid: 0, tid: 50998 },
    sidAnalysis: { candidates, sidValues: rows.map((r) => r.sid) },
    sidRngRows: rows,
    activeSnapshot: baseline,
    activeId: baseline.id,
    itemTestBaseline: baseline,
    obs: baseline.observations,
    starterHasDrawing: true,
    canvasRef: { current: null },
    assistance: { contradictions: new Set() },
    predictions: emptyObservations(),
    analysisBusy: false,
    analysisError: "",
    experiments: [
      {
        item: { id: 15, name: "PARLYZ HEAL" },
        pixels: [{ index: 84 }],
        informationGain: 1,
      },
      {
        item: { id: 13, name: "POTION" },
        pixels: [{ index: 84 }],
        informationGain: 1,
      },
    ],
    controlledExperiments: [],
  };
  const state = newStarterGuide();
  state.tid = "50998";
  const html = renderToStaticMarkup(
    createElement(StarterCurtainStep, {
      lab,
      state,
      onTraining: () => {},
      onMoreInfo: () => {},
    } as unknown as Parameters<typeof StarterCurtainStep>[0]),
  );
  assert.match(html, /SID timing overview/);
  assert.match(html, /Next: Hold POTION/);
  assert.match(html, /Recommended to test the leading SID/);
  assert.doesNotMatch(html, /One SID matches:/);
});
