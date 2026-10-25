import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StarterOutlook } from "../src/components/StarterOutlook";
import {
  assessStarterOutlook,
  closestGuideSids,
  type StarterOutlookAudit,
  type StarterSidOutlook,
} from "../src/core/starterOutlook";
import {
  newStarterGuide,
  newStarterAttempt,
  type RouteSetup,
} from "../src/core/starterGuide";
import { routeCheckpoint, starterPlaintext } from "../src/core/starterRoute";
import {
  estimatedSidWindow,
  estimatedStarterWindow,
  shiftStarterTarget,
  starterTargetFrame,
} from "../src/core/starterTiming";
import { makeHypothesis } from "../src/core/sid";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { swapMoveFacts } from "../src/core/moveLearningExperiments";
import type { KnownFacts } from "../src/core/constraints";
import type { RngSpread } from "../src/core/rng";

function fixture() {
  const state = newStarterGuide();
  state.tid = "30134";
  state.species = 283;
  const spread: RngSpread = {
    pid: 344867839,
    ivs: [13, 25, 31, 19, 15, 31],
    abilitySlot: 0,
    advance: 1159,
    lastAdvance: 1159,
    methods: ["Method1"],
    slot: -1,
    level: 5,
  };
  const route: RouteSetup = {
    facts: {
      ...routeCheckpoint(state),
      evs: [0, 2, 2, 2, 0, 0],
      moves: [33, 189, 45, 0],
      pp: [35, 10, 40, 0],
      heldItem: 86,
    },
    instructions: [],
    done: [],
    score: { total: 120, worstCase: 20, expected: 5.2 },
  };
  return { state, spread, route };
}

// Independent RNG transcript: no call to the preview or SID RNG generator.
function oracleRows(tid: number, min: number, max: number) {
  let seed = BigInt(tid);
  const rows: { sid: number; advance: number }[] = [];
  for (let advance = 1; advance <= max; advance++) {
    seed = (seed * 0x41c64e6dn + 0x6073n) & 0xffffffffn;
    if (advance >= min) rows.push({ sid: Number(seed >> 16n), advance });
  }
  return rows;
}

test("eleven chronological advance witnesses follow calibrated SID timing without narrowing the window", () => {
  for (const tid of [0, 30134, 55978]) {
    const { state } = fixture();
    state.tid = String(tid);
    state.intro.calibration = 7;
    const before = JSON.stringify(state),
      window = estimatedSidWindow(state.intro);
    const target = 1252,
      rows = oracleRows(tid, window.minAdvance, window.maxAdvance);
    const expected = rows.filter((r) => Math.abs(r.advance - target) <= 5);
    const result = closestGuideSids(state);
    assert.equal(result.target, target);
    assert.deepEqual(result.closest, expected);
    assert.equal(result.fullCount, new Set(rows.map((r) => r.sid)).size);
    assert.deepEqual(
      new Set(result.sidValues),
      new Set(rows.map((r) => r.sid)),
    );
    assert.equal(JSON.stringify(state), before);
  }
  const { state } = fixture();
  state.intro.uncertainty = 2;
  assert.equal(closestGuideSids(state).closest.length, 5);
  state.intro.uncertainty = 0;
  assert.equal(closestGuideSids(state).closest.length, 1);
  state.intro = { ...state.intro, second: 4, offset: -238, uncertainty: 60 };
  assert.deepEqual(
    closestGuideSids(state).closest.map((r) => r.advance),
    [1, 2, 3, 4, 5, 6],
  );
  // Repeated SIDs retain both generating-advance witnesses.
  state.intro = { ...state.intro, second: 20, offset: 50 };
  for (let tid = 0; tid < 5000; tid++) {
    const rows = oracleRows(tid, 1240, 1250);
    if (new Set(rows.map((r) => r.sid)).size === rows.length) continue;
    state.tid = String(tid);
    assert.deepEqual(closestGuideSids(state).closest, rows);
    return;
  }
  assert.fail("duplicate-SID fixture not found");
});

// Compare actual binary pixel outcomes instead of the preview's nibble masks.
// Physical block permutation is applied explicitly, including IV plaintext.
const pixelCache = new WeakMap<KnownFacts, Map<string, [number, number][]>>();
function pattern(facts: KnownFacts, spread: RngSpread, sid: number) {
  const h = {
    ...makeHypothesis(spread.pid, Number(facts.tid), sid),
    rng: { ivs: spread.ivs, abilitySlot: spread.abilitySlot },
  };
  let result = Array.from({ length: 4 }, (_, n) =>
    ((sid >>> (n * 4)) & 15) === 0 ? "T" : "B",
  ).join("");
  const key = `${spread.pid}/${spread.ivs}/${spread.abilitySlot}`;
  const cache = pixelCache.get(facts) ?? new Map<string, [number, number][]>();
  pixelCache.set(facts, cache);
  let pixels = cache.get(key);
  if (!pixels) {
    pixels = [];
    starterPlaintext(facts, h).forEach((mask, logical) => {
      const physical =
        SUBSTRUCT_POSITIONS[spread.pid % 24][Math.floor(logical / 24)] * 24 +
        (logical % 24);
      if (physical % 8 >= 4 && mask && !(mask & (mask - 1)))
        pixels!.push([physical, Math.log2(mask)]);
    });
    cache.set(key, pixels);
  }
  pixels.forEach(([physical, plain]) => {
    const encrypted = plain ^ ((h.key >>> ((physical % 8) * 4)) & 15);
    result += encrypted === 0 ? "T" : "B";
  });
  return result;
}
function uniqueCases(
  facts: KnownFacts[],
  spread: RngSpread,
  sids: number[],
  sample: number[],
) {
  const signatures = sids.map((sid) =>
    facts.map((f) => pattern(f, spread, sid)).join("/"),
  );
  return sample.map((sid) => {
    const signature = signatures[sids.indexOf(sid)];
    return signatures.filter((s) => s === signature).length === 1;
  });
}
test("drawing estimates match full-window binary pixels, including outside-sample rivals and all 24 permutations", () => {
  const { state, spread, route } = fixture();
  const scope = closestGuideSids(state),
    sample = scope.closest.map((r) => r.sid);
  let outsideSampleMatters = false;
  for (let order = 0; order < 24; order++) {
    const s = { ...spread, pid: spread.pid - (spread.pid % 24) + order };
    const out = assessStarterOutlook(state, s, route);
    const expected = uniqueCases([route.facts], s, scope.sidValues, sample);
    assert.deepEqual(
      out.cases.map((c) => c.paintingOnly),
      expected,
    );
    const optimistic = uniqueCases([route.facts], s, sample, sample);
    outsideSampleMatters ||= optimistic.some((v, n) => v && !expected[n]);
  }
  assert.equal(
    outsideSampleMatters,
    true,
    "must reject cases that only separate the displayed SIDs",
  );
});

// Independently recover available tests using physical data permutation.
function availableQuestions(facts: KnownFacts, spread: RngSpread) {
  pattern(facts, spread, 0);
  const pixels = pixelCache.get(facts)!.values().next().value!;
  return [0, 1, 2, 3].map(
    (digit) =>
      new Set([
        0,
        ...pixels
          .filter(([physical]) => physical % 8 === digit + 4)
          .map(
            ([physical, plain]) =>
              plain ^ ((spread.pid >>> ((physical % 8) * 4)) & 15),
          ),
      ]),
  );
}

test("rehearsal filters physical pixels and never chooses using the hidden SID", () => {
  const { state, spread, route } = fixture();
  const original = JSON.stringify({ state, route });
  const trace: StarterOutlookAudit[] = [];
  const out = assessStarterOutlook(state, spread, route, (step) =>
    trace.push(step),
  );
  const scope = closestGuideSids(state);
  const policies = new Map<string, string>();
  for (const row of out.cases) {
    const steps = trace.filter((s) => s.sid === row.sid);
    let remaining = scope.sidValues.filter(
      (sid) =>
        pattern(route.facts, spread, sid) ===
        pattern(route.facts, spread, row.sid),
    );
    const evs = route.facts.evs!.slice();
    let defense: number | null = null,
      speed: number | null = null;
    for (const step of steps) {
      assert.deepEqual(step.before, remaining);
      const policyKey = JSON.stringify([evs, remaining]);
      const policy = JSON.stringify([step.action, step.questions]);
      if (policies.has(policyKey))
        assert.equal(policy, policies.get(policyKey));
      policies.set(policyKey, policy);
      let facts = { ...route.facts, evs: evs.slice() };
      const [kind, first, second] = step.action.id.split("-");
      if (kind === "item") facts.heldItem = Number(first);
      else if (kind === "moves")
        facts = {
          ...facts,
          ...swapMoveFacts(facts, Number(first), Number(second)),
        };
      else {
        const stat = Number(first),
          target = Number(second);
        assert.ok(target > evs[stat]! && target <= 255);
        evs[stat] = target;
        assert.ok(evs.reduce<number>((sum, n) => sum + n!, 0) <= 510);
        facts.evs = evs.slice();
        if (stat === 2) defense = target;
        else speed = target;
      }
      const available = availableQuestions(facts, spread);
      assert.ok(step.questions.length > 0 && step.questions.length <= 4);
      assert.equal(
        new Set(step.questions.map((q) => JSON.stringify(q))).size,
        step.questions.length,
      );
      for (const q of step.questions) {
        assert.ok(
          available[q.digit].has(q.candidate),
          "test must exist in the action's physical pixels",
        );
        const hits = remaining.filter(
          (sid) => ((sid >>> (q.digit * 4)) & 15) === q.candidate,
        ).length;
        assert.ok(hits > 0 && hits < remaining.length);
      }
      remaining = remaining.filter((sid) =>
        step.questions.every(
          (q) =>
            (((sid >>> (q.digit * 4)) & 15) === q.candidate) ===
            (((row.sid >>> (q.digit * 4)) & 15) === q.candidate),
        ),
      );
      assert.deepEqual(step.after, remaining);
      assert.ok(
        remaining.length < step.before.length && remaining.includes(row.sid),
      );
    }
    assert.equal(row.defenseTarget, defense);
    assert.equal(row.speedTarget, speed);
    assert.equal(
      row.paintingOnly,
      steps.length === 0 && remaining.length === 1,
    );
    assert.equal(row.experiments, remaining.length === 1 ? steps.length : null);
    assert.equal(
      row.difficulty,
      remaining.length !== 1
        ? "unknown"
        : row.paintingOnly
          ? "easy"
          : (defense ?? 0) > 10 || (speed ?? 0) > 10
            ? "hard"
            : "moderate",
    );
  }
  assert.ok(trace.length > 0);
  assert.ok(
    out.cases.some((r) => r.difficulty === "moderate" && r.speedTarget === 10),
  );
  assert.ok(
    out.cases.some(
      (r) => r.difficulty === "hard" && (r.defenseTarget ?? 0) > 10,
    ),
  );
  assert.equal(JSON.stringify({ state, route }), original);
  state.confirmedSid = 64503;
  assert.deepEqual(assessStarterOutlook(state, spread, route), out);
});

test("EV estimates require known ordinary EVs and respect exhausted total/stat caps", () => {
  const { state, spread, route } = fixture();
  for (const facts of [
    { ...route.facts, evs: [null, 2, 2, 2, 0, 0] },
    { ...route.facts, evs: [250, 255, 2, 2, 1, 0] },
    { ...route.facts, evs: [0, 0, 255, 255, 0, 0] },
    { ...route.facts, pokerus: 1 },
  ]) {
    const result = assessStarterOutlook(state, spread, { ...route, facts });
    assert.ok(
      result.cases.every(
        (r) => r.defenseTarget === null && r.speedTarget === null,
      ),
    );
  }
  state.battles[0].multiplier = 2;
  assert.ok(
    assessStarterOutlook(state, spread, route).cases.every(
      (r) => r.defenseTarget === null && r.speedTarget === null,
    ),
  );
});

test("retry shifts the actual countdown exactly 20 advances, preserves calibration and the full SID scope", () => {
  for (const second of [15, 20, 20.33, 37.81])
    for (const calibration of [-9, 0, 7]) {
      const { state } = fixture();
      state.starter = {
        first: 5,
        second,
        uncertainty: 60,
        offset: 3,
        calibration,
      };
      const before = JSON.stringify(state),
        original = starterTargetFrame(state.starter);
      const shifted = shiftStarterTarget(state.starter);
      assert.equal(starterTargetFrame(shifted), original + 20);
      assert.equal(shifted.calibration, calibration);
      assert.equal(shifted.offset, 3);
      assert.equal(shifted.first, 5);
      assert.equal(shifted.uncertainty, 60);
      assert.deepEqual(estimatedStarterWindow(shifted), {
        minAdvance: original + 20 - 60,
        maxAdvance: original + 20 + 60,
      });
      const retry = newStarterAttempt({ ...state, starter: shifted });
      assert.equal(retry.tid, state.tid);
      assert.deepEqual(
        estimatedSidWindow(retry.intro),
        estimatedSidWindow(state.intro),
      );
      assert.equal(JSON.stringify(state), before);
      assert.deepEqual(retry.readings, []);
    }
});

test("preview renders colored chronological rows with a marked estimated centre and optional retry", () => {
  const outlook: StarterSidOutlook = {
    target: 1194,
    fullCount: 121,
    cases: Array.from({ length: 11 }, (_, n) => ({
      advance: 1189 + n,
      sid: 5347 + n,
      paintingOnly: n % 4 === 0,
      experiments: n % 4 === 0 ? 0 : n % 4 === 3 ? null : 3,
      defenseTarget: null,
      speedTarget: n % 4 === 2 ? 40 : null,
      difficulty: (["easy", "moderate", "hard", "unknown"] as const)[n % 4],
    })),
  };
  const html = renderToStaticMarkup(
    createElement(StarterOutlook, { outlook, onRetry: () => {} }),
  );
  assert.equal((html.match(/<tr class=/g) ?? []).length, 11);
  assert.match(html, /1189 \(-5\)/);
  assert.match(html, /1199 \(\+5\)/);
  assert.match(
    html,
    /starter-outlook-target" aria-current="true"><td>1194 \(0\)/,
  );
  assert.match(html, /<code>05347<\/code>/);
  for (const color of ["easy", "moderate", "hard", "unknown"])
    assert.match(html, new RegExp("starter-outlook-" + color));
  assert.match(html, /Drawing only/);
  assert.match(html, /3 experiments/);
  assert.match(html, /train to 40 Speed EVs/);
  assert.match(html, /All 121 SIDs remain in the full timing/);
  assert.match(html, /estimated target, not a/);
  assert.match(html, /Try another starter \(\+20 advances\)/);
  assert.match(
    html,
    /Calibration stays unchanged; search windows still overlap/,
  );
  assert.doesNotMatch(html, /Some of these nearby SIDs|Best case|Worst case/);
  const safe = {
    ...outlook,
    cases: outlook.cases.filter(
      (r) => r.difficulty === "easy" || r.difficulty === "moderate",
    ),
  };
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(StarterOutlook, { outlook: safe, onRetry: () => {} }),
    ),
    /Try another starter/,
  );
});
