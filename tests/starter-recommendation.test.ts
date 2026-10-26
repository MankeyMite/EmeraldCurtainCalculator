import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  recommendStarter,
  applyStarterRecommendation,
  catalogueStarterRoute,
  starterRecommendationKey,
  isRecommendedTimer,
  canSearchOptimalPid,
  savedStarterRecommendation,
  type StarterPidRecommendation,
} from "../src/core/starterRecommendation";
import {
  newStarterGuide,
  validateStarterGuide,
  checkStarterRoute,
  battleEvs,
  type StarterGuideState,
} from "../src/core/starterGuide";
import { starterTargetFrame } from "../src/core/starterTiming";
import type { StarterCatalogue } from "../src/core/starterCatalogue";
import type { RngSpread } from "../src/core/rng";
import {
  StarterPidRecommendation as RecommendationView,
  OptimalPidSearch,
} from "../src/components/StarterPidRecommendation";

const catalogue = JSON.parse(
  fs.readFileSync("src/data/starter-catalogue.json", "utf8"),
) as StarterCatalogue;
let example: StarterPidRecommendation;

test("TID-only recommendation returns eleven consecutive PIDs and applies the calibrated timer once without altering SID scope", () => {
  const state = newStarterGuide();
  state.step = 1;
  state.tid = "50998";
  state.starter = { ...state.starter, first: 5, offset: 3, calibration: 7 };
  const before = JSON.stringify(state);
  const progress: [number, number][] = [];
  example = recommendStarter(catalogue, state, (done, total) =>
    progress.push([done, total]),
  );
  assert.deepEqual(progress[0], [1, 2001]);
  assert.deepEqual(progress.at(-1), [2001, 2001]);
  assert.ok(
    progress.every(
      ([done, total], n) =>
        total === 2001 && (n === 0 || done > progress[n - 1][0]),
    ),
  );
  assert.equal(JSON.stringify(state), before);
  assert.equal(example.rows.length, 11);
  assert.ok([277, 280, 283].includes(example.species));
  assert.ok(example.advance >= 1060 && example.advance <= 2940);
  assert.ok(example.rows[5].drawingOnly <= example.rows[5].withoutTraining);
  assert.deepEqual(
    example.rows.map((r) => r.advance),
    Array.from({ length: 11 }, (_, n) => example.advance - 5 + n),
  );
  assert.equal(example.fullSidCount, 121);
  assert.equal(example.priorityCount, 19);
  assert.equal(example.timing.first, 5);
  assert.equal(example.timing.offset + example.timing.calibration, 10);
  assert.equal(example.timing.uncertainty, 60);
  assert.equal(starterTargetFrame(example.timing), example.advance);
  assert.ok(example.timing.second >= 15);
  for (const row of example.rows) {
    assert.ok(
      row.withoutTraining >= row.drawingOnly && row.withoutTraining <= 19,
    );
    assert.equal(
      catalogue.spreads.find((s) => s.advance === row.advance)!.pid,
      row.pid,
    );
  }
  const applied = applyStarterRecommendation(state, example);
  assert.deepEqual(applied.intro, state.intro);
  assert.ok(isRecommendedTimer(applied, example));
  const restored = validateStarterGuide(JSON.parse(JSON.stringify(applied)));
  assert.deepEqual(
    restored.starterRecommendation,
    applied.starterRecommendation,
  );
  assert.deepEqual(savedStarterRecommendation(restored), example);
  const fromIntro = applyStarterRecommendation(
    { ...state, step: 0 },
    example,
    true,
  );
  assert.ok(isRecommendedTimer(fromIntro, example));
  assert.equal(fromIntro.step, 0);
  const manualIntro = {
    ...fromIntro,
    starter: { ...fromIntro.starter, second: 20 },
  };
  assert.ok(
    isRecommendedTimer(
      applyStarterRecommendation(manualIntro, example, true),
      example,
    ),
    "an explicit re-search applies its result",
  );
  const broken = structuredClone(restored);
  broken.starterRecommendation!.rows!.pop();
  assert.throws(
    () => validateStarterGuide(broken),
    /Invalid saved starter PID preview/,
  );
  const edited = {
    ...restored,
    starter: { ...restored.starter, second: restored.starter.second + 1 },
  };
  assert.equal(
    applyStarterRecommendation(edited, example),
    edited,
    "reload does not undo a later manual countdown",
  );
  const inUse = { ...state, identifiedStarter: { pid: 123 } as RngSpread };
  assert.equal(applyStarterRecommendation(inUse, example), inUse);
  const stale = { ...state, tid: "2959" };
  assert.equal(applyStarterRecommendation(stale, example), stale);
  const html = renderToStaticMarkup(
    createElement(RecommendationView, { value: example, applied: true }),
  );
  assert.equal(
    (html.match(/<tbody>.*?<\/tbody>/s)![0].match(/<tr/g) ?? []).length,
    11,
  );
  assert.match(html, /The timer is set for this target/);
  assert.match(html, /Without EV training/);
});

test("optimal PID search requires a valid entered TID and shows real progress including completion", () => {
  const expandedTarget = newStarterGuide();
  expandedTarget.starterRecommendation = {
    key: "range-check",
    advance: 3000,
    species: 283,
  };
  assert.equal(
    validateStarterGuide(expandedTarget).starterRecommendation!.advance,
    3000,
  );
  assert.throws(
    () =>
      validateStarterGuide({
        ...expandedTarget,
        starterRecommendation: {
          ...expandedTarget.starterRecommendation,
          advance: 3001,
        },
      }),
    /Invalid starter recommendation/,
  );
  for (const tid of ["", "-1", "65536", "123456", "text", " 1"])
    assert.equal(canSearchOptimalPid(tid), false);
  for (const tid of ["0", "00000", "02959", "29689", "65535"])
    assert.equal(canSearchOptimalPid(tid), true);
  const render = (tid: string, busy = false, progress = 0, complete = false) =>
    renderToStaticMarkup(
      createElement(OptimalPidSearch, {
        tid,
        busy,
        progress,
        complete,
        onSearch: () => {},
      }),
    );
  assert.match(render(""), /<button disabled="">Search optimal PID/);
  assert.match(render("65536"), /<button disabled="">Search optimal PID/);
  assert.match(render("29689"), /<button>Search optimal PID/);
  assert.doesNotMatch(render("29689"), /<progress/);
  const running = render("29689", true, 47);
  assert.match(running, /<button disabled="">Search optimal PID/);
  assert.match(running, /<progress[^>]*max="100" value="47"/);
  assert.match(running, /Searching · 47%/);
  assert.match(render("29689", false, 100, true), /Search complete · 100%/);
  const empty = newStarterGuide();
  assert.throws(() => recommendStarter(catalogue, empty), /Enter a public TID/);
});

test("the landed PID uses its scored catalogue preparation, and completing the checklist logs exact EVs and moves", () => {
  const state = newStarterGuide();
  state.tid = "29689";
  state.step = 1;
  state.starterRecommendation = {
    key: starterRecommendationKey(state),
    advance: 1195,
    species: state.species,
  };
  const row = catalogue.spreads.find((s) => s.advance === 1888)!;
  const hit: RngSpread = {
    ...row,
    lastAdvance: row.advance,
    methods: ["Method1"],
    slot: 0,
    level: 5,
  };
  const plan = catalogueStarterRoute(catalogue, state, hit)!;
  assert.ok(plan);
  assert.equal(plan.facts.pid, hit.pid);
  assert.deepEqual(plan.facts.ivs, hit.ivs);
  assert.equal(plan.facts.sid, undefined);
  assert.equal(plan.facts.evs![2], 2);
  assert.equal(plan.facts.evs![3], 1);
  let current: StarterGuideState = { ...state, route: plan };
  for (let n = 0; n < plan.instructions.length; n++)
    current = checkStarterRoute(current, n, true);
  assert.deepEqual(battleEvs(current.battles), plan.facts.evs);
  assert.deepEqual(current.moves, plan.facts.moves);
  assert.equal(
    current.battles.filter((b) => b.id === "journey-lyle").length,
    1,
  );
  assert.equal(
    current.battles.filter((b) => b.id === "journey-james").length,
    1,
  );
  const extra = {
    ...state,
    battles: [
      ...state.battles,
      { id: "unexpected", species: 288, count: 1, multiplier: 1 as const },
    ],
  };
  assert.equal(
    catalogueStarterRoute(catalogue, extra, hit),
    null,
    "unexpected battles use the actual-state planner",
  );
  assert.equal(
    catalogueStarterRoute(catalogue, { ...state, routeDone: true }, hit),
    null,
  );
});
