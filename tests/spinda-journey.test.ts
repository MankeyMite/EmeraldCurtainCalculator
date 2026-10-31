import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { controlledActions } from "../src/core/controlledExperiments";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { PROFILE } from "../src/core/memory";
import {
  defaultSpindaMatcher,
  generateSpindaCandidates,
  validateSpindaMatcher,
  prepareSpindaCandidates,
  rankSpindaCandidates,
} from "../src/core/spindaMatcher";
import {
  chooseSpindaRoute,
  newSpindaJourney,
  planSpindaVitamins,
  spindaCatchMoves,
  spindaSpreadCount,
  paintedSpindaShortlist,
  vitaminShoppingBreakEven,
  type JourneyExperiment,
  SPINDA_JOURNEY_STEPS,
  spindaStoragePlacement,
  confirmedSpindaPidJourney,
  spindaJourneyPage,
} from "../src/core/spindaJourney";
import { experimentSeconds } from "../src/core/nextSidStep";
import {
  factsToDraft,
  freshCapturePreset,
  newPokemonFacts,
  wildStoragePreset,
} from "../src/core/facts";
import { SpindaMatcher } from "../src/components/SpindaMatcher";
import { SpindaWizard } from "../src/components/SpindaWizard";
import { spindaPattern } from "../src/core/spinda";
import type { CurtainLab } from "../src/hooks/useCurtainLab";
import type { KnownFacts } from "../src/core/constraints";
import { newSpindaSidGuide } from "../src/core/spindaSidGuide";
import { SpindaSidGuide } from "../src/components/SpindaSidGuide";
import { SpindaInformationPage } from "../src/components/SpindaJourneyPages";

const facts: KnownFacts = {
  species: 308,
  evs: [0, 0, 0, 0, 0, 0],
  pokerus: 0,
  heldItem: 0,
};

test("first PID selection proceeds through capture and information before pixel questions", () => {
  const original = { ...newSpindaJourney(), language: 1, iron: 3 };
  const painted = { ...original, step: "match" as const, patternDrawn: true };
  const chosen = confirmedSpindaPidJourney(painted, 0x12345678);
  assert.equal(chosen.step, "catch");
  assert.equal(chosen.caught, false, "choosing a PID does not confirm capture");
  const captured = { ...chosen, caught: true, step: "stats" as const };
  assert.equal(spindaJourneyPage(captured), "stats");
  const selectedAgain = confirmedSpindaPidJourney(captured, 0x12345678);
  assert.equal(
    selectedAgain.step,
    "information",
    "reselecting this catch must ask for its information",
  );
  for (const step of ["pixels", "plan", "experiment", "restore"] as const)
    assert.equal(spindaJourneyPage({ ...selectedAgain, step }), "information");
  const complete = { ...selectedAgain, informationComplete: true };
  assert.equal(confirmedSpindaPidJourney(complete, 0x12345678).step, "pixels");
  assert.equal(selectedAgain.language, 1);
  assert.equal(selectedAgain.iron, 3);
  assert.equal(original.caught, false);
});

test("stale pixel-guide saves reopen at the first unfinished setup page without clearing evidence", () => {
  const capture = { species: 308, tid: 12345, ...spindaCatchMoves(16) };
  const state = defaultSpindaMatcher();
  state.guide = newSpindaSidGuide(state.pid);
  const lab = {
    spindaMatcher: state,
    facts: capture,
    factDraft: factsToDraft(capture),
    summaryDraft: {},
    setSpindaMatcher: () => {},
    editFact: () => {},
    editSummaryStat: () => {},
    identity: {},
    activeSnapshot: newSnapshot("base", "Spinda", capture),
  } as unknown as CurtainLab;
  const cases = [
    { flags: {}, page: "draw" },
    {
      flags: { patternDrawn: true, caught: true, informationComplete: true },
      page: "match",
    },
    { flags: { patternDrawn: true, matchedPid: state.pid }, page: "catch" },
    {
      flags: { patternDrawn: true, matchedPid: state.pid, caught: true },
      page: "information",
    },
    {
      flags: {
        patternDrawn: true,
        matchedPid: state.pid,
        caught: true,
        informationComplete: true,
      },
      page: "pixels",
    },
  ] as const;
  for (const { flags, page } of cases) {
    state.journey = { ...newSpindaJourney(), step: "pixels", ...flags };
    const before = structuredClone(state);
    assert.equal(spindaJourneyPage(state.journey), page);
    const html = renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
    assert.equal(
      html.includes('aria-label="Spinda SID checks"'),
      page === "pixels",
    );
    if (page === "information")
      assert.match(html, /Copy the summary information/);
    if (page === "draw") assert.match(html, /aria-label="Spinda spot editor"/);
    assert.deepEqual(state, before);
    assert.equal(lab.facts.tid, 12345);
  }
  const { caught: _caught, ...legacy } = newSpindaJourney();
  const restored = validateSpindaMatcher({
    ...state,
    journey: { ...legacy, step: "draw" },
  });
  assert.equal(
    restored.journey?.caught,
    false,
    "the drawing page must not imply that a catch already happened",
  );
});
function experiments(pid = 0): JourneyExperiment[] {
  return controlledActions(newSnapshot("base", "Spinda", facts), 308, {
    pid,
  }).map((action) => ({
    id: action.id,
    name: action.name,
    action,
    informationGain: 1,
    seconds: experimentSeconds(action),
  }));
}

test("encounter level creates three or four reviewable moves, including fourth-slot Psybeam at 16", () => {
  assert.equal(spindaCatchMoves(15).moves[3], 0);
  assert.equal(spindaCatchMoves(15).pp[3], 0);
  assert.equal(spindaCatchMoves(16).moves[3], 60);
  assert.equal(spindaCatchMoves(16).pp[3], 20);
  assert.equal(spindaCatchMoves(100).moves.filter(Boolean).length, 4);
  assert.throws(() => spindaCatchMoves(0));
  assert.throws(() => spindaCatchMoves(15.5));
});

test("the first four candidates are ranked against painted spots without removing candidates or merging IVs", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 200;
  const pool = generateSpindaCandidates(state),
    copy = structuredClone(pool);
  const painted = spindaPattern(pool[0].pid);
  const ranked = rankSpindaCandidates(prepareSpindaCandidates(pool), painted);
  const shortlist = paintedSpindaShortlist(ranked);
  assert.equal(shortlist.length, 4);
  assert.deepEqual(pool, copy);
  assert.deepEqual(shortlist, ranked.slice(0, 4));
  assert.equal(shortlist[0].score, 100);
  assert.equal(state.settings.minAdvance, 0);
  assert.equal(state.settings.maxAdvance, 200);
  const one = pool[0];
  assert.equal(
    spindaSpreadCount({
      pid: one.pid,
      encounters: [
        one.encounters[0],
        { ...one.encounters[0], methods: ["H2"] },
      ],
    }),
    1,
  );
});

test("vitamin route uses actual digits: equal candidate counts can choose vitamins, catching, or no useful vitamin", () => {
  const options = experiments(),
    stock = newSpindaJourney(),
    nextCatch = { informationGain: 1, seconds: 240 };
  const low = planSpindaVitamins(0, [2, 4], facts, options, stock)!;
  assert.ok(low);
  assert.deepEqual(low.digits, [4]);
  assert.equal(low.iron, 2);
  assert.equal(low.carbos, 0);
  assert.equal(low.informationGain, 1);
  assert.equal(low.unresolvedGroups, 0);
  assert.equal(low.seconds, 230);
  assert.equal(vitaminShoppingBreakEven(low, nextCatch, 180), 190);
  assert.equal(chooseSpindaRoute([], low, nextCatch)?.kind, "vitamins");
  const high = planSpindaVitamins(0, [0x3000, 0x4000], facts, options, stock)!;
  assert.deepEqual(high.digits, [1]);
  assert.equal(high.carbos, 5);
  assert.equal(chooseSpindaRoute([], high, nextCatch)?.kind, "catch");
  assert.equal(
    planSpindaVitamins(0, [0xe000, 0xf000], facts, options, stock),
    undefined,
  );
  const owned = planSpindaVitamins(0, [0x3000, 0x4000], facts, options, {
    ...stock,
    carbos: 5,
  })!;
  assert.equal(owned.buyCarbos, 0);
  assert.equal(owned.seconds, 80);
  assert.equal(chooseSpindaRoute([], owned, nextCatch)?.kind, "vitamins");
  assert.equal(
    chooseSpindaRoute(
      [{ id: "swap", name: "Swap moves", informationGain: 1, seconds: 30 }],
      owned,
      nextCatch,
    )?.kind,
    "experiment",
  );
});

test("vitamin partitions agree with independent XOR-byte patterns across all 24 storage orders", () => {
  for (let pid = 0x12340000; pid < 0x12340018; pid++) {
    const sids = [0x1234, 0x1236, 0x5234, 0x5236, 0xe234, 0xe236];
    const route = planSpindaVitamins(
      pid,
      sids,
      facts,
      experiments(pid),
      newSpindaJourney(),
    );
    if (!route) continue;
    const groups = new Map<string, number>();
    for (const sid of sids) {
      const key = route.actions
        .map((e) => {
          const ev = e.action!.changes.evs!;
          const stat = ev[2] !== 0 ? 2 : 3;
          const byte =
            ev[stat]! ^ ((((pid >>> 16) ^ sid) >>> ((stat - 2) * 8)) & 255);
          return `${Number((byte & 15) === 0)}${Number(byte >>> 4 === 0)}`;
        })
        .join("/");
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const bits = [...groups.values()].reduce((sum, count) => {
      const p = count / sids.length;
      return sum - p * Math.log2(p);
    }, 0);
    assert.ok(Math.abs(bits - route.informationGain) < 1e-9);
    assert.equal(
      route.unresolvedGroups,
      [...groups.values()].filter((n) => n > 1).length,
    );
    assert.ok(route.iron <= 10 && route.carbos <= 10);
  }
});

test("guide page, painted pattern, stock and exact carried SID correlations round-trip without creating observations", () => {
  const state = {
    ...defaultSpindaMatcher(),
    journey: {
      ...newSpindaJourney(),
      step: "experiment" as const,
      patternDrawn: true,
      matchedPid: 0x12345678,
      iron: 3,
      carbos: 5,
      restore: "Reload the original save.",
    },
    sidProgress: { tested: [1, 2, 4, 8], remainingSids: [0x1234, 0xabcd] },
  };
  const original = newSnapshot("base", "Spinda");
  const saved = saveInvestigation({
    format: "emerald-curtain-investigation",
    schemaVersion: 1,
    mappingVersion: PROFILE.id,
    identity: {},
    snapshots: [original],
    activeId: "base",
    origin: "wild",
    ownedItems: [],
    spindaMatcher: state,
  });
  const restored = loadInvestigation(saved);
  assert.deepEqual(restored.spindaMatcher, state);
  assert.deepEqual(restored.snapshots[0].observations, original.observations);
  assert.throws(() =>
    validateSpindaMatcher({
      ...state,
      journey: { ...state.journey, step: "invented" },
    }),
  );
  assert.throws(() =>
    validateSpindaMatcher({
      ...state,
      journey: { ...state.journey, iron: -1 },
    }),
  );
  assert.throws(() =>
    validateSpindaMatcher({
      ...state,
      journey: { ...state.journey, matchedPid: -1 },
    }),
  );
  assert.equal(
    validateSpindaMatcher(defaultSpindaMatcher()).journey,
    undefined,
  );
});

test("every guide page renders independently, with information, drawing and questions kept on their own page", () => {
  const capture = {
    ...freshCapturePreset(
      wildStoragePreset({ ...newPokemonFacts(), species: 308 }),
    ),
    ...spindaCatchMoves(16),
  };
  const state = defaultSpindaMatcher();
  state.guide = { ...newSpindaSidGuide(state.pid), freshZeros: true };
  const lab = {
    spindaMatcher: state,
    facts: capture,
    factDraft: factsToDraft(capture),
    summaryDraft: { level: "16" },
    activeSnapshot: newSnapshot("base", "Spinda", capture),
    itemTestBaseline: newSnapshot("base", "Spinda", capture),
    identity: {},
    controlledExperiments: [],
    experiments: [],
    ownedItems: [],
    setSpindaMatcher: () => {},
    editFact: () => {},
    editSummaryStat: () => {},
    sidAnalysis: { sidValues: [2, 4] },
  } as unknown as CurtainLab;
  for (const step of SPINDA_JOURNEY_STEPS) {
    state.journey = {
      ...newSpindaJourney(),
      step,
      patternDrawn: true,
      matchedPid: state.pid,
      caught: true,
      informationComplete: true,
    };
    const html = renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
    assert.match(html, /Find SID with Spinda/);
    const navigation =
      html.match(/<nav class="spinda-page-navigation"[\s\S]*?<\/nav>/g) ?? [];
    assert.equal(
      navigation.length,
      step === "prepare" ? 0 : 1,
      `${step}: Back appears only at the bottom, after page one`,
    );
    for (const controls of navigation) {
      assert.match(controls, />Back<\/button>/);
      assert.equal(controls.includes('disabled=""'), false);
    }
    assert.equal(
      html.includes('aria-label="Spinda spot editor"'),
      step === "draw",
    );
    assert.equal(
      html.includes('aria-label="Move 4 current PP"'),
      step === "moves" || step === "details",
    );
    assert.doesNotMatch(
      html,
      /Spinda encounter timer|countdown|timing candidates/,
    );
    if (step === "pixels") assert.match(html, /Curtain: row/);
  }
});

test("Spinda has its own guide page, and pattern comparison requires painting first", () => {
  const state = {
    ...defaultSpindaMatcher(),
    level: 16,
    journey: { ...newSpindaJourney(), step: "draw" as const },
  };
  const lab = {
    spindaMatcher: state,
    facts: {},
    setSpindaMatcher: () => {},
  } as unknown as CurtainLab;
  let html = renderToStaticMarkup(
    createElement(SpindaWizard, { lab, onExit: () => {} }),
  );
  assert.match(html, /<main class="starter-wizard spinda-wizard">/);
  assert.match(html, /<h1>Find SID with Spinda<\/h1>/);
  assert.match(html, /Return to investigator/);
  assert.match(html, /Page 1 of 12/);
  assert.match(html, /Continue saved guide — Page 2/);
  assert.doesNotMatch(html, /aria-label="Spinda spot editor"/);
  html = renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
  assert.match(html, /aria-label="Spinda spot editor"/);
  assert.match(
    html,
    /<button disabled="">Compare patterns with my drawing<\/button>/,
  );
  assert.doesNotMatch(
    html,
    /<summary>Find SID with Spinda|Spinda encounter timer|Inspect PID/,
  );
  state.journey.patternDrawn = true;
  html = renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
  assert.match(html, /<button>Compare patterns with my drawing<\/button>/);
});

test("opening Spinda starts on page one even with a saved experiment, preserving its data", () => {
  const state = {
    ...defaultSpindaMatcher(),
    journey: { ...newSpindaJourney(), step: "experiment" as const },
    sidProgress: { tested: [1, 2, 4, 8], remainingSids: [2, 4] },
  };
  const before = structuredClone(state);
  const lab = {
    spindaMatcher: state,
    facts: {},
    setSpindaMatcher: () => {},
    pendingItemTest: {
      id: "test",
      itemTest: { action: { restore: "Reload the original save." } },
    },
  } as unknown as CurtainLab;
  const html = renderToStaticMarkup(
    createElement(SpindaWizard, { lab, onExit: () => {} }),
  );
  assert.match(html, /Page 1 of 12/);
  assert.match(html, /Continue saved guide — Page 11/);
  assert.doesNotMatch(html, /<h2[^>]*>Run the experiment/);
  assert.doesNotMatch(html, />Back<\/button>/);
  assert.deepEqual(state, before);
});

test("old timer progress migrates to the painter and drops the clock without losing SID progress", () => {
  const state = validateSpindaMatcher({
    ...defaultSpindaMatcher(),
    sidProgress: { tested: [1, 2, 3, 4], remainingSids: [2, 4] },
    journey: { ...newSpindaJourney(), step: "encounter", elapsed: 50 },
  });
  assert.equal(state.journey?.step, "draw");
  assert.equal(state.journey?.patternDrawn, false);
  assert.equal("elapsed" in state.journey!, false);
  assert.deepEqual(state.sidProgress?.remainingSids, [2, 4]);
});

test("language selection controls setup and later box reminders, including saved progress on page one", () => {
  for (const language of [1, 2, 3, 4, 5, 7]) {
    const placement = spindaStoragePlacement(language);
    assert.equal(placement.box, language === 1 ? 7 : 8);
    assert.equal(placement.slot, language === 1 ? 27 : 5);
    const state = validateSpindaMatcher({
      ...defaultSpindaMatcher(),
      journey: {
        ...newSpindaJourney(),
        language,
        step: "pixels",
        caught: true,
      },
      guide: newSpindaSidGuide(0),
    });
    assert.equal(state.journey?.language, language);
    const lab = {
      spindaMatcher: state,
      facts: { species: 308, language },
      factDraft: {},
      editFact: () => {},
      setSpindaMatcher: () => {},
    } as unknown as CurtainLab;
    const intro = renderToStaticMarkup(
      createElement(SpindaWizard, { lab, onExit: () => {} }),
    );
    assert.match(intro, /Page 1 of 12/);
    assert.match(intro, /aria-label="Spinda game language"/);
    assert.match(intro, new RegExp(`<option value="${language}" selected="">`));
    assert.match(intro, /full party of six/);
    assert.match(
      intro,
      new RegExp(`Exit the PC while Box ${placement.box} is selected`),
    );
    assert.match(intro, new RegExp(`directly into slot ${placement.slot}`));
    if (language === 1) {
      assert.match(intro, /Box 7, slot 27 for viewing pixels/);
      assert.match(intro, /Fill slots 1–26/);
      assert.doesNotMatch(intro, /fill Box 8 slots/);
    } else {
      assert.match(
        intro,
        /English and other non-Japanese versions, fill Box 8 slots 1–4/,
      );
      assert.doesNotMatch(intro, /Box 7, slot 27/);
    }
    const moves = renderToStaticMarkup(
      createElement(SpindaInformationPage, { lab, page: "moves" }),
    );
    assert.match(
      moves,
      new RegExp(`summary in Box ${placement.box}, slot ${placement.slot}`),
    );
    const pixels = renderToStaticMarkup(
      createElement(SpindaSidGuide, {
        value: newSpindaSidGuide(0),
        facts: lab.facts,
        onChange: () => {},
        compact: true,
      }),
    );
    assert.match(
      pixels,
      new RegExp(`With Spinda in Box ${placement.box}, slot ${placement.slot}`),
    );
  }
  assert.throws(() =>
    validateSpindaMatcher({
      ...defaultSpindaMatcher(),
      journey: { ...newSpindaJourney(), language: 6 },
    }),
  );
});
