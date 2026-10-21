import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { analyzeObservations } from "../src/core/jointInference";
import { computeDeduction } from "../src/core/deduction";
import { experimentProgress } from "../src/core/experimentProgress";
import { scoreOutcomes } from "../src/core/checksum";
import { isInformativeExperiment } from "../src/core/experiments";
import {
  answerExperimentPixel,
  createItemTest,
  targetExperiment,
} from "../src/core/itemTests";
import { createControlledTest } from "../src/core/controlledExperiments";
import { ExperimentProgress } from "../src/components/ExperimentProgress";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

const uploaded = () =>
  loadInvestigation(
    fs.readFileSync(
      "research/fixtures/torchic-joint-progress-investigation.json",
      "utf8",
    ),
  );

test("uploaded Torchic answers narrow joint pairs even when no entire PID or SID is ruled out", () => {
  const input = uploaded(),
    baseline = input.snapshots[0];
  assert.equal(input.identity.pid, undefined);
  assert.equal(input.identity.sid, undefined);
  const inferences = [2, 3, 4].map((n) =>
    analyzeObservations(input.identity, input.snapshots.slice(0, n), baseline),
  );
  assert.deepEqual(
    inferences.map((r) => r.pidCount),
    [6754n, 6754n, 6754n],
  );
  assert.deepEqual(
    inferences.map((r) => r.headerPairCount),
    [776506n, 705877n, 635281n],
  );
  // Independent encryption oracle for the two recorded black pixels:
  // swapped PP byte 40 = 0x28 tests key digit 4 == 8; Great Ball ID 3
  // tests key digit 4 == 3. Black excludes equality, not all PIDs.
  for (const [i, digit] of [8, 3].entries()) {
    assert.equal(
      inferences[i].headerPairCount - inferences[i + 1].headerPairCount,
      BigInt(inferences[i].orderKeyCounts[20][4][digit]),
    );
    const snapshots = input.snapshots.slice(0, i + 3);
    const p = experimentProgress(
      input.identity,
      snapshots,
      baseline,
      baseline,
      inferences[i + 1],
    )!;
    assert.equal(p.pairsBefore, Number(inferences[i].headerPairCount));
    assert.equal(p.pairsAfter, Number(inferences[i + 1].headerPairCount));
    assert.deepEqual(p.excludedKeyDigits, [{ digit: 4, values: [digit] }]);
  }
  assert.deepEqual(loadInvestigation(saveInvestigation(input)), input);
});

test("latest uploaded investigation only offers questions that can narrow its joint model, with and without SID RNG", () => {
  const input = uploaded(),
    baseline = input.snapshots[0];
  for (const sidRng of [undefined, input.sidRng]) {
    const result = computeDeduction({ ...input, sidRng });
    assert.equal(result.experimentStatus, "available");
    assert.equal(result.experimentProgress!.pairsAfter, 635281);
    if (sidRng) {
      assert.equal(result.sidResult!.rows.length, 1374);
      assert.equal(result.sidResult!.pidValues, null);
    }
    const recommendations = [
      ...result.experiments,
      ...result.controlledExperiments,
    ];
    assert.ok(recommendations.length > 0);
    for (const e of recommendations) {
      assert.ok(isInformativeExperiment(e));
      const q =
        result.domainQuestions["item" in e ? `item-${e.item.id}` : e.action.id];
      assert.ok(q.transparentCount > 0 && q.transparentCount < q.total);
      assert.ok(q.blackCount > 0 && q.blackCount < q.total);
      assert.equal(q.transparentCount + q.blackCount, q.total);
    }
    // Great Ball's only unknown item nibble was answered. The same move swap
    // can still test a different PP nibble; never ask the answered pixel again.
    assert.ok(!result.experiments.some((e) => e.item.id === 3));
    const swap = result.controlledExperiments.find(
      (e) => e.action.id === "moves-1-2",
    )!;
    assert.deepEqual(
      swap.pixels.map((p) => p.index),
      [108],
    );
    assert.ok(!swap.pixels.some((p) => p.index === 124));

    // Re-solving each answer confirms survivor predictions for a new held
    // item and a new question on the previously tried move swap.
    if (!sidRng)
      for (const e of [result.experiments[0], swap]) {
        const q =
          result.domainQuestions[
            "item" in e ? `item-${e.item.id}` : e.action.id
          ];
        const draft = targetExperiment(
          "item" in e
            ? createItemTest(baseline, "next-item", e.item.id, [q.index])
            : createControlledTest(baseline, "next-move", e.action, [q.index]),
        );
        for (const answer of [0, 1] as const) {
          const after = analyzeObservations(
            input.identity,
            [...input.snapshots, answerExperimentPixel(draft, q.index, answer)],
            baseline,
          );
          assert.equal(
            Number(after.headerPairCount),
            answer ? q.blackCount : q.transparentCount,
          );
          assert.ok(after.headerPairCount < result.inference.headerPairCount);
        }
      }
  }
});

test("visible nuisance patterns shared by every identity are not useful recommendations", () => {
  const black = [{ index: 72, value: 1 }],
    transparent = [{ index: 72, value: 0 }];
  const nuisance = scoreOutcomes([
    [black, transparent],
    [black, transparent],
  ]);
  assert.equal(nuisance.groups, 2);
  assert.equal(nuisance.worstCase, 2);
  assert.deepEqual(nuisance.pixels, []);
  assert.equal(isInformativeExperiment(nuisance), false);
  // Overlap is allowed: this test can exclude identity 1 on transparency.
  const useful = scoreOutcomes([[black, transparent], [black]]);
  assert.equal(useful.worstCase, 2);
  assert.equal(isInformativeExperiment(useful), true);
});

test("saved test feedback labels joint bounds and does not claim a distinct PID reduction", () => {
  const progress = {
    snapshotId: "great-ball",
    pairsBefore: 705877,
    pairsAfter: 635281,
    pidsBefore: 6754,
    pidsAfter: 6754,
    excludedKeyDigits: [{ digit: 4, values: [3] }],
    eliminatedOrders: [],
  };
  const lab = { experimentProgress: progress } as unknown as CurtainLab;
  const html = renderToStaticMarkup(
    createElement(ExperimentProgress, { lab, snapshotId: "great-ball" }),
  );
  assert.match(html, /705,877 → 635,281/);
  assert.match(html, /stored-data upper bounds, before optional RNG filtering/);
  assert.match(html, /Distinct PID bound remains 6,754/);
  assert.match(html, /XOR-key digit 4 excludes 3/);
  assert.doesNotMatch(html, /bits|PID possibilities/);
  const stale = renderToStaticMarkup(
    createElement(ExperimentProgress, { lab, snapshotId: "different" }),
  );
  assert.doesNotMatch(stale, /635,281/);
  const running = renderToStaticMarkup(
    createElement(ExperimentProgress, {
      lab: { ...lab, analysisBusy: true },
      snapshotId: "great-ball",
    }),
  );
  assert.match(running, /Updating candidates/);
  assert.doesNotMatch(running, /635,281/);
});
