import test from "node:test";
import assert from "node:assert/strict";
import {
  GUIDE_KEY,
  GUIDE_LAB_KEY,
  newStarterGuide,
  newShinyAttempt,
  starterAbility,
  validateStarterGuide,
} from "../src/core/starterGuide";
import {
  GUIDE_RESET_BACKUP_KEY,
  resetGuideProgress,
  restoreGuideProgress,
} from "../src/core/starterGuideStorage";
import { AUTOSAVE_KEY } from "../src/core/autosave";
import type { RngSpread } from "../src/core/rng";

function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

test("reset clears trainer, starter, SID evidence and route, keeps timing and can undo across sessions", () => {
  const s = newStarterGuide();
  s.step = 4;
  s.tid = "16780";
  s.confirmedSid = 26047;
  s.protectedSave = true;
  s.intro.second = 20;
  s.intro.uncertainty = 60;
  s.starter.calibration = 3;
  s.battles.push({ id: "extra", species: 301, count: 2, multiplier: 1 });
  s.readings = [
    {
      id: "stats",
      summary: { level: 5, stats: [20, 11, 9, 10, 12, 10] },
      evs: [0, 0, 0, 1, 0, 0],
    },
  ];
  const saved = storage();
  const original = JSON.stringify(s);
  saved.setItem(GUIDE_KEY, original);
  saved.setItem(GUIDE_LAB_KEY, "saved curtains and experiment answers");
  saved.setItem(AUTOSAVE_KEY, "separate advanced investigation");
  saved.setItem("other-setting", "unchanged");
  const fresh = resetGuideProgress(saved, s);
  assert.equal(fresh.step, 0);
  assert.equal(fresh.tid, "");
  assert.equal(fresh.confirmedSid, null);
  assert.equal(fresh.protectedSave, false);
  assert.deepEqual(fresh.readings, []);
  assert.equal(fresh.route, null);
  assert.equal(fresh.selected, null);
  assert.equal(fresh.battles.length, 1);
  assert.deepEqual(fresh.intro, s.intro);
  assert.deepEqual(fresh.starter, s.starter);
  assert.notEqual(fresh.intro, s.intro);
  assert.deepEqual(
    validateStarterGuide(JSON.parse(saved.getItem(GUIDE_KEY)!)),
    fresh,
  );
  assert.equal(saved.getItem(GUIDE_LAB_KEY), null);
  assert.equal(saved.getItem(AUTOSAVE_KEY), "separate advanced investigation");
  assert.equal(saved.getItem("other-setting"), "unchanged");
  assert.ok(saved.getItem(GUIDE_RESET_BACKUP_KEY));
  restoreGuideProgress(saved);
  assert.equal(saved.getItem(GUIDE_KEY), original);
  assert.equal(
    saved.getItem(GUIDE_LAB_KEY),
    "saved curtains and experiment answers",
  );
  assert.equal(saved.getItem(GUIDE_RESET_BACKUP_KEY), null);
  assert.equal(
    JSON.stringify(s),
    original,
    "reset never mutates the current session",
  );
});

test("a failed backup leaves the original guide and curtain evidence intact", () => {
  const saved = storage();
  saved.setItem(GUIDE_KEY, JSON.stringify(newStarterGuide()));
  saved.setItem(GUIDE_LAB_KEY, "curtains");
  const before = new Map(saved.data);
  assert.throws(
    () =>
      resetGuideProgress(
        {
          ...saved,
          setItem: () => {
            throw Error("storage full");
          },
        },
        newStarterGuide(),
      ),
    /storage full/,
  );
  assert.deepEqual(saved.data, before);
});

test("starting another shiny attempt clears only the previous attempt, retaining SID, target, calibration and investigation", () => {
  const s = newStarterGuide();
  s.step = 5;
  s.tid = "16780";
  s.confirmedSid = 26047;
  s.selected = {
    pid: 123,
    ivs: [1, 2, 3, 4, 5, 6],
    abilitySlot: 0,
    advance: 1206,
    lastAdvance: 1206,
    methods: ["Method1"],
    slot: -1,
    level: 5,
  } as RngSpread;
  s.identifiedStarter = s.selected;
  s.starter.calibration = 8;
  s.attemptDraft = { level: "5", stat_0: "20", stat_1: "12" };
  s.attemptNature = "3";
  s.attemptGender = "male";
  s.attemptAbility = "66";
  const original = structuredClone(s);
  const next = newShinyAttempt(s);
  assert.deepEqual(next.attemptDraft, { level: "5" });
  assert.equal(next.attemptNature, "");
  assert.equal(next.attemptGender, "");
  assert.equal(next.attemptAbility, starterAbility(s.species));
  assert.deepEqual(
    {
      ...next,
      attemptDraft: s.attemptDraft,
      attemptNature: s.attemptNature,
      attemptGender: s.attemptGender,
      attemptAbility: s.attemptAbility,
    },
    s,
  );
  assert.deepEqual(s, original);
  assert.deepEqual(validateStarterGuide(next), next);
});
