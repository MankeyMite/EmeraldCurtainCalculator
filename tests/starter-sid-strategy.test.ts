import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { StarterCatalogue } from "../src/core/starterCatalogue";
import { cataloguePreparation } from "../src/core/starterCatalogue";
import {
  scanStarterCatalogue,
  rankCatalogueTargets,
  type CatalogueLanding,
} from "../src/core/starterCatalogueScan";
import {
  rehearseStarterSidStrategy,
  newStarterStrategyCache,
  chooseStarterStrategyQuestions,
  type StarterStrategyAudit,
} from "../src/core/starterSidStrategy";
import {
  rankSurvivingSidTimings,
  prioritizeStarterSidPixels,
} from "../src/core/starterSidPriority";
import { compareStarterSidExperiments } from "../src/core/starterSidScoring";
import { generateSidRng } from "../src/core/sidRng";
import { estimatedSidWindow } from "../src/core/starterTiming";
import { newStarterGuide, STARTERS } from "../src/core/starterGuide";
import { assessStarterOutlook } from "../src/core/starterOutlook";
import { makeHypothesis } from "../src/core/sid";
import {
  starterRecommendationKey,
  savedStarterRecommendation,
} from "../src/core/starterRecommendation";

const catalogue = JSON.parse(
  fs.readFileSync("src/data/starter-catalogue.json", "utf8"),
) as StarterCatalogue;
const small = {
  ...catalogue,
  spreads: catalogue.spreads.slice(0, 5),
  rules: { ...catalogue.rules, maxAdvance: 1004 },
};

test("known-pixel planning uses the live leading-SID score and prefers its isolation", () => {
  const rows = [0x1111, 0x1112, 0x1113, 0x1114].map((sid, n) => ({
    sid,
    advances: [1245 + n * 10],
  }));
  const sids = rows.map((r) => r.sid),
    timing = rankSurvivingSidTimings(rows, sids, 1245);
  const hypotheses = sids.map((sid) => makeHypothesis(0, 0, sid));
  const lead = chooseStarterStrategyQuestions(sids, [2, 0, 0, 0], timing)!;
  const distant = chooseStarterStrategyQuestions(sids, [4, 0, 0, 0], timing)!;
  const actual = prioritizeStarterSidPixels(
    hypotheses,
    { heldItem: 1 },
    [84, 85, 86, 87],
    timing,
  )!;
  assert.deepEqual(lead.questions, [{ digit: 0, candidate: 1 }]);
  for (const key of [
    "benefit",
    "informationGain",
    "leadingGain",
    "closestSeparation",
    "isolatesLeading",
    "confirmsLeading",
  ] as const)
    assert.equal(lead[key], actual[key]);
  assert.ok(
    compareStarterSidExperiments(
      { ...lead, seconds: 30 },
      { ...distant, seconds: 30 },
    ) < 0,
  );
  const rejected = sids.filter((sid) => sid !== 0x1111);
  assert.equal(
    rankSurvivingSidTimings(rows, rejected, 1245).leaders[0].sid,
    0x1112,
  );
});

test("catalogue effort, no-training counts and landed-starter previews share the same full-window rehearsal", () => {
  const state = newStarterGuide();
  state.tid = "50998";
  const scan = scanStarterCatalogue(small, {
    tid: Number(state.tid),
    intro: state.intro,
    starter: { ...state.starter, uncertainty: 2 },
  });
  assert.equal(scan.fullSidCount, 121);
  assert.equal(scan.priority.length, 19);
  const rows = generateSidRng(
    Number(state.tid),
    estimatedSidWindow(state.intro),
  );
  for (const landing of scan.landings.filter((l) => l.advance === 1002)) {
    const spread = small.spreads.find((s) => s.advance === landing.advance)!;
    const prepared = cataloguePreparation(small, spread, landing.option);
    const facts = { ...prepared.facts, tid: Number(state.tid) };
    const scenarios = scan.priority.map((r) => r.sid);
    const input = {
      facts,
      spread,
      rows,
      target: scan.targetSidAdvance,
      scenarios,
      collectedItems: landing.option.item ? [landing.option.item] : [],
      consumedItems: prepared.consumedItems,
    };
    const uncached = rehearseStarterSidStrategy(input);
    const cached = rehearseStarterSidStrategy({
      ...input,
      cache: newStarterStrategyCache(),
    });
    assert.deepEqual(cached, uncached);
    const total = scan.sidWeights.reduce((a, b) => a + b, 0);
    assert.equal(
      landing.strategySeconds,
      uncached.reduce(
        (sum, c, n) => sum + scan.sidWeights[n] * (c.seconds ?? 14400),
        0,
      ) / total,
    );
    assert.equal(
      landing.strategyExperiments,
      uncached.reduce(
        (sum, c, n) => sum + scan.sidWeights[n] * (c.experiments ?? 64),
        0,
      ) / total,
    );
    assert.equal(
      landing.drawingOnly,
      uncached.filter((c) => c.paintingOnly).length,
    );
    assert.equal(
      landing.withoutTraining,
      uncached.filter(
        (c) =>
          c.experiments !== null &&
          c.defenseTarget === null &&
          c.speedTarget === null,
      ).length,
    );
    state.species = landing.species;
    const preview = assessStarterOutlook(
      state,
      {
        ...spread,
        lastAdvance: spread.advance,
        methods: ["Method1"],
        slot: 0,
        level: 5,
      },
      {
        facts,
        instructions: [],
        done: [],
        items: input.collectedItems,
        actions: [],
        score: { total: 121, worstCase: 0, expected: 0 },
      },
    );
    for (const c of preview.cases) {
      const predicted = uncached.find((p) => p.sid === c.sid)!;
      assert.equal(c.paintingOnly, predicted.paintingOnly);
      assert.equal(c.experiments, predicted.experiments);
      assert.equal(c.defenseTarget, predicted.defenseTarget);
      assert.equal(c.speedTarget, predicted.speedTarget);
    }
  }
});

test("rehearsal carries the actual setup forward and chooses without reading the hidden outcome", () => {
  const state = newStarterGuide();
  state.tid = "30134";
  const spread = {
    pid: 344867839,
    ivs: [13, 25, 31, 19, 15, 31],
    abilitySlot: 0,
  };
  const rows = generateSidRng(
    Number(state.tid),
    estimatedSidWindow(state.intro),
  );
  const trace: StarterStrategyAudit[] = [];
  const facts = {
    tid: Number(state.tid),
    heldItem: 86,
    moves: [33, 189, 45, 0],
    pp: [35, 10, 40, 0],
    ppBonuses: 0,
    evs: [0, 2, 2, 2, 0, 0],
    pokerus: 0,
  };
  const result = rehearseStarterSidStrategy(
    {
      facts,
      spread,
      rows,
      target: 1245,
      scenarios: rows
        .filter((r) => r.advances.some((a) => Math.abs(a - 1245) <= 9))
        .map((r) => r.sid),
    },
    (step) => trace.push(step),
  );
  assert.ok(result.some((c) => (c.experiments ?? 0) > 1));
  const policy = new Map<string, string>();
  let carried = 0;
  for (const c of result) {
    const steps = trace.filter((t) => t.sid === c.sid);
    for (let n = 0; n < steps.length; n++) {
      const step = steps[n];
      if (n) {
        assert.deepEqual(step.startingFacts, steps[n - 1].resultingFacts);
        carried++;
      }
      const key = JSON.stringify([step.before, step.startingFacts]);
      const chosen = JSON.stringify([step.action, step.questions]);
      if (policy.has(key)) assert.equal(chosen, policy.get(key));
      policy.set(key, chosen);
      const expected = step.before.filter((sid) =>
        step.questions.every(
          (q) =>
            (((sid >>> (q.digit * 4)) & 15) === q.candidate) ===
            (((c.sid >>> (q.digit * 4)) & 15) === q.candidate),
        ),
      );
      assert.deepEqual(step.after, expected);
      assert.ok(step.after.includes(c.sid));
    }
  }
  assert.ok(carried > 0);
});

test("an alternative outside the nineteen scenarios prevents drawing-only and false confirmation", () => {
  const rows = [
    { sid: 0x1111, advances: [1245] },
    { sid: 0x2222, advances: [1299] },
  ];
  const base = {
    facts: { heldItem: 0, pokerus: 0 },
    spread: { pid: 0, ivs: [0, 0, 0, 0, 0, 0], abilitySlot: 0 },
    target: 1245,
    scenarios: [0x1111],
    drawingMasks: [1, 1, 1, 1] as [number, number, number, number],
    allowTraining: false,
  };
  const full = rehearseStarterSidStrategy({ ...base, rows })[0];
  assert.equal(full.paintingOnly, false);
  assert.ok(full.experiments === null || full.experiments > 0);
  assert.equal(
    rehearseStarterSidStrategy({ ...base, rows: rows.slice(0, 1) })[0]
      .paintingOnly,
    true,
  );
});

test("target ranking rewards cheap timing-aware confirmation at the exact PID and its close neighbours", () => {
  const c = {
    ...catalogue,
    spreads: catalogue.spreads.slice(0, 21).map((s) => ({
      ...s,
      level5Stats: Object.fromEntries(STARTERS.map((p) => [p, [s.advance]])),
    })),
    rules: { ...catalogue.rules, maxAdvance: 1020 },
  };
  const landings: CatalogueLanding[] = STARTERS.flatMap((species) =>
    c.spreads.map((s) => ({
      advance: s.advance,
      pid: s.pid,
      species,
      option: c.options[species][0],
      drawingOnly: 1,
      coverageBits: 1,
      fullDrawingOnly: 1,
      expectedSurvivors: 2,
      worstSurvivors: 2,
      priorityExpectedSurvivors: 2,
      withoutTraining: 19,
      withoutTrainingBits: (1 << 19) - 1,
      shortTraining: 19,
      shortTrainingBits: (1 << 19) - 1,
      evCap: 0,
      evEffort: 0,
      strategySeconds: species === 280 ? Math.abs(s.advance - 1010) * 30 : 500,
      strategyExperiments: 1,
      strategyUnresolved: 0,
    })),
  );
  const best = rankCatalogueTargets(
    c,
    landings,
    { ...newStarterGuide().starter, uncertainty: 5 },
    19,
    5,
  )[0];
  assert.equal(best.species, 280);
  assert.equal(best.advance, 1010);
  // An unresolved rehearsal must not win by appearing to take zero seconds.
  for (const r of landings.filter((l) => l.species === 280))
    r.strategyUnresolved = 1;
  assert.notEqual(
    rankCatalogueTargets(
      c,
      landings,
      { ...newStarterGuide().starter, uncertainty: 5 },
      19,
      5,
    )[0].species,
    280,
  );
});

test("old saved target recommendations cannot silently retain the previous policy", () => {
  const state = newStarterGuide();
  state.tid = "50998";
  const key = JSON.parse(starterRecommendationKey(state));
  assert.equal(key[0], 5);
  key[0] = 3;
  state.starterRecommendation = {
    key: JSON.stringify(key),
    advance: 1500,
    species: 280,
  };
  assert.equal(savedStarterRecommendation(state), null);
});
