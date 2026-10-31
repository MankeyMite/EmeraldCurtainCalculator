import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AUTOSAVE_KEY, readAutosave } from "../src/core/autosave";
import { factsToDraft, draftToFacts } from "../src/core/facts";
import {
  newSnapshot,
  splitFacts,
  saveInvestigation,
  loadInvestigation,
  type Investigation,
} from "../src/core/investigation";
import { PROFILE } from "../src/core/memory";
import { validateFacts } from "../src/core/session";
import {
  newSpindaCaptureFacts,
  newSpindaJourney,
  spindaObservedTraits,
  confirmedSpindaPidJourney,
} from "../src/core/spindaJourney";
import {
  defaultSpindaMatcher,
  generateSpindaCandidates,
  prepareSpindaCandidates,
  rankSpindaCandidates,
} from "../src/core/spindaMatcher";
import { newSpindaSidGuide } from "../src/core/spindaSidGuide";
import { spindaPattern } from "../src/core/spinda";
import { genderForPid } from "../src/core/traits";
import { useCurtainLab, type CurtainLab } from "../src/hooks/useCurtainLab";
import { SpindaWizard } from "../src/components/SpindaWizard";

function savedSpinda(): Investigation {
  const facts = newSpindaCaptureFacts(
    { tid: 12345, otName: "ASH" },
    4,
    16,
    2,
    0x12345678,
  );
  const snapshot = newSnapshot("base", "Caught Spinda", facts);
  snapshot.observations[84] = 1;
  return {
    format: "emerald-curtain-investigation",
    schemaVersion: 1,
    mappingVersion: PROFILE.id,
    origin: "wild",
    identity: splitFacts(facts).identity,
    snapshots: [snapshot],
    activeId: "base",
    ownedItems: [70],
    sidDigitFilters: [1, 2, 4, 8],
    spindaMatcher: {
      ...defaultSpindaMatcher(),
      pid: facts.pid!,
      appliedPid: facts.pid,
      journey: {
        ...newSpindaJourney(),
        step: "pixels",
        patternDrawn: true,
        matchedPid: facts.pid,
        caught: true,
        informationComplete: true,
      },
      guide: { ...newSpindaSidGuide(facts.pid!), observations: { 84: 1 } },
      sidProgress: { tested: [1, 2, 4, 8], remainingSids: [0x1234, 0xabcd] },
    },
  };
}

test("catch defaults remain valid through information corrections and investigation save/load", () => {
  for (const language of [1, 2, 3, 4, 5, 7]) {
    const initial = newSpindaCaptureFacts(
      { tid: 12345 },
      4,
      16,
      language,
      0x12345678,
    );
    assert.equal(initial.shiny, false);
    assert.equal(initial.nickname, language === 2 ? "SPINDA" : undefined);
    assert.ok(
      !initial.assumed?.includes("shiny"),
      "boolean defaults must not carry numeric assumption metadata",
    );
    const corrected = draftToFacts(
      { ...factsToDraft(initial), nature: "3", gender: "female", tid: "54321" },
      initial.assumed,
    );
    assert.deepEqual(validateFacts(corrected), corrected);
    const investigation = savedSpinda();
    investigation.identity = splitFacts(corrected).identity;
    investigation.snapshots = [
      newSnapshot("base", "Corrected Spinda", corrected),
    ];
    const loaded = loadInvestigation(saveInvestigation(investigation));
    assert.deepEqual(
      { ...loaded.identity, ...loaded.snapshots[0].knownFacts },
      corrected,
    );
  }
});

test("corrected observed traits recover a painted PID excluded by the original information", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 500;
  const candidates = generateSpindaCandidates(state);
  const first = candidates[0];
  assert.ok(first);
  const correct = candidates.find(
    (c) =>
      c.pid % 25 !== first.pid % 25 &&
      genderForPid(308, c.pid) !== genderForPid(308, first.pid),
  );
  assert.ok(correct);
  const stale = {
    ...state,
    nature: first.pid % 25,
    gender: genderForPid(308, first.pid) as "male" | "female",
  };
  assert.ok(
    !generateSpindaCandidates(stale).some((c) => c.pid === correct.pid),
  );
  const facts = draftToFacts({
    ...factsToDraft(
      newSpindaCaptureFacts({}, 4, first.encounters[0].level, 2, first.pid),
    ),
    nature: String(correct.pid % 25),
    gender: genderForPid(308, correct.pid)!,
    metLevel: String(correct.encounters[0].level),
  });
  const matches = rankSpindaCandidates(
    prepareSpindaCandidates(
      generateSpindaCandidates({ ...stale, ...spindaObservedTraits(facts) }),
    ),
    spindaPattern(correct.pid),
  );
  assert.equal(matches.find((c) => c.pid === correct.pid)?.score, 100);
  const journey = confirmedSpindaPidJourney(
    {
      ...newSpindaJourney(),
      step: "match",
      caught: true,
      patternDrawn: true,
      informationComplete: true,
    },
    correct.pid,
  );
  assert.equal(journey.step, "pixels");
  assert.equal(journey.matchedPid, correct.pid);
  assert.deepEqual(spindaObservedTraits({ species: 308 }), {
    nature: undefined,
    gender: undefined,
    level: undefined,
  });
});

test("refresh discards the whole Spinda investigation while explicit loading still restores it", () => {
  const saved = saveInvestigation(savedSpinda());
  const storage = { getItem: () => saved };
  assert.equal(
    readAutosave(storage)?.spindaMatcher?.journey?.informationComplete,
    true,
  );
  assert.deepEqual(readAutosave(storage)?.spindaMatcher?.guide?.observations, {
    84: 1,
  });
  assert.equal(
    readAutosave(storage, AUTOSAVE_KEY, { resetSpindaGuide: true }),
    null,
  );
  assert.equal(loadInvestigation(saved).identity.tid, 12345);
});

test("refresh resets stale Spinda guide state without deleting another species' investigation", () => {
  const other = savedSpinda();
  other.identity = { species: 277, tid: 54321 };
  other.snapshots = [
    newSnapshot("base", "Another investigation", {
      species: 277,
      experience: 1234,
    }),
  ];
  const restored = readAutosave(
    { getItem: () => saveInvestigation(other) },
    AUTOSAVE_KEY,
    { resetSpindaGuide: true },
  );
  assert.deepEqual(restored?.identity, other.identity);
  assert.equal(restored?.snapshots[0].knownFacts.experience, 1234);
  assert.deepEqual(restored?.spindaMatcher, defaultSpindaMatcher());
});

test("every fresh page mount starts a new guide with page one and no drawn Spinda or SID evidence", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const saved = saveInvestigation(savedSpinda());
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: () => saved } },
  });
  try {
    for (let refresh = 0; refresh < 2; refresh++) {
      let lab: CurtainLab | undefined;
      function Probe() {
        lab = useCurtainLab(AUTOSAVE_KEY, { resetSpindaGuideOnLoad: true });
        return createElement(SpindaWizard, { lab, onExit: () => {} });
      }
      const html = renderToStaticMarkup(createElement(Probe));
      assert.ok(lab);
      assert.equal(lab.facts.pid, undefined);
      assert.equal(lab.facts.tid, undefined);
      assert.equal(lab.facts.species, undefined);
      assert.deepEqual(lab.spindaMatcher, defaultSpindaMatcher());
      assert.ok(lab.obs.every((n) => n === -1));
      assert.match(html, /Page 1 of 12/);
      assert.match(html, /Refreshing the site starts a new Spinda guide/);
      assert.doesNotMatch(html, /Continue saved guide/);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
