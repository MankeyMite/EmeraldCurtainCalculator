import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeDeduction } from "../src/core/deduction";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
} from "../src/core/investigation";
import { emptyObservations } from "../src/core/constraints";
import {
  validateSidDigitFilters,
  sidAllowed,
  allowedSidValues,
} from "../src/core/sidDigitFilters";
import { SidDigitControls } from "../src/components/SidDigitControls";
import { SpindaSidGuide } from "../src/components/SpindaSidGuide";
import { newSpindaSidGuide } from "../src/core/spindaSidGuide";
import {
  defaultSpindaMatcher,
  generateSpindaCandidates,
} from "../src/core/spindaMatcher";
import { PROFILE } from "../src/core/memory";
import { readAutosave } from "../src/core/autosave";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

test("manual SID digit masks follow displayed S1–S4 positions, validate input and allow reversible exclusions", () => {
  const masks = [1 << 4, 1 << 3, 1 << 2, (1 << 1) | (1 << 2)];
  assert.deepEqual(allowedSidValues(masks), [0x1234, 0x2234]);
  assert.ok(sidAllowed(0x1234, masks));
  assert.ok(!sidAllowed(0x1235, masks));
  assert.equal(allowedSidValues(undefined), undefined);
  assert.equal(allowedSidValues([65535, 65535, 65535, 65535]), undefined);
  assert.deepEqual(allowedSidValues([0, 65535, 65535, 65535]), []);
  const copy = validateSidDigitFilters(masks);
  copy[0] = 0;
  assert.equal(masks[0], 16);
  for (const invalid of [
    [],
    [1, 2, 3],
    [-1, 1, 1, 1],
    [65536, 1, 1, 1],
    [0.5, 1, 1, 1],
    "1234",
  ])
    assert.throws(
      () => validateSidDigitFilters(invalid),
      /four SID digit masks/,
    );
});

test("SID digit exclusions affect recovery and experiment rankings without changing entered facts or observations", () => {
  const snapshot = newSnapshot("original", "Original", { heldItem: 0 }),
    identity = { pid: 0, tid: 0, species: 25 };
  const input = {
      identity,
      snapshots: [snapshot],
      activeId: snapshot.id,
      sidDigitFilters: [6, 1, 1, 1],
    },
    before = structuredClone(input);
  const initial = computeDeduction(input);
  assert.deepEqual(initial.sidAnalysis!.sidValues, [1, 2]);
  assert.ok(initial.experiments.some((e) => e.groups > 1));
  const limited = computeDeduction({ ...input, sidDigitFilters: [4, 1, 1, 1] });
  assert.deepEqual(limited.sidAnalysis!.sidValues, [2]);
  assert.equal(limited.experiments.length, 0);
  assert.equal(limited.experimentStatus, "indistinguishable");
  assert.deepEqual(input, before);
  assert.deepEqual(
    computeDeduction(input).sidAnalysis!.sidValues,
    [1, 2],
    "turning the digit back on restores the candidate",
  );
  const noSid = computeDeduction({ ...input, sidDigitFilters: [0, 1, 1, 1] });
  assert.equal(noSid.experimentStatus, "inconsistent");
  assert.equal(noSid.sidAnalysis!.candidates.length, 0);
});

test("wild RNG and new-game SID scopes honor manual SID digits before ranking", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 0;
  state.settings.methods = ["H1"];
  const candidate = generateSpindaCandidates(state)[0],
    snapshot = newSnapshot("base", "Original", { heldItem: 0 });
  const input = {
    identity: { pid: candidate.pid, tid: 9918, species: 308 },
    snapshots: [snapshot],
    activeId: snapshot.id,
    rng: state.settings,
    sidDigitFilters: [6, 1, 1, 1],
  };
  const result = computeDeduction(input);
  assert.deepEqual(result.sidAnalysis!.sidValues, [1, 2]);
  assert.equal(result.wildResult!.spreads.length, 1);
  const blocked = computeDeduction({ ...input, sidDigitFilters: [0, 1, 1, 1] });
  assert.equal(blocked.wildResult!.spreads.length, 0);
  const scoped = computeDeduction({
    ...input,
    sidRng: { minAdvance: 1, maxAdvance: 100 },
  });
  assert.ok(
    scoped.sidRows.every((r) => sidAllowed(r.sid, input.sidDigitFilters)),
  );
  assert.ok(
    scoped.sidAnalysis!.sidValues.every((sid) =>
      sidAllowed(sid, input.sidDigitFilters),
    ),
  );
});

test("SID digit limits constrain symbolic inference before TID/PID and survive JSON/autosave", () => {
  const snapshot = newSnapshot("base", "Original"),
    filters = [1 << 4, 1 << 3, 1 << 2, 1 << 1];
  const result = computeDeduction({
    identity: {},
    snapshots: [snapshot],
    activeId: snapshot.id,
    sidDigitFilters: filters,
  });
  assert.deepEqual(result.inference.masks.slice(12, 16), filters);
  const investigation = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: PROFILE.id,
    identity: {},
    snapshots: [snapshot],
    activeId: snapshot.id,
    origin: "unknown" as const,
    ownedItems: [],
    sidDigitFilters: filters,
  };
  const json = saveInvestigation(investigation);
  assert.deepEqual(loadInvestigation(json), investigation);
  assert.deepEqual(readAutosave({ getItem: () => json }), investigation);
  const { sidDigitFilters, ...legacy } = investigation;
  assert.equal(
    loadInvestigation(saveInvestigation(legacy)).sidDigitFilters,
    undefined,
  );
  assert.ok(snapshot.observations.every((p) => p === -1));
});

test("SID controls display individual hex toggles, reset controls and a shared-trainer explanation", () => {
  const lab = {
    sidDigitFilters: [65535, 65535, 65535, 65535 ^ (1 << 10)],
    facts: {},
    inference: { masks: Array(160).fill(65535) },
  } as unknown as CurtainLab;
  const html = renderToStaticMarkup(createElement(SidDigitControls, { lab }));
  assert.match(html, /Allow A for SID S1" aria-pressed="false"/);
  assert.match(html, /Allow A for SID S4" aria-pressed="true"/);
  assert.match(html, /Clear all manual SID digit limits/);
  assert.match(html, /same original trainer/);
  const guide = newSpindaSidGuide(0);
  const guideHtml = renderToStaticMarkup(
    createElement(SpindaSidGuide, {
      value: guide,
      onChange: () => {},
      sidDigitFilters: [1 << 4, 1 << 3, 1 << 2, 1 << 1],
    }),
  );
  assert.match(guideHtml, /0x1234/);
  assert.ok(guideHtml.includes("0 useful pixels"));
  assert.equal((guideHtml.match(/class="target/g) ?? []).length, 0);
});
