import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { allowedValues } from "../src/core/constraints";
import {
  defaultSpindaMatcher,
  generateSpindaCandidates,
  type SpindaCandidate,
} from "../src/core/spindaMatcher";
import {
  guidePlaintextDetails,
  guidePlaintextMask,
  newSpindaSidGuide,
  sidDigitMaskForPlaintext,
  spindaInfoPlaintext,
  spindaRngEvidence,
  spindaSidMasks,
  spindaSidTargets,
} from "../src/core/spindaSidGuide";
import { SpindaSidGuide } from "../src/components/SpindaSidGuide";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { PROFILE } from "../src/core/memory";

const candidate = (pid: number, ...ivs: number[][]): SpindaCandidate => ({
  pid,
  encounters: ivs.map((v, i) => ({
    pid,
    ivs: v,
    abilitySlot: 0,
    advance: i,
    lastAdvance: i,
    methods: ["H1"],
    slot: 0,
    level: 16,
  })),
});

test("generated encounter IVs supply every SID packed nibble across all permutations without caught data", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 0;
  const allMethods = generateSpindaCandidates(state)[0];
  const allEvidence = spindaRngEvidence(allMethods.pid, allMethods)!;
  assert.deepEqual(
    new Set(allMethods.encounters.flatMap((e) => e.methods)),
    new Set(["H1", "H2", "H4"]),
  );
  assert.deepEqual(
    new Set(allEvidence.ivs.map((ivs) => ivs.join(","))),
    new Set(allMethods.encounters.map((e) => e.ivs.join(","))),
  );
  assert.ok(
    allEvidence.ivs.length > 1,
    "different method spreads must remain alternatives",
  );
  state.settings.methods = ["H1"];
  const found = generateSpindaCandidates(state)[0];
  assert.ok(found);
  assert.equal(found.encounters[0].advance, 0);
  const evidence = spindaRngEvidence(found.pid, found)!;
  assert.equal(evidence.ivs.length, 1);
  assert.deepEqual(evidence.ivs[0], found.encounters[0].ivs);
  for (let pid = 0; pid < 24; pid++) {
    const encounter = {
      ...found,
      pid,
      encounters: found.encounters.map((e) => ({ ...e, pid })),
    };
    const rng = spindaRngEvidence(pid, encounter)!;
    const guide = newSpindaSidGuide(pid),
      sid = 0xabcd;
    const word =
      (encounter.encounters[0].ivs.reduce(
        (v, iv, i) => v | (iv * 2 ** (i * 5)),
        0,
      ) +
        encounter.encounters[0].abilitySlot * 2 ** 31) >>>
      0;
    for (const digit of [1, 2, 3, 4] as const) {
      const t = spindaSidTargets(pid, digit)[10];
      const expected = (word >>> ((t.logicalNibble - 80) * 4)) & 15;
      assert.deepEqual(guidePlaintextDetails(guide, t, undefined, rng.masks), {
        value: expected,
        source: "rng",
      });
      const keyDigit = ((sid >>> ((4 - digit) * 4)) & 15) ^ t.pidDigit;
      guide.observations[t.nibble] = Number(expected !== keyDigit) as 0 | 1;
    }
    spindaSidMasks(guide, undefined, rng.plaintexts).forEach((mask, i) =>
      assert.ok(mask & (1 << ((sid >>> ((3 - i) * 4)) & 15))),
    );
    assert.deepEqual(guide.plaintext, {});
  }
});

test("multiple IV spreads preserve alternatives and interpret black answers existentially", () => {
  const guide = newSpindaSidGuide(0);
  const rng = spindaRngEvidence(
    0,
    candidate(0, [0, 0, 0, 0, 0, 0], [0, 0, 0, 2, 1, 0]),
  )!;
  const target = spindaSidTargets(0, 4)[10];
  assert.equal(
    guidePlaintextDetails(guide, target, undefined, rng.masks).value,
    undefined,
  );
  assert.deepEqual(
    allowedValues(guidePlaintextMask(guide, target, undefined, rng.masks)),
    [0, 1],
  );
  guide.observations[target.nibble] = 0;
  assert.deepEqual(
    allowedValues(spindaSidMasks(guide, undefined, rng.plaintexts)[3]),
    [0, 1],
  );
  guide.observations[target.nibble] = 1;
  assert.equal(spindaSidMasks(guide, undefined, rng.plaintexts)[3], 65535);
  assert.equal(sidDigitMaskForPlaintext(0, 3, 1), 65535);
});

test("guide answers and manual digit limits reject whole incompatible IV words", () => {
  const guide = newSpindaSidGuide(0);
  const rng = spindaRngEvidence(
    0,
    candidate(0, [0, 0, 0, 0, 0, 0], [0, 0, 0, 2, 1, 0]),
  )!;
  for (const d of [3, 4] as const)
    guide.observations[spindaSidTargets(0, d)[10].nibble] = 0;
  const masks = spindaSidMasks(
    guide,
    undefined,
    rng.plaintexts,
    [65535, 1, 65535, 65535],
  );
  assert.deepEqual(allowedValues(masks[2]), [0]);
  assert.deepEqual(
    allowedValues(masks[3]),
    [0],
    "S3=0 must exclude the entire other spread, including its S4=1",
  );
});

test("entered IV constraints, manual overrides and explicit unknown retain precedence without mutation", () => {
  const found = candidate(0, [0, 0, 0, 0, 0, 0], [0, 0, 0, 2, 1, 0]);
  const facts = { species: 308, ivs: [null, null, null, 2, null, null] };
  const before = structuredClone({ facts, found });
  const info = spindaInfoPlaintext(facts),
    rng = spindaRngEvidence(0, found, info)!;
  assert.deepEqual(rng.ivs, [[0, 0, 0, 2, 1, 0]]);
  const guide = newSpindaSidGuide(0),
    target = spindaSidTargets(0, 3)[10];
  assert.equal(guidePlaintextDetails(guide, target, info, rng.masks).value, 1);
  guide.plaintext[target.logicalNibble] = 7;
  assert.deepEqual(guidePlaintextDetails(guide, target, info, rng.masks), {
    value: 7,
    source: "manual",
  });
  guide.plaintext[target.logicalNibble] = -1;
  assert.equal(guidePlaintextMask(guide, target, info, rng.masks), 65535);
  assert.deepEqual({ facts, found }, before);
  const conflict = spindaRngEvidence(
    0,
    found,
    spindaInfoPlaintext({ species: 308, isEgg: 1 }),
  )!;
  assert.equal(conflict.plaintexts.length, 0);
  assert.deepEqual(
    spindaSidMasks(guide, undefined, conflict.plaintexts),
    [0, 0, 0, 0],
  );
});

test("guide UI shows conditional IVs and uses them in the dropdown and SID answers, dropping missing or mismatched scope", () => {
  const guide = newSpindaSidGuide(0),
    target = spindaSidTargets(0, 1)[10];
  guide.observations[target.nibble] = 0;
  const found = candidate(0, [0, 0, 0, 0, 0, 0]);
  const render = (rngCandidate?: SpindaCandidate, infoError?: boolean) =>
    renderToStaticMarkup(
      createElement(SpindaSidGuide, {
        value: guide,
        onChange: () => {},
        rngCandidate,
        infoError,
        rngStatus: "No current complete RNG results.",
      }),
    );
  const html = render(found);
  assert.match(html, /Encounter IVs for this exact PID/);
  assert.match(html, /1 possible IV spread/);
  assert.match(html, /0x0\?\?\?/);
  assert.match(html, /Conditional on the estimated PID/);
  assert.match(html, /Packed IVs \/ flags, byte 4/);
  assert.match(render(), /0x\?\?\?\?/);
  assert.doesNotMatch(render(), /Encounter IVs for this exact PID/);
  assert.doesNotMatch(
    render({ ...found, pid: 1 }),
    /Encounter IVs for this exact PID/,
  );
  assert.doesNotMatch(render(found, true), /Encounter IVs for this exact PID/);
  const ambiguous = render(
    candidate(0, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 8]),
  );
  assert.match(ambiguous, /2 possible IV spread/);
  assert.match(ambiguous, /2 possible<\/small>/);
});

test("saved guide and RNG scope recompute IV evidence without persisting it as a manual fact", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 0;
  state.settings.methods = ["H1"];
  state.pid = generateSpindaCandidates(state)[0].pid;
  state.guide = newSpindaSidGuide(state.pid);
  const snapshot = newSnapshot("base", "Original");
  const investigation = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: PROFILE.id,
    identity: {},
    snapshots: [snapshot],
    activeId: snapshot.id,
    origin: "unknown" as const,
    ownedItems: [],
    spindaMatcher: state,
  };
  const loaded = loadInvestigation(saveInvestigation(investigation));
  const restored = loaded.spindaMatcher!;
  assert.deepEqual(
    spindaRngEvidence(
      restored.guide!.pid,
      generateSpindaCandidates(restored)[0],
    ),
    spindaRngEvidence(state.pid, generateSpindaCandidates(state)[0]),
  );
  assert.deepEqual(loaded.identity, {});
  assert.deepEqual(restored.guide!.plaintext, {});
  assert.ok(loaded.snapshots[0].observations.every((n) => n === -1));
  assert.equal(spindaRngEvidence(state.pid, undefined), undefined);
});
