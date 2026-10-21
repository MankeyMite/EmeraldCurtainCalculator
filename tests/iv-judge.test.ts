import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  judgeAllows,
  judgeIvDomains,
  validateIvJudge,
  type IvJudgeEvidence,
} from "../src/core/ivJudge";
import { analyzeConstraints, ivPossibilities } from "../src/core/inference";
import { computeDeduction } from "../src/core/deduction";
import { factsToDraft, draftToFacts } from "../src/core/facts";
import { loadSession, saveSession, validateFacts } from "../src/core/session";
import {
  newSnapshot,
  splitFacts,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { emptyObservations, type KnownFacts } from "../src/core/constraints";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { PROFILE } from "../src/core/memory";
import { defaultRngSettings } from "../src/core/rng";
import { scanStaticSpreads } from "../src/core/staticRng";
import { IvJudgePanel } from "../src/components/IvJudgePanel";
import { compileHypothesisValidator, makeHypothesis } from "../src/core/sid";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

const full = () =>
  Array.from({ length: 6 }, () => Array.from({ length: 32 }, (_, n) => n));
// Independent numeric oracle: no production range tables, packing or DP.
function oracle(e: IvJudgeEvidence, ivs: number[]) {
  const total = ivs.reduce((a, b) => a + b, 0),
    max = Math.max(...ivs);
  const overall = total <= 90 ? 0 : total <= 120 ? 1 : total <= 150 ? 2 : 3;
  const tier = max <= 15 ? 0 : max <= 25 ? 1 : max <= 30 ? 2 : 3;
  return (
    (e.overall === undefined || e.overall === overall) &&
    e.best.every((r) => r.rating === tier && ivs[r.stat] === max)
  );
}

test("Emerald judge thresholds include every best IV and total-IV boundary", () => {
  for (let value = 0; value <= 31; value++)
    for (let rating = 0; rating < 4; rating++) {
      const e = { best: [{ stat: 0, rating }] },
        ivs = [value, 0, 0, 0, 0, 0];
      assert.equal(judgeAllows(e, ivs), oracle(e, ivs));
    }
  for (let sum = 0; sum <= 186; sum++)
    for (let overall = 0; overall < 4; overall++) {
      let remaining = sum;
      const ivs = Array.from({ length: 6 }, () => {
        const v = Math.min(31, remaining);
        remaining -= v;
        return v;
      });
      const e = { overall, best: [] };
      assert.equal(judgeAllows(e, ivs), oracle(e, ivs));
    }
});

test("judge maximum/sum DP marginals equal exhaustive reference tuples, including tied maxima", () => {
  const domains = Array.from({ length: 6 }, () => [0, 15, 16, 25, 26, 30, 31]);
  for (const overall of [undefined, 0, 1, 2, 3])
    for (let rating = 0; rating < 4; rating++) {
      const e = {
        overall,
        best: [
          { stat: 0, rating },
          { stat: 5, rating },
        ],
      };
      const supports = Array.from({ length: 6 }, () => new Set<number>());
      function visit(ivs: number[]) {
        if (ivs.length === 6) {
          if (oracle(e, ivs)) ivs.forEach((v, i) => supports[i].add(v));
          return;
        }
        for (const v of domains[ivs.length]) visit([...ivs, v]);
      }
      visit([]);
      assert.deepEqual(
        judgeIvDomains(e, domains),
        supports.map((s) => [...s].sort((a, b) => a - b)),
      );
    }
});

test("repeated flawless answers confirm ties but never rule out unmentioned 31s", () => {
  const answer = { stat: 0, rating: 3 };
  const once = judgeIvDomains({ best: [answer] }, full());
  const repeated = judgeIvDomains({ best: Array(10).fill(answer) }, full());
  assert.deepEqual(once, repeated);
  assert.deepEqual(once[0], [31]);
  assert.ok(once.slice(1).every((v) => v.includes(31)));
  const two = judgeIvDomains(
    { best: [answer, { stat: 4, rating: 3 }] },
    full(),
  );
  assert.deepEqual(two[4], [31]);
  const lower = judgeIvDomains({ best: [{ stat: 0, rating: 2 }] }, full());
  assert.ok(lower.every((v) => !v.includes(31)));
  // The overall total CAN prove there are no more flawless stats: two 31s
  // leave at most 28 for all other stats when the IV total is at most 90.
  const summed = judgeIvDomains(
    { overall: 0, best: [answer, { stat: 4, rating: 3 }] },
    full(),
  );
  assert.ok(summed[1].every((v) => v <= 28));
});

test("judge evidence is shared identity data and survives fact edits, legacy sessions and JSON backups", () => {
  const ivJudge = {
    overall: 1,
    best: [
      { stat: 4, rating: 3 },
      { stat: 0, rating: 3 },
    ],
  };
  const facts: KnownFacts = {
    tid: 11558,
    ivJudge,
    ivs: [31, null, null, null, 31, null],
  };
  assert.deepEqual(
    draftToFacts({ ...factsToDraft(facts), experience: "864" }).ivJudge,
    ivJudge,
  );
  assert.deepEqual(
    loadSession(saveSession(emptyObservations(), facts)).knownFacts,
    facts,
  );
  const { identity } = splitFacts(facts),
    first = newSnapshot("first", "Original", facts);
  assert.equal(first.knownFacts.ivJudge, undefined);
  const input = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: PROFILE.id,
    origin: "static" as const,
    identity,
    snapshots: [first, newSnapshot("next", "Item change", { heldItem: 3 })],
    activeId: "first",
    ownedItems: [],
  };
  assert.deepEqual(loadInvestigation(saveInvestigation(input)), input);
  for (const bad of [
    { best: [{ stat: 6, rating: 3 }] },
    { best: [{ stat: 0, rating: 4 }] },
    { best: [], overall: -1 },
    { best: [], unseenStatsAreBelow31: true },
  ])
    assert.throws(() => validateFacts({ ivJudge: bad }));
  assert.throws(() => validateIvJudge({ best: [null] }));
});

test("packed IV judge constraints preserve genuine tuples through every block order and reject wrong overall ratings", () => {
  const ivs = [31, 10, 15, 31, 2, 18],
    word = ivs.reduce((v, n, i) => v + n * 2 ** (5 * i), 0);
  for (let pid = 0; pid < 24; pid++) {
    const masks = Array(160).fill(65535),
      tid = 11558,
      sid = 37399,
      key = (pid ^ (sid * 65536 + tid)) >>> 0;
    for (let n = 0; n < 8; n++) {
      const physical = SUBSTRUCT_POSITIONS[pid][3] * 24 + 8 + n;
      const cipher =
        ((word >>> (4 * n)) & 15) ^ ((key >>> (4 * (physical % 8))) & 15);
      masks[64 + physical] = 1 << cipher;
    }
    const facts = {
      pid,
      tid,
      sid,
      ivJudge: {
        overall: 1,
        best: [
          { stat: 0, rating: 3 },
          { stat: 3, rating: 3 },
        ],
      },
    };
    const result = analyzeConstraints(masks, facts);
    assert.equal(result.consistent, true, String(pid));
    ivs.forEach((v, i) => assert.deepEqual(ivPossibilities(result, i), [v]));
    const conflict = analyzeConstraints(masks, {
      ...facts,
      ivJudge: { ...facts.ivJudge, overall: 3 },
    });
    assert.equal(conflict.consistent, false, String(pid));
  }
});

test("judge ranges update deduction IVs, propagate conflicts and filter generated IV tuples exactly", () => {
  const source = newSnapshot("base", "Original");
  const r = computeDeduction({
    identity: { ivJudge: { best: [{ stat: 4, rating: 3 }] } },
    snapshots: [source],
    activeId: source.id,
  });
  assert.deepEqual(r.ivEstimates[4].combined, [31]);
  assert.ok(r.ivEstimates[0].combined.includes(31));
  const conflict = computeDeduction({
    identity: {
      ivs: [0, 0, 0, 0, 0, 0],
      ivJudge: { best: [{ stat: 0, rating: 3 }] },
    },
    snapshots: [source],
    activeId: source.id,
  });
  assert.equal(conflict.experimentStatus, "inconsistent");
  const settings = {
    ...defaultRngSettings("static", { species: 158 }),
    maxAdvance: 99,
  };
  const all = scanStaticSpreads(settings, { species: 158 }, [source]);
  const evidence = { best: [{ stat: 0, rating: 2 }] };
  assert.deepEqual(
    scanStaticSpreads(settings, { species: 158, ivJudge: evidence }, [source]),
    all.filter((h) => oracle(evidence, h.ivs)),
  );
});

test("IV judge interface provides actual answer choices and safe repeat-check guidance", () => {
  const lab = {
    facts: { ivJudge: { best: [{ stat: 4, rating: 3 }] } },
    ivEstimates: full().map((combined) => ({ combined })),
  } as unknown as CurtainLab;
  const html = renderToStaticMarkup(createElement(IvJudgePanel, { lab }));
  assert.match(html, /Battle Frontier IV judge/);
  assert.match(html, /after the Elite Four/);
  assert.match(html, /IV judge highest stat/);
  assert.match(html, /IV judge stat comment/);
  assert.match(html, /IV 16–25/);
  assert.match(html, /IV 26–30/);
  assert.match(html, /Confirmed 31 IVs: Sp. Attack/);
  assert.match(html, /Talk to him a few more times/);
  assert.match(html, /does not rule out other 31s/);
});

test("joint PID/SID validation keeps every possible order and SID when judge-confirmed IVs fit", () => {
  const source = newSnapshot("base", "Original"),
    identity: KnownFacts = {
      tid: 11558,
      ivs: [31, 10, 15, 31, 2, 18],
      ivJudge: {
        overall: 1,
        best: [
          { stat: 0, rating: 3 },
          { stat: 3, rating: 3 },
        ],
      },
    };
  const fits = compileHypothesisValidator(identity, [source]);
  const conflicts = compileHypothesisValidator(
    { ...identity, ivJudge: { overall: 1, best: [{ stat: 4, rating: 3 }] } },
    [source],
  );
  for (let pid = 0; pid < 24; pid++)
    for (const sid of [0, 37399, 65535]) {
      const h = makeHypothesis(pid, identity.tid!, sid);
      assert.equal(fits(h), true);
      assert.equal(conflicts(h), false);
    }
});
