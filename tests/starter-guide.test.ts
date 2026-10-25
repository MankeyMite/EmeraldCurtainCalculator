import test from "node:test";
import assert from "node:assert/strict";
import {
  calibratedFrames,
  countdownCues,
  defaultIntroTiming,
  EMERALD_FPS,
  estimatedSidWindow,
  estimatedStarterWindow,
  defaultStarterTiming,
  starterTargetFrame,
  targetCountdown,
} from "../src/core/starterTiming";
import {
  newStarterGuide,
  newStarterAttempt,
  currentStarterReadings,
  validateStarterGuide,
  battleEvs,
  checkStarterRoute,
  searchStarter,
  searchShinyStarters,
  matchStarterAttempt,
  nearbyStarters,
  creationMoves,
  starterSettings,
  guideSidCandidates,
  readingSnapshots,
} from "../src/core/starterGuide";
import {
  usefulStarterPixels,
  planStarterRoute,
  routeCheckpoint,
  starterPlaintext,
  planStarterItems,
} from "../src/core/starterRoute";
import { STARTER_ITEMS, STARTER_ITEM_IDS } from "../src/core/starterItems";
import { makeHypothesis, solveSids } from "../src/core/sid";
import { emptyObservations } from "../src/core/constraints";
import { calculateStat } from "../src/core/stats";
import { speciesTraits, genderForPid } from "../src/core/traits";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
  splitFacts,
} from "../src/core/investigation";
import { readAutosave, AUTOSAVE_KEY } from "../src/core/autosave";
import { PROFILE } from "../src/core/memory";
import { computeDeduction } from "../src/core/deduction";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StarterWizard } from "../src/components/StarterWizard";
import { SummaryStatInputs } from "../src/components/SummaryStatInputs";
import { StarterCurtainStep } from "../src/components/StarterCurtainStep";
import {
  curtainLocation,
  SidPixelQuestion,
} from "../src/components/SidPixelQuestion";
import {
  stripLayout,
  recordStripLayout,
  hitForNibble,
} from "../src/components/WorkbenchData";
import {
  StarterSpreadTable,
  StarterSearchResults,
  StarterTargetWindow,
  StarterTravelChecklist,
  TimingOptions,
} from "../src/components/StarterGuideParts";
import { summaryFromDraft } from "../src/core/stats";

function oracle(advance: number) {
  let s = 0n;
  const next = () => {
    s = (s * 1103515245n + 24691n) & 0xffffffffn;
    return Number(s >> 16n);
  };
  for (let n = 0; n < advance; n++) next();
  const lo = next(),
    hi = next(),
    a = next(),
    b = next();
  return {
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
function fixture() {
  const s = newStarterGuide(),
    expected = oracle(900),
    traits = speciesTraits(s.species)!;
  s.starter.second = targetCountdown(900, s.starter.calibration).second;
  s.starter.uncertainty = 100;
  s.tid = "9918";
  s.nature = String(expected.pid % 25);
  s.gender = genderForPid(s.species, expected.pid)!;
  s.ability = String(traits.abilities[0].id);
  s.protectedSave = true;
  s.readings = [
    {
      id: "first",
      evs: [0, 0, 0, 1, 0, 0],
      summary: {
        level: 5,
        stats: expected.ivs.map((iv, i) =>
          calculateStat(
            traits.summaryBaseStats[i],
            iv,
            i === 3 ? 1 : 0,
            5,
            i,
            expected.pid % 25,
          ),
        ),
      },
    },
  ];
  return { s, expected };
}

test("both countdowns have exactly four cues and the fourth is at zero; calibration sign makes late hits earlier", () => {
  assert.deepEqual(
    countdownCues(15, 15).map((c) => [c.stage, c.at, c.zero]),
    [
      [0, 12, false],
      [0, 13, false],
      [0, 14, false],
      [0, 15, true],
      [1, 27, false],
      [1, 28, false],
      [1, 29, false],
      [1, 30, true],
    ],
  );
  const before = targetCountdown(1800, 0),
    calibration = calibratedFrames(0, 1800, 1808),
    after = targetCountdown(1800, calibration);
  assert.equal(calibration, 8);
  assert.ok(after.second < before.second);
  assert.ok(Math.abs(before.second - after.second - 8 / EMERALD_FPS) < 1e-9);
  assert.equal(calibratedFrames(20, 1800, 1797), 17);
  assert.ok(
    Math.abs(targetCountdown(1800, 8, 15, 12).second - 1780 / EMERALD_FPS) <
      1e-9,
  );
  assert.throws(() => countdownCues(2, 15));
  assert.throws(() => targetCountdown(50, 0));
  const window = estimatedSidWindow(defaultIntroTiming());
  assert.deepEqual(window, { minAdvance: 1185, maxAdvance: 1305 });
});

test("in-game soft-reset timing has no BIOS offset and upgrades old defaults once", () => {
  const timing = { ...defaultStarterTiming(), second: 20 };
  assert.equal(timing.calibration, 3);
  assert.equal(starterTargetFrame(timing), 1198);
  assert.deepEqual(estimatedStarterWindow(timing), {
    minAdvance: 1138,
    maxAdvance: 1258,
  });
  assert.equal(starterTargetFrame({ ...timing, second: 15 }), 899);
  assert.equal(starterTargetFrame({ ...timing, second: 25 }), 1496);
  for (const advance of [896, 1195, 1493, 5000]) {
    const countdown = targetCountdown(advance, timing.calibration, 15, 12);
    assert.equal(
      starterTargetFrame({ ...timing, ...countdown, offset: 12 }),
      advance,
    );
  }
  const calibration = calibratedFrames(timing.calibration, 1198, 1202);
  assert.equal(calibration, 7);
  assert.equal(starterTargetFrame({ ...timing, calibration }), 1202);
  assert.ok(
    targetCountdown(1195, calibration).second < targetCountdown(1195, 0).second,
  );

  for (const version of [undefined, 1, 2] as const) {
    const legacy = newStarterGuide();
    legacy.starterTimingVersion = version;
    legacy.starter = { ...timing, calibration: -254 };
    const restored = validateStarterGuide(JSON.parse(JSON.stringify(legacy)));
    assert.equal(starterTargetFrame(restored.starter), 1198);
    assert.deepEqual(
      restored.intro,
      legacy.intro,
      "SID timing must not change",
    );
    assert.deepEqual(validateStarterGuide(restored), restored);
    for (const correction of [-247, -195, 0, 50]) {
      legacy.starter.calibration = correction;
      assert.equal(
        validateStarterGuide(legacy).starter.calibration,
        correction === 0 ? 3 : correction,
      );
    }
    restored.starter.calibration = -254;
    assert.equal(
      validateStarterGuide(restored).starter.calibration,
      -254,
      "explicit version-3 calibration must survive reopening",
    );
  }
  const cancellingLegacy = newStarterGuide();
  cancellingLegacy.starterTimingVersion = 4;
  cancellingLegacy.starter.offset = -9;
  cancellingLegacy.starter.calibration = 9;
  assert.equal(validateStarterGuide(cancellingLegacy).starter.calibration, 9);
  const { s } = fixture();
  const spread = searchStarter(s)[0];
  s.identifiedStarter = spread;
  s.starterTimingVersion = 2;
  s.starter = { ...timing, calibration: -254 };
  const restored = validateStarterGuide(s);
  assert.equal(restored.starter.calibration, 3);
  assert.deepEqual(
    searchStarter(restored).map((e) => e.pid),
    [spread.pid],
    "updating timer defaults must preserve the already identified starter",
  );
  assert.deepEqual(starterSettings(restored), {
    ...starterSettings(restored),
    minAdvance: spread.advance,
    maxAdvance: spread.advance,
  });
});

test("reported starter delay advances the cue once and preserves measured calibration on reload", () => {
  const s = newStarterGuide();
  const advance = 1800;
  const uncalibrated = targetCountdown(advance, 0);
  const estimated = targetCountdown(advance, s.starter.calibration);
  assert.ok(
    Math.abs(uncalibrated.second - estimated.second - 3 / EMERALD_FPS) < 1e-9,
  );
  assert.equal(starterTargetFrame({ ...s.starter, ...estimated }), advance);
  const corrected = calibratedFrames(
    s.starter.calibration,
    advance,
    advance + 2,
  );
  assert.equal(
    corrected,
    5,
    "a measured two-advance miss adds two, not another three",
  );
  assert.ok(
    Math.abs(
      estimated.second -
        targetCountdown(advance, corrected).second -
        2 / EMERALD_FPS,
    ) < 1e-9,
  );
  for (const version of [3, 4, 5] as const) {
    for (const calibration of [0, 3, 9, -7]) {
      const saved = {
        ...s,
        starterTimingVersion: version,
        starter: { ...s.starter, calibration },
      };
      const restored = validateStarterGuide(saved);
      assert.equal(
        restored.starter.calibration,
        version < 5 && calibration === 0 ? 3 : calibration,
      );
      assert.deepEqual(validateStarterGuide(restored), restored);
      assert.deepEqual(restored.intro, s.intro);
    }
  }
});

test("starter calibration alone preserves legacy confirmation delays in both target and countdown", () => {
  for (const [offset, calibration] of [
    [50, 20],
    [-30, 10],
    [50, -70],
  ]) {
    const legacy = {
      ...defaultStarterTiming(),
      second: 20,
      offset,
      calibration,
    };
    const combined = {
      ...legacy,
      offset: 0,
      calibration: offset + calibration,
    };
    assert.equal(starterTargetFrame(legacy), starterTargetFrame(combined));
    assert.deepEqual(
      estimatedStarterWindow(legacy),
      estimatedStarterWindow(combined),
    );
    assert.equal(
      targetCountdown(1800, calibration, 15, offset).second,
      targetCountdown(1800, combined.calibration, 15).second,
    );
    const html = renderToStaticMarkup(
      createElement(TimingOptions, { value: legacy, onChange: () => {} }),
    );
    assert.doesNotMatch(html, /Estimated confirmation delay/);
    assert.match(
      html,
      new RegExp(
        'Calibration adjustment \\(advances\\).*?value="' +
          combined.calibration +
          '"',
      ),
    );
  }
  const intro = renderToStaticMarkup(
    createElement(TimingOptions, {
      value: defaultIntroTiming(),
      onChange: () => {},
      intro: true,
    }),
  );
  assert.match(intro, /Estimated final-dialogue delay/);
});

test("default starter search retains the actual PID/IVs with one-second timing errors for all starters", () => {
  for (const second of [15, 20, 25]) {
    // Rounded independent reference centers for in-game soft resets.
    const center = new Map([
      [15, 899],
      [20, 1198],
      [25, 1496],
    ]).get(second)!;
    for (const species of [277, 280, 283]) {
      for (const advance of [center - 60, center + 60]) {
        const s = newStarterGuide(),
          expected = oracle(advance),
          traits = speciesTraits(species)!,
          evs = [0, 0, 0, 1, 0, 0];
        s.species = species;
        s.starter.second = second;
        s.nature = String(expected.pid % 25);
        s.gender = genderForPid(species, expected.pid)!;
        s.readings = [
          {
            id: "one-second-error",
            evs,
            summary: {
              level: 5,
              stats: expected.ivs.map((iv, i) =>
                calculateStat(
                  traits.summaryBaseStats[i],
                  iv,
                  evs[i],
                  5,
                  i,
                  expected.pid % 25,
                ),
              ),
            },
          },
        ];
        const matches = searchStarter(s);
        assert.ok(
          matches.some(
            (e) =>
              e.advance === advance &&
              e.pid === expected.pid &&
              e.ivs.join() === expected.ivs.join(),
          ),
          `${species}, ${second}s, advance ${advance} must survive filtering`,
        );
        assert.ok(matches.every((e) => Math.abs(e.advance - center) <= 100));
      }
    }
  }
});

test("one-second starter default migrates old defaults and asks beginners to retry ambiguous PIDs", () => {
  const s = newStarterGuide();
  assert.equal(s.starter.uncertainty, 60);
  s.starterTimingVersion = 1;
  s.starter.uncertainty = 100;
  const migrated = validateStarterGuide(s);
  assert.equal(migrated.starter.uncertainty, 60);
  assert.equal(migrated.starterTimingVersion, 5);
  s.starter.uncertainty = 40;
  assert.equal(validateStarterGuide(s).starter.uncertainty, 40);
  migrated.starter.uncertainty = 100;
  assert.equal(validateStarterGuide(migrated).starter.uncertainty, 100);
  const { s: sample } = fixture();
  const spread = searchStarter(sample)[0];
  const html = renderToStaticMarkup(
    createElement(StarterSearchResults, {
      species: sample.species,
      spreads: [spread, { ...spread, pid: spread.pid ^ 1 }],
      retry: true,
    }),
  );
  assert.match(
    html,
    /Choose Back, reset with the timer and try again until exactly one PID matches/,
  );
  assert.doesNotMatch(html, /After each level-up/);
});

test("saved ten-advance radius upgrades once and the displayed bounds match the actual search", () => {
  for (const version of [undefined, 1, 2, 3] as const) {
    const saved = newStarterGuide();
    saved.starterTimingVersion = version;
    saved.starter = { ...defaultStarterTiming(), second: 20, uncertainty: 10 };
    const restored = validateStarterGuide(saved);
    assert.equal(restored.starter.uncertainty, 60);
    const range = estimatedStarterWindow(restored.starter);
    assert.deepEqual(range, { minAdvance: 1138, maxAdvance: 1258 });
    assert.equal(starterSettings(restored).minAdvance, range.minAdvance);
    assert.equal(starterSettings(restored).maxAdvance, range.maxAdvance);
    const html = renderToStaticMarkup(
      createElement(StarterTargetWindow, { timing: restored.starter }),
    );
    assert.match(html, /1138\u20131258/);
    assert.match(html, /\u00b160 advances/);
    assert.deepEqual(validateStarterGuide(restored), restored);
    restored.starter.uncertainty = 10;
    restored.starter.calibration = -254;
    const manual = validateStarterGuide(restored);
    assert.equal(manual.starter.uncertainty, 10);
    assert.equal(manual.starter.calibration, -254);
  }
});

test("an identified starter retains its PID and IVs after EV-aware level-up checks and clears on reset", () => {
  const { s } = fixture();
  const spread = searchStarter(s)[0];
  s.identifiedStarter = spread;
  s.battles.push({ id: "training", species: 288, count: 2, multiplier: 1 });
  const evs = battleEvs(s.battles),
    traits = speciesTraits(s.species)!;
  s.readings = [
    {
      id: "level-up",
      evs,
      summary: {
        level: 6,
        stats: spread.ivs.map((iv, i) =>
          calculateStat(
            traits.summaryBaseStats[i],
            iv,
            evs[i],
            6,
            i,
            spread.pid % 25,
          ),
        ),
      },
    },
  ];
  assert.deepEqual(
    searchStarter(s).map((e) => e.pid),
    [spread.pid],
  );
  assert.deepEqual(routeCheckpoint(s).ivs, spread.ivs);
  assert.equal(routeCheckpoint(s).pid, spread.pid);
  assert.deepEqual(
    validateStarterGuide(JSON.parse(JSON.stringify(s))).identifiedStarter,
    spread,
  );
  assert.equal(newStarterAttempt(s).identifiedStarter, null);
  s.readings[0].summary.stats[0]! += 20;
  assert.deepEqual(
    searchStarter(s),
    [],
    "contradictory stats cannot silently switch to another PID",
  );
});

test("EV log includes Birch's Zigzagoon, full per-opponent yields, multipliers, per-stat and total caps", () => {
  const s = newStarterGuide();
  assert.deepEqual(battleEvs(s.battles), [0, 0, 0, 1, 0, 0]);
  for (const species of [288, 304, 309])
    assert.deepEqual(
      battleEvs([{ id: "speed", species, count: 1, multiplier: 1 }]),
      [0, 0, 0, 1, 0, 0],
    );
  for (const species of [291, 293])
    assert.deepEqual(
      battleEvs([{ id: "defense", species, count: 1, multiplier: 1 }]),
      [0, 0, 2, 0, 0, 0],
    );
  assert.deepEqual(
    battleEvs([
      ...s.battles,
      { id: "silcoon", species: 291, count: 3, multiplier: 1 },
    ]),
    [0, 0, 6, 1, 0, 0],
  );
  assert.deepEqual(
    battleEvs([{ id: "pkrs", species: 288, count: 3, multiplier: 4 }]),
    [0, 0, 0, 12, 0, 0],
  );
  const capped = battleEvs([
    { id: "def", species: 291, count: 200, multiplier: 4 },
    { id: "spe", species: 288, count: 300, multiplier: 2 },
    { id: "atk", species: 286, count: 20, multiplier: 1 },
  ]);
  assert.deepEqual(capped, [0, 0, 255, 255, 0, 0]);
  assert.throws(() =>
    battleEvs([{ id: "bad", species: 65535, count: 1, multiplier: 1 }]),
  );
});

test("starter search uses the latest summary and retains whole correlated Method 1 spreads", () => {
  const { s, expected } = fixture();
  const first = searchStarter(s);
  assert.ok(
    first.some(
      (e) => e.pid === expected.pid && e.ivs.join() === expected.ivs.join(),
    ),
  );
  const evs = battleEvs([
      ...s.battles,
      { id: "extra", species: 288, count: 5, multiplier: 1 },
    ]),
    traits = speciesTraits(s.species)!;
  s.readings.push({
    id: "later",
    evs,
    summary: {
      level: 14,
      stats: expected.ivs.map((iv, i) =>
        calculateStat(
          traits.summaryBaseStats[i],
          iv,
          evs[i],
          14,
          i,
          expected.pid % 25,
        ),
      ),
    },
  });
  const later = searchStarter(s);
  assert.ok(later.length <= first.length);
  assert.ok(later.some((e) => e.pid === expected.pid));
  for (const e of later)
    assert.ok(
      first.some((old) => old.pid === e.pid && old.ivs.join() === e.ivs.join()),
    );
  const original = s.readings[0].evs.slice();
  s.battles.push({ id: "new", species: 291, count: 2, multiplier: 1 });
  assert.deepEqual(
    s.readings[0].evs,
    original,
    "past readings retain their actual EV checkpoint",
  );
  assert.equal(starterSettings(s).methods.join(), "Method1");
  assert.deepEqual(creationMoves(277), [1, 43, 0, 0]);
});

test("reported Hardy male Torchic matches the shown timing and repairs repeated same-checkpoint corrections", () => {
  const s = newStarterGuide();
  s.species = 280;
  s.nature = "0";
  s.gender = "male";
  s.ability = "66";
  s.starter = {
    first: 15,
    second: 16,
    uncertainty: 232,
    offset: 50,
    calibration: 50,
  };
  const current = {
    id: "screenshot",
    evs: [0, 0, 0, 1, 0, 0],
    summary: { level: 5, stats: [20, 11, 9, 10, 13, 10] },
  };
  s.readings = [current];
  const matches = searchStarter(s);
  assert.equal(matches.length, 1);
  const target = matches.find((e) => e.pid === 0xa4cd354e)!;
  assert.equal(target.advance, 1109);
  assert.deepEqual(target.ivs, [18, 8, 8, 13, 21, 19]);
  assert.deepEqual(oracle(1109), { pid: target.pid, ivs: target.ivs });
  const resultHtml = renderToStaticMarkup(
    createElement(StarterSpreadTable, {
      spreads: [target],
      species: s.species,
      compact: true,
    }),
  );
  assert.match(resultHtml, /Matching starter advances/);
  assert.match(resultHtml, /<th>Advance<\/th>/);
  assert.match(resultHtml, /<td>1109<\/td>/);
  assert.match(resultHtml, /A4CD354E/);
  assert.match(resultHtml, /IVs: HP \/ Atk \/ Def \/ SpA \/ SpD \/ Spe/);
  assert.match(resultHtml, /18 \/ 8 \/ 8 \/ 21 \/ 19 \/ 13/);

  const older = Array.from({ length: 4 }, (_, i) => ({
    ...structuredClone(current),
    id: `older-${i}`,
    summary: { level: 5, stats: [20, 11, 8, 10, 13, 10] },
  }));
  s.readings = [...older, current];
  const restored = validateStarterGuide(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.readings, [current]);
  assert.deepEqual(
    searchStarter(s),
    matches,
    "legacy duplicate checks must not poison the shared search",
  );
  assert.deepEqual(searchStarter(restored), matches);
  assert.deepEqual(currentStarterReadings(s.readings), [current]);

  const later = {
    ...structuredClone(current),
    id: "level-up",
    summary: { level: 6, stats: [null, null, null, null, null, null] },
  };
  const trained = {
    ...structuredClone(current),
    id: "trained",
    evs: [0, 0, 0, 4, 0, 0],
    summary: { level: 5, stats: [20, 11, 9, 11, 13, 10] },
  };
  assert.deepEqual(currentStarterReadings([current, later, trained]), [
    trained,
  ]);
  assert.deepEqual(currentStarterReadings([later, trained, current]), [
    current,
  ]);
  assert.equal(readingSnapshots([current, later, trained])[0].id, trained.id);
  assert.deepEqual(
    validateStarterGuide({ ...s, readings: [current, later] }).readings,
    [later],
  );
});

test("starter search stays within 100 advances of the clock target and shows the exact range", () => {
  const s = newStarterGuide();
  s.species = 280;
  s.nature = "6";
  s.gender = "male";
  s.ability = "66";
  s.starter = {
    ...defaultStarterTiming(),
    second: 900 / EMERALD_FPS,
    calibration: 0,
    uncertainty: 100,
  };
  s.readings = [
    {
      id: "docile",
      evs: [0, 0, 0, 1, 0, 0],
      summary: { level: 5, stats: [20, 11, 9, 9, 12, 10] },
    },
  ];
  assert.equal(starterTargetFrame(s.starter), 900);
  assert.deepEqual(estimatedStarterWindow(s.starter), {
    minAdvance: 800,
    maxAdvance: 1000,
  });
  const matches = searchStarter(s);
  assert.ok(matches.some((e) => e.advance === 980 && e.pid === 0xa6755db4));
  assert.ok(!matches.some((e) => e.advance === 396 || e.pid === 0x963481a0));
  assert.ok(matches.every((e) => e.advance >= 800 && e.advance <= 1000));
  const html = renderToStaticMarkup(
    createElement(StarterTargetWindow, { timing: s.starter }),
  );
  assert.match(html, /Estimated target advance: <strong>900/);
  assert.match(html, /800\u20131000/);
  assert.match(html, /\u00b1100 advances/);
  const legacy = { ...s.starter, uncertainty: 232 };
  assert.deepEqual(estimatedStarterWindow(legacy), {
    minAdvance: 800,
    maxAdvance: 1000,
  });
  assert.equal(
    validateStarterGuide({ ...s, starter: legacy }).starter.uncertainty,
    100,
  );
  s.starter = { ...s.starter, offset: -30, calibration: 10, uncertainty: 40 };
  assert.equal(starterTargetFrame(s.starter), 880);
  assert.deepEqual(estimatedStarterWindow(s.starter), {
    minAdvance: 840,
    maxAdvance: 920,
  });
  assert.deepEqual(estimatedStarterWindow({ ...s.starter, uncertainty: 0 }), {
    minAdvance: 880,
    maxAdvance: 880,
  });
});

test("calibration recenters the known Torchic without widening; multiple in-window spreads prompt EV-aware level-up checks", () => {
  const s = newStarterGuide();
  s.species = 280;
  s.nature = "23";
  s.gender = "male";
  s.ability = "66";
  s.readings = [
    {
      id: "careful",
      evs: [0, 0, 0, 1, 0, 0],
      summary: { level: 5, stats: [20, 11, 9, 10, 10, 11] },
    },
  ];
  const actual = { pid: 0x735ab2e1, ivs: [22, 7, 12, 24, 16, 12] };
  assert.deepEqual(oracle(705), actual);
  let seed = 0n;
  for (let n = 0; n < 705; n++)
    seed = (seed * 1103515245n + 24691n) & 0xffffffffn;
  assert.equal(Number(seed), 0x859a2033);
  s.starter = {
    ...defaultStarterTiming(),
    second: 900 / EMERALD_FPS,
    calibration: 0,
  };
  assert.deepEqual(
    searchStarter(s),
    [],
    "no fallback may silently return distant advances",
  );
  const empty = renderToStaticMarkup(
    createElement(StarterSearchResults, { spreads: [], species: s.species }),
  );
  assert.match(empty, /adjust the timer calibration/);
  s.starter = { ...s.starter, calibration: -195 };
  const calibrated = searchStarter(s);
  assert.equal(calibrated.length, 1);
  assert.equal(calibrated[0].advance, 705);
  assert.equal(calibrated[0].pid, actual.pid);
  assert.deepEqual(calibrated[0].ivs, actual.ivs);
  const frameHtml = renderToStaticMarkup(
    createElement(StarterSearchResults, {
      spreads: calibrated,
      species: s.species,
    }),
  );
  assert.match(frameHtml, /<td>705<\/td>/);
  assert.match(frameHtml, /735AB2E1/);
  assert.match(frameHtml, /22 \/ 7 \/ 12 \/ 16 \/ 12 \/ 24/);

  s.starter = {
    ...defaultStarterTiming(),
    second: 1837 / EMERALD_FPS,
    calibration: 0,
    uncertainty: 100,
  };
  const before = searchStarter(s);
  assert.ok(before.some((e) => e.advance === 1786));
  assert.ok(before.some((e) => e.advance === 1889));
  const html = renderToStaticMarkup(
    createElement(StarterSearchResults, {
      spreads: before,
      species: s.species,
    }),
  );
  assert.match(
    html,
    /After each level-up, log battles and enter all six stats again/,
  );
  assert.match(html, /EV recommendations use all remaining spreads/);
  s.battles.push({
    id: "later-training",
    species: 288,
    count: 3,
    multiplier: 1,
  });
  s.readings = [
    {
      id: "level-up",
      evs: battleEvs(s.battles),
      summary: {
        level: 10,
        stats: [30, 18, 14, 15, 17, 16],
      },
    },
  ];
  const later = searchStarter(s);
  assert.ok(later.length < before.length);
  assert.ok(
    later.some((e) => e.advance === 1786 && e.pid === oracle(1786).pid),
  );
  assert.ok(!later.some((e) => e.advance === 1889));
});

test("a timed reset discards the previous starter but preserves trainer, timing and protected save", () => {
  const { s } = fixture();
  s.species = 280;
  s.step = 1;
  s.starterPart = "timer";
  s.exp = "500";
  s.battles.push({ id: "training", species: 291, count: 3, multiplier: 1 });
  s.readingDraft = { level: "8", stat_0: "30" };
  s.routeDone = true;
  s.confirmedSid = 1022;
  const original = structuredClone(s),
    next = newStarterAttempt(s);
  assert.deepEqual(s, original, "reset returns a new state");
  assert.equal(next.tid, s.tid);
  assert.deepEqual(next.intro, s.intro);
  assert.deepEqual(next.starter, s.starter);
  assert.equal(next.protectedSave, true);
  assert.equal(next.species, 280);
  assert.deepEqual(next.moves, [10, 45, 0, 0]);
  assert.deepEqual(next.readings, []);
  assert.deepEqual(next.readingDraft, { level: "5" });
  assert.deepEqual(battleEvs(next.battles), [0, 0, 0, 1, 0, 0]);
  assert.equal(next.nature, "");
  assert.equal(next.exp, "");
  assert.equal(next.routeDone, false);
  assert.equal(next.confirmedSid, null);
  assert.deepEqual(validateStarterGuide(next), next);
});

test("summary entry follows Emerald's displayed columns while preserving stored stat indices", () => {
  const draft = {
    level: "5",
    stat_0: "20",
    stat_1: "11",
    stat_2: "9",
    stat_3: "10",
    stat_4: "13",
    stat_5: "10",
  };
  const html = renderToStaticMarkup(
    createElement(SummaryStatInputs, { draft, onChange: () => {} }),
  );
  const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, [
    "Current level",
    "Summary maximum HP",
    "Summary Sp. Attack",
    "Summary Attack",
    "Summary Sp. Defense",
    "Summary Defense",
    "Summary Speed",
  ]);
  assert.match(html, /class="summary-level"/);
  const values = [...html.matchAll(/value="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(values, [5, 20, 13, 11, 10, 9, 10]);
  assert.deepEqual(summaryFromDraft(draft), {
    level: 5,
    stats: [20, 11, 9, 10, 13, 10],
  });
});

test("shiny targets match independent PID generation and XOR; nearby and attempt checks never pick an arbitrary landing", () => {
  const { s } = fixture();
  s.confirmedSid = 1022;
  s.targetMin = 1000;
  s.targetMax = 2000;
  const targets = searchShinyStarters(s);
  assert.ok(targets.length);
  assert.ok(targets.some((e) => e.advance === 1010));
  for (const e of targets) {
    const ref = oracle(e.advance);
    assert.equal(e.pid, ref.pid);
    assert.deepEqual(e.ivs, ref.ivs);
    assert.ok(
      (Number(s.tid) ^ s.confirmedSid ^ (e.pid & 65535) ^ (e.pid >>> 16)) < 8,
    );
  }
  s.selected = targets[0];
  const near = nearbyStarters(s);
  assert.equal(near.length, 21);
  assert.equal(near[0].advance, s.selected.advance - 10);
  const t = s.selected,
    traits = speciesTraits(s.species)!,
    evs = [0, 0, 0, 1, 0, 0],
    summary = {
      level: 5,
      stats: t.ivs.map((iv, i) =>
        calculateStat(traits.summaryBaseStats[i], iv, evs[i], 5, i, t.pid % 25),
      ),
    };
  const matches = matchStarterAttempt(
    near,
    s.species,
    { nature: t.pid % 25, gender: genderForPid(s.species, t.pid)! },
    summary,
    evs,
  );
  assert.ok(matches.some((e) => e.advance === t.advance));
  assert.deepEqual(
    matchStarterAttempt(
      near,
      s.species,
      {},
      { level: 5, stats: Array(6).fill(null) },
      evs,
    ),
    near,
    "uncertain inputs retain all possible landings",
  );
});

test("useful curtain questions eliminate SIDs rather than only separating PID/IV witnesses", () => {
  const obs = emptyObservations();
  assert.deepEqual(
    usefulStarterPixels(
      [makeHypothesis(0, 123, 1), makeHypothesis(0xffffffff, 123, 1)],
      {},
      obs,
    ),
    [],
  );
  const hs = [
    makeHypothesis(0, 123, 0),
    makeHypothesis(0, 123, 0x1000),
    makeHypothesis(0xffffffff, 123, 0x1000),
  ];
  const questions = usefulStarterPixels(hs, {}, obs);
  const top = questions.find((q) => q.index === 31)!;
  assert.equal(top.total, 2);
  assert.equal(top.transparent, 1);
  assert.equal(top.black, 1);
  obs[31] = 0;
  assert.ok(!usefulStarterPixels(hs, {}, obs).some((q) => q.index === 31));
});

test("guided route uses exact IVs, automatic obtainable items and legal move slots", () => {
  const { s } = fixture();
  s.moves = [1, 43, 0, 0];
  s.availableItems = [0, 1, 181];
  const before = JSON.stringify(s),
    spreads = searchStarter(s),
    plan = planStarterRoute(s, spreads);
  assert.ok([0, ...STARTER_ITEM_IDS].includes(plan.facts.heldItem!));
  assert.ok(plan.items!.every((id) => STARTER_ITEM_IDS.includes(id)));
  assert.ok(
    plan.items!.some((id) => !s.availableItems.includes(id)),
    "legacy inventory choices do not limit the automatic plan",
  );
  assert.ok(!plan.items!.includes(1) && !plan.items!.includes(181));
  for (const id of plan.items!)
    assert.ok(
      plan.instructions.some((text) =>
        text.includes(
          STARTER_ITEMS.find((source) => source.id === id)!.shop
            ? STARTER_ITEMS.find((source) => source.id === id)!.item.name
            : STARTER_ITEMS.find((source) => source.id === id)!.instruction,
        ),
      ),
    );
  if (plan.facts.heldItem) {
    const equip = plan.instructions.findIndex((text) =>
      text.startsWith("Before depositing, give "),
    );
    assert.ok(equip >= 0);
    assert.ok(
      plan.instructions[equip].includes(
        STARTER_ITEMS.find((source) => source.id === plan.facts.heldItem)!.item
          .name,
      ),
    );
    assert.ok(
      equip <
        plan.instructions.findIndex((text) =>
          text.startsWith("Place the starter in Box"),
        ),
    );
  }
  assert.ok(
    plan.facts.moves!.every((move) =>
      [0, 1, 43, 71, 98, 15, 331].includes(move!),
    ),
  );
  let completed: typeof s = { ...s, route: plan };
  for (let index = 0; index < plan.instructions.length; index++)
    completed = checkStarterRoute(completed, index, true);
  assert.deepEqual(battleEvs(completed.battles), plan.facts.evs);
  assert.deepEqual(completed.moves, plan.facts.moves);
  assert.deepEqual(
    checkStarterRoute(completed, plan.actions![0].index, true).battles,
    completed.battles,
  );
  assert.equal(plan.score.total, new Set(guideSidCandidates(s)).size);
  assert.ok(plan.score.worstCase <= plan.score.total);
  assert.equal(
    plan.facts.pid,
    spreads[0].pid,
    "the unique spread supplies the PID",
  );
  assert.deepEqual(plan.facts.ivs, spreads[0].ivs);
  assert.equal(JSON.stringify(s), before);
  assert.ok(!plan.instructions.join(" ").includes("Macho Brace"));
  const html = renderToStaticMarkup(
    createElement(StarterTravelChecklist, { plan }),
  );
  assert.match(html, /Get to Rustboro City/);
  assert.doesNotMatch(html, /father|Wally|Box 8/);
  assert.match(html, /Avoid all/);
  const surviving = guideSidCandidates(s).slice(0, 1);
  const resolved = planStarterRoute(s, spreads, surviving);
  assert.equal(resolved.score.total, 1);
  assert.equal(resolved.train, undefined);
  assert.equal(resolved.facts.heldItem, 0);
  assert.deepEqual(resolved.items, []);
  assert.match(resolved.instructions[0], /Avoid all wild battles/);
  const uncertain = planStarterRoute(
    s,
    [
      spreads[0],
      {
        ...spreads[0],
        ...oracle(901),
        advance: 901,
      },
    ],
    surviving,
  );
  assert.equal(uncertain.facts.pid, undefined);
  assert.equal(uncertain.facts.ivs, undefined);
  assert.throws(
    () => planStarterRoute(s, spreads, []),
    /No SID candidates remain/,
  );
});

test("automatic items add distinct SID evidence beyond known IVs and stop when resolved", () => {
  const facts = {
    ...routeCheckpoint(newStarterGuide()),
    ivs: [0, 0, 0, 0, 0, 0],
    evs: [0, 0, 0, 0, 0, 0],
    moves: [0, 0, 0, 0],
    pp: [0, 0, 0, 0],
  };
  for (let pid = 0; pid < 24; pid++) {
    const candidates = [1, 2].map((sid) => makeHypothesis(pid, 0, sid));
    const plan = planStarterItems(candidates, facts);
    assert.equal(
      plan.items.length,
      1,
      "equivalent item tests are collected only once",
    );
    assert.equal(plan.items[0] & 15, 2);
    assert.equal(plan.score.expected, 1);
    const knownIv = planStarterItems(candidates, {
      ...facts,
      ivs: [0, 0, 0, 4, 0, 0],
    });
    assert.deepEqual(
      knownIv.items,
      [],
      "an IV nibble already distinguishes these SIDs",
    );
    assert.equal(knownIv.score.expected, 1);
  }
  assert.deepEqual(
    planStarterItems([makeHypothesis(0, 0, 1)], facts).items,
    [],
  );
  const unreachable = planStarterItems(
    [0x1000, 0x2000].map((sid) => makeHypothesis(0, 0, sid)),
    facts,
  );
  assert.deepEqual(
    unreachable.items,
    [],
    "new raw item digits do not distinguish every SID position",
  );
  assert.equal(unreachable.score.worstCase, 2);
  const independent = planStarterItems(
    [0x11, 0x12, 0x21, 0x22].map((sid) => makeHypothesis(0, 0, sid)),
    facts,
  );
  assert.ok(independent.items.length >= 1);
  assert.equal(independent.score.expected, 1);
});

test("guided item sources include guaranteed pickups while excluding gated, random and unboxable items", () => {
  for (const id of [3, 12, 34, 79, 111, 133, 134, 135, 138, 139, 183, 297])
    assert.ok(STARTER_ITEM_IDS.includes(id));
  for (const id of [
    1, 2, 5, 7, 10, 23, 68, 78, 110, 121, 136, 137, 140, 181, 187, 200, 214,
    327, 339,
  ])
    assert.ok(
      !STARTER_ITEM_IDS.includes(id),
      `item ${id} is not a guaranteed usable pre-badge source`,
    );
  assert.ok(
    STARTER_ITEMS.every(
      (source) => source.item.experiment && source.instruction,
    ),
  );
  assert.match(
    STARTER_ITEMS.find((source) => source.id === 17)!.instruction,
    /Petalburg/,
  );
  assert.match(
    STARTER_ITEMS.find((source) => source.id === 183)!.instruction,
    /teacher/,
  );
  const s = newStarterGuide();
  s.step = 2;
  s.route = {
    facts: routeCheckpoint(s),
    instructions: ["Old selected-item plan"],
    done: [true],
    score: { total: 2, expected: 2, worstCase: 2 },
  };
  delete s.itemCatalogVersion;
  assert.equal(
    validateStarterGuide(s).route,
    null,
    "old selected-item plans refresh automatically",
  );
  s.step = 3;
  assert.deepEqual(
    validateStarterGuide(s).route,
    s.route,
    "an active curtain checkpoint retains its evidence and setup",
  );
  s.step = 2;
  s.route.train = { species: 288, count: 1 };
  assert.deepEqual(
    validateStarterGuide(s).route,
    s.route,
    "an unfinished training checkpoint is never replaced by migration",
  );
});

test("guided checkpoints do not require EXP and restored checklists preserve evidence", () => {
  const { s } = fixture();
  s.exp = "152";
  assert.equal(routeCheckpoint(s).experience, undefined);
  const plan = planStarterRoute(
    s,
    searchStarter(s),
    guideSidCandidates(s).slice(0, 1),
  );
  assert.equal(plan.facts.experience, undefined);
  assert.doesNotMatch(plan.instructions.join(" "), /exact EXP|EXP points/);
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(StarterTravelChecklist, { plan })),
    /exact EXP|EXP points|moves and EXP/,
  );
  s.route = {
    ...plan,
    facts: { ...plan.facts, experience: 152 },
    instructions: [
      "Check the current level, exact EXP and all four moves before boxing.",
      "Check current EXP and moves.",
      "Heal, check the new level and moves, then update EXP points below. Cancel evolution.",
    ],
    done: [true, false, true],
    actions: undefined,
  };
  const restored = validateStarterGuide(s);
  assert.doesNotMatch(restored.route!.instructions.join(" "), /EXP|level/);
  assert.match(
    restored.route!.instructions.join(" "),
    /all four current moves/,
  );
  assert.deepEqual(
    restored.route!.facts,
    s.route.facts,
    "saved evidence is preserved",
  );
  assert.deepEqual(restored.route!.done, s.route.done);
  assert.deepEqual(validateStarterGuide(restored), restored);
});

test("early EXP adds no distinct SID outcomes beyond the guide's other known plaintext", () => {
  const { s } = fixture();
  const facts = routeCheckpoint(s);
  const sids = [
    ...new Set([
      0,
      ...Array.from({ length: 4 }, (_, position) =>
        Array.from({ length: 16 }, (_, digit) => digit << (position * 4)),
      ).flat(),
    ]),
  ];
  // Group SIDs by deterministic black/transparent plaintext outcomes. A
  // substructure permutation only rearranges these outcomes on the curtain.
  const partition = (pid: number, experience?: number) => {
    const groups = new Map<string, number[]>();
    for (const sid of sids) {
      const h = makeHypothesis(pid, Number(s.tid), sid);
      const plain = starterPlaintext({ ...facts, experience }, h);
      const pattern = plain
        .map((mask, index) => {
          if (!mask || mask & (mask - 1)) return "?";
          const digit = Math.log2(mask);
          return digit === ((h.key >>> ((index % 8) * 4)) & 15) ? "0" : "1";
        })
        .join("");
      groups.set(pattern, [...(groups.get(pattern) ?? []), sid]);
    }
    return [...groups.values()].sort((a, b) => a[0] - b[0]);
  };
  for (let pid = 0; pid < 24; pid++) {
    const without = partition(pid);
    for (const experience of [0, 152, 65535])
      assert.deepEqual(partition(pid, experience), without);
  }
});

test("guided curtains retain the main artwork but label only the 8 by 20 record grid", () => {
  const layout = stripLayout();
  assert.ok(layout.bounds.w > recordStripLayout().bounds.w);
  const obs = emptyObservations();
  obs[80] = 0;
  const lab = {
    canvasRef: { current: null },
    analysisBusy: false,
    analysisError: "",
    obs,
    assistance: { contradictions: new Set<number>() },
    itemTestBaseline: newSnapshot("baseline", "Starter curtain", {}),
  } as unknown as Parameters<typeof StarterCurtainStep>[0]["lab"];
  const html = renderToStaticMarkup(
    createElement(StarterCurtainStep, {
      lab,
      state: newStarterGuide(),
      onTraining: () => {},
      onMoreInfo: () => {},
    }),
  );
  assert.match(
    html,
    new RegExp(
      `width="${layout.bounds.w * 20}" height="${layout.bounds.h * 20}"`,
    ),
  );
  for (let nibble = 16; nibble < 176; nibble++) {
    const hit = hitForNibble(nibble)!;
    assert.equal(
      curtainLocation(nibble, layout.bounds),
      `row ${hit.displayY - layout.bounds.y + 1}, column ${hit.displayX - layout.bounds.x + 1}`,
    );
    assert.equal(
      curtainLocation(nibble),
      curtainLocation(nibble, recordStripLayout().bounds),
      "existing compact-guide coordinates remain unchanged",
    );
    const [row, column] = [...curtainLocation(nibble).matchAll(/\d+/g)].map(
      (match) => Number(match[0]),
    );
    assert.ok(row >= 1 && row <= 20 && column >= 1 && column <= 8);
  }
  assert.ok(html.includes(curtainLocation(80)));
  assert.match(html, /Draw your curtains/);
  assert.match(html, /Finish drawing/);
  assert.match(
    html,
    /Marked boxes are pre-drawn based on your Pokémon’s known/,
  );
  assert.doesNotMatch(html, /Candidates update after each/);
  const paused = renderToStaticMarkup(
    createElement(StarterCurtainStep, {
      lab: {
        ...lab,
        drawingInProgress: true,
        sidAnalysis: { sidValues: [123], candidates: [] },
      } as unknown as typeof lab,
      state: newStarterGuide(),
      onTraining: () => {},
      onMoreInfo: () => {},
    }),
  );
  assert.match(paused, /Calculations paused/);
  assert.match(
    paused,
    /<button>Finish drawing<\/button>/,
    "Finish must remain available while drawing is paused",
  );
  assert.doesNotMatch(paused, /One SID matches/);
  assert.match(html, /touch-action:none/);
  assert.doesNotMatch(html, /Is this pixel transparent or black/);
  const question = renderToStaticMarkup(
    createElement(SidPixelQuestion, {
      target: { nibble: 80, field: "IVs" },
      onAnswer: () => {},
    }),
  );
  assert.ok(question.includes(curtainLocation(80)));
});

test("guide progress and its existing-engine investigation restore independently of advanced autosave", () => {
  const { s } = fixture();
  s.step = 3;
  assert.deepEqual(validateStarterGuide(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() => validateStarterGuide({ ...s, step: 6 }));
  assert.throws(() =>
    validateStarterGuide({
      ...s,
      selected: { ...searchStarter(s)[0], ivs: [null, 0, 0, 0, 0, 0] },
    }),
  );
  const snapshot = newSnapshot("current", "Starter", routeCheckpoint(s));
  const guide = saveInvestigation({
    format: "emerald-curtain-investigation",
    schemaVersion: 1,
    mappingVersion: PROFILE.id,
    identity: { species: s.species, tid: Number(s.tid) },
    snapshots: [snapshot, ...readingSnapshots(s.readings)],
    activeId: snapshot.id,
    origin: "static",
    ownedItems: [],
    rng: starterSettings(s),
    sidRng: estimatedSidWindow(s.intro),
  });
  const storage = {
    getItem: (key: string) =>
      key === AUTOSAVE_KEY ? null : key === "guided" ? guide : null,
  };
  assert.equal(readAutosave(storage), null);
  assert.equal(readAutosave(storage, "guided")!.identity.species, s.species);
  assert.equal(loadInvestigation(guide).rng!.kind, "static");
});

test("generated IV plaintext produces the correct SID question partitions in all 24 data permutations", () => {
  // Independently transcribed logical G/A/E/M -> physical block positions.
  const positions = [
    "0123",
    "0132",
    "0213",
    "0312",
    "0231",
    "0321",
    "1023",
    "1032",
    "2013",
    "3012",
    "2031",
    "3021",
    "1203",
    "1302",
    "2103",
    "3102",
    "2301",
    "3201",
    "1230",
    "1320",
    "2130",
    "3120",
    "2310",
    "3210",
  ];
  const ivs = [31, 0, 17, 4, 12, 29],
    tid = 0x9876;
  const sids = [
    ...new Set(
      Array.from({ length: 4 }, (_, digit) =>
        Array.from({ length: 16 }, (_, value) => value << (digit * 4)),
      ).flat(),
    ),
  ];
  for (let order = 0; order < 24; order++) {
    const pid = 0x12345678 - (0x12345678 % 24) + order;
    for (const abilitySlot of [0, 1]) {
      const candidates = sids.map((sid) => ({
        ...makeHypothesis(pid, tid, sid),
        rng: { ivs, abilitySlot },
      }));
      const questions = usefulStarterPixels(
        candidates,
        {},
        emptyObservations(),
      );
      const word =
        (ivs.reduce((value, iv, i) => value | (iv << (i * 5)), 0) |
          (abilitySlot << 31)) >>>
        0;
      const start = 80 + Number(positions[order][3]) * 24 + 8;
      for (let nibble = 0; nibble < 8; nibble++) {
        const transparent = sids.filter((sid) => {
          const key = (pid ^ (sid << 16) ^ tid) >>> 0;
          return (((word ^ key) >>> (nibble * 4)) & 15) === 0;
        }).length;
        const q = questions.find((q) => q.index === start + nibble);
        if (!transparent || transparent === sids.length)
          assert.equal(q, undefined);
        else {
          assert.ok(q);
          assert.equal(q.transparent, transparent);
          assert.equal(q.black, sids.length - transparent);
          assert.equal(q.total, sids.length);
        }
      }
    }
  }
});

test("guided stats and selective curtain answers use the existing joint SID deduction pipeline", () => {
  const { s, expected } = fixture();
  const facts = routeCheckpoint(s),
    snapshot = newSnapshot("current", "Starter", facts);
  const input = {
    identity: splitFacts(facts).identity,
    snapshots: [snapshot, ...readingSnapshots(s.readings)],
    activeId: snapshot.id,
    rng: starterSettings(s),
    sidRng: estimatedSidWindow(s.intro),
  };
  const before = computeDeduction(input);
  assert.ok(before.sidAnalysis!.candidates.some((h) => h.pid === expected.pid));
  const question = usefulStarterPixels(
    before.sidAnalysis!.candidates,
    facts,
    snapshot.observations,
  )[0];
  assert.ok(question);
  const trueSid = before.sidAnalysis!.sidValues[0];
  const h = before.sidAnalysis!.candidates.find((h) => h.sid === trueSid)!;
  // Independent direct SID-header nibble answer, no generated pixel treated as
  // observation by production code. This is a controlled test oracle only.
  const index = 31;
  snapshot.observations[index] = trueSid >>> 12 === 0 ? 0 : 1;
  const after = computeDeduction(input);
  assert.ok(after.sidAnalysis!.sidValues.includes(trueSid));
  assert.ok(
    after.sidAnalysis!.candidates.some(
      (c) => c.pid === h.pid && c.sid === trueSid,
    ),
  );
});

test("wizard starts with one screen and the two supplied timing references, leaving advanced tools available", () => {
  const html = renderToStaticMarkup(
    createElement(StarterWizard, { onExit: () => {} }),
  );
  assert.match(html, /Step 1 of 6/);
  assert.match(html, /Return to investigator/);
  assert.match(html, /trainer-name\.png/);
  assert.match(html, /birch-final\.png/);
  assert.doesNotMatch(html, /Game image to add|Image placeholder/);
  assert.match(html, /Generate TID\/SID/);
  assert.doesNotMatch(html, /Record stats and find starter spreads/);
});
