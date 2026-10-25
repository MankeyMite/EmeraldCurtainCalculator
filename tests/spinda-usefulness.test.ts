import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultSpindaMatcher,
  generateSpindaCandidates,
  validateSpindaMatcher,
  type SpindaCandidate,
} from "../src/core/spindaMatcher";
import {
  newSpindaSidGuide,
  spindaInfoPlaintext,
  spindaRngEvidence,
  spindaSidTargets,
} from "../src/core/spindaSidGuide";
import {
  usefulSpindaTargets,
  spindaUsefulness,
  spindaRemainingSids,
  sidCandidateMasks,
  testedSpindaDigits,
  spindaStatCandidate,
} from "../src/core/spindaUsefulness";
import { WILD_METHODS } from "../src/core/rng";
import { calculateStat } from "../src/core/stats";
import { speciesTraits } from "../src/core/traits";
import {
  loadInvestigation,
  saveInvestigation,
  newSnapshot,
} from "../src/core/investigation";
import { PROFILE } from "../src/core/memory";
import { SpindaSidGuide } from "../src/components/SpindaSidGuide";
import { computeDeduction } from "../src/core/deduction";
import { spindaTrainerFacts } from "../src/core/spindaUsefulness";
import { newPokemonFacts } from "../src/core/facts";
import { validateFacts } from "../src/core/session";

const full = [65535, 65535, 65535, 65535],
  untested = [0, 0, 0, 0];
test("catch transitions preserve only supplied trainer fields and remain valid without TID", () => {
  assert.deepEqual(
    spindaTrainerFacts({ species: 308, pid: 1, tid: undefined }),
    {},
  );
  const carried = spindaTrainerFacts({
    tid: 123,
    otGender: "female",
    ivs: [1, 2, 3, 4, 5, 6],
    pid: 1,
  });
  assert.deepEqual(carried, { tid: 123, otGender: "female" });
  assert.doesNotThrow(() =>
    validateFacts({ ...newPokemonFacts(), ...spindaTrainerFacts({}) }),
  );
});
function generated() {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 0;
  return generateSpindaCandidates(state)[0];
}

test("usefulness counts each position/candidate once and removes tested, excluded and solved digits", () => {
  const guide = {
    ...newSpindaSidGuide(0x12340000),
    freshZeros: true,
    paddingZero: true,
  };
  const targets = usefulSpindaTargets(guide, full, untested);
  assert.equal(
    targets.length,
    4,
    "repeated zero fields test the same four digits",
  );
  assert.deepEqual(
    targets.map((t) => t.candidate),
    [1, 2, 3, 4],
  );
  assert.equal(usefulSpindaTargets(guide, full, [0, 0, 0, 1 << 1]).length, 3);
  assert.equal(
    usefulSpindaTargets(
      guide,
      [65535, 65535, 65535, 65535 ^ (1 << 1)],
      untested,
    ).length,
    3,
  );
  assert.equal(
    usefulSpindaTargets(guide, [65535, 65535, 65535, 1 << 1], untested).length,
    3,
  );
  guide.observations[targets[0].nibble] = 1;
  const tested = testedSpindaDigits(guide);
  assert.deepEqual(tested, [0, 0, 0, 1 << 1]);
  assert.equal(usefulSpindaTargets(guide, full, tested).length, 3);
});

test("H1/H2/H4 counts match an independent Origins/IV nibble oracle for the selected ball", () => {
  const candidate = generated();
  const remaining = [0xfffe, 0xffff, 0xfff7, 0xffff],
    tested = [2, 4, 8, 16];
  const result = spindaUsefulness(candidate, remaining, tested, "female");
  for (const method of WILD_METHODS) {
    const expected = new Set<string>();
    for (const encounter of candidate.encounters.filter((e) =>
      e.methods.includes(method),
    )) {
      const word =
        (encounter.ivs.reduce((v, iv, i) => v | (iv << (5 * i)), 0) |
          (encounter.abilitySlot << 31)) >>>
        0;
      const origins =
        encounter.level | (3 << 7) | (result.ball << 11) | (1 << 15);
      for (let position = 0; position < 4; position++) {
        const pid = (candidate.pid >>> (16 + position * 4)) & 15;
        for (const plain of [
          0,
          (origins >>> (position * 4)) & 15,
          (word >>> (16 + position * 4)) & 15,
        ]) {
          const digit = plain ^ pid,
            bit = 1 << digit;
          if (remaining[position] & bit && !(tested[position] & bit))
            expected.add(`${position}:${digit}`);
        }
      }
    }
    assert.equal(result.counts[method], expected.size, method);
  }
  const exhausted = spindaUsefulness(candidate, full, full, "female");
  assert.deepEqual(exhausted.counts, { H1: 0, H2: 0, H4: 0 });
  assert.equal(exhausted.suggested, false);
  assert.equal(exhausted.ball, 4);
});

test("a ball is suggested only when its Origins nibble tests an additional untested candidate", () => {
  const candidate = generated(),
    result = spindaUsefulness(candidate, full, untested, "male");
  assert.ok(result.suggested);
  assert.ok(![1, 4, 5].includes(result.ball));
  const guide = {
    ...newSpindaSidGuide(candidate.pid),
    freshZeros: true,
    paddingZero: true,
  };
  const keys = (ball: number) =>
    new Set(
      candidate.encounters.flatMap((encounter) => {
        const rng = spindaRngEvidence(candidate.pid, {
          pid: candidate.pid,
          encounters: [encounter],
        })!;
        return usefulSpindaTargets(
          guide,
          full,
          untested,
          spindaInfoPlaintext({
            species: 308,
            metGame: 3,
            metLevel: encounter.level,
            ball,
            otGender: "male",
          }),
          rng.masks,
        ).map((t) => `${t.digit}:${t.candidate}`);
      }),
    );
  const baseline = keys(4);
  assert.ok([...keys(result.ball)].some((key) => !baseline.has(key)));
});

test("stats select whole method spreads and the guide shows exact IV plaintext only", () => {
  const candidate = generated(),
    spread = candidate.encounters[0];
  const traits = speciesTraits(308)!;
  const summary = {
    level: 100,
    stats: spread.ivs.map((iv, i) =>
      calculateStat(
        traits.summaryBaseStats[i],
        iv,
        0,
        100,
        i,
        candidate.pid % 25,
      ),
    ),
  };
  const facts = { species: 308, evs: [0, 0, 0, 0, 0, 0] };
  const filtered = spindaStatCandidate(candidate, facts, summary)!;
  assert.ok(filtered.encounters.length < candidate.encounters.length);
  assert.ok(
    filtered.encounters.every((e) => e.ivs.join() === spread.ivs.join()),
  );
  const guide = newSpindaSidGuide(candidate.pid),
    info = spindaInfoPlaintext(facts);
  const before = spindaRngEvidence(candidate.pid, candidate, info)!;
  const after = spindaRngEvidence(candidate.pid, filtered, info)!;
  const initial = usefulSpindaTargets(
    guide,
    full,
    untested,
    info,
    before.masks,
  ).filter((t) => t.field.includes("IVs"));
  const resolved = usefulSpindaTargets(
    guide,
    full,
    untested,
    info,
    after.masks,
  ).filter((t) => t.field.includes("IVs"));
  assert.ok(resolved.length > initial.length);
});

test("remaining SID candidates retain correlated IV words across catches and backup restore", () => {
  const candidate: SpindaCandidate = {
    pid: 0,
    encounters: [
      { ...generated().encounters[0], pid: 0, ivs: [0, 0, 0, 0, 0, 0] },
      { ...generated().encounters[0], pid: 0, ivs: [0, 0, 0, 2, 1, 0] },
    ],
  };
  const guide = newSpindaSidGuide(0);
  for (const digit of [3, 4] as const)
    guide.observations[spindaSidTargets(0, digit)[10].nibble] = 0;
  const rng = spindaRngEvidence(0, candidate)!;
  const sids = spindaRemainingSids(
    guide,
    undefined,
    full,
    undefined,
    rng.plaintexts,
  );
  assert.ok(sids.includes(0));
  assert.ok(sids.includes(0x11));
  assert.ok(!sids.includes(1));
  assert.ok(!sids.includes(0x10), "no mixing IV nibbles from separate words");
  const state = {
    ...defaultSpindaMatcher(),
    sidProgress: { remainingSids: sids, tested: [1, 2, 4, 8] },
  };
  const restored = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      identity: {},
      snapshots: [newSnapshot("base", "Spinda")],
      activeId: "base",
      origin: "wild",
      ownedItems: [],
      spindaMatcher: state,
    }),
  );
  assert.deepEqual(restored.spindaMatcher?.sidProgress, state.sidProgress);
  assert.throws(
    () =>
      validateSpindaMatcher({
        ...state,
        sidProgress: { tested: [-1, 0, 0, 0] },
      }),
    /progress/,
  );
  assert.throws(
    () =>
      validateSpindaMatcher({
        ...state,
        sidProgress: { tested: untested, remainingSids: [65536] },
      }),
    /progress/,
  );
  assert.deepEqual(sidCandidateMasks([]), [0, 0, 0, 0]);
});

test("main deduction respects carried exact SID candidates, including an empty result", () => {
  const snapshot = newSnapshot("base", "Next Spinda");
  const input = {
    identity: { species: 308, pid: 0, tid: 123 },
    snapshots: [snapshot],
    activeId: "base",
    sidCandidates: [0x1234, 0xabcd],
  };
  assert.deepEqual(
    computeDeduction(input).sidAnalysis?.sidValues,
    input.sidCandidates,
  );
  assert.deepEqual(
    computeDeduction({ ...input, sidCandidates: [] }).sidAnalysis?.sidValues,
    [],
  );
});

test("the guide highlights unique useful pixels and shows plaintext without the removed warnings", () => {
  const guide = { ...newSpindaSidGuide(0x12340000), freshZeros: true };
  const html = renderToStaticMarkup(
    createElement(SpindaSidGuide, {
      value: guide,
      onChange: () => {},
      onNext: () => {},
    }),
  );
  assert.equal((html.match(/class="target/g) ?? []).length, 1);
  assert.ok(html.includes("Plaintext <code>0</code>"));
  assert.ok(html.includes("Catch next Spinda"));
  assert.ok(!html.includes("estimated PID"));
});
