import test from "node:test";
import assert from "node:assert/strict";
import {
  checksumDifference,
  checksumValues,
  mod16,
  rankCombinedPixels,
  refineChecksumPayload,
  scoreOutcomes,
} from "../src/core/checksum";
import { experimentChecksumDelta } from "../src/core/checksumExperiments";
import {
  controlledActions,
  createControlledTest,
} from "../src/core/controlledExperiments";
import { createItemTest } from "../src/core/itemTests";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import {
  compileHypothesisValidator,
  makeHypothesis,
  solveSids,
} from "../src/core/sid";
import {
  checksumRankingExample,
  skarmoryPredictionExample,
} from "../scripts/deduction-examples";
import { PROFILE } from "../src/core/memory";

const nibbles = (byte: number, size: number) =>
  Array.from({ length: size * 2 }, (_, i) => byte * 2 + i);
test("held item and EXP checksum differences use unsigned words, carries and modulo overflow", () => {
  for (const before of [0, 15, 255, 65535])
    for (const after of [0, 1, 16, 65535])
      assert.equal(
        checksumDifference(
          { heldItem: before },
          { heldItem: after },
          nibbles(2, 2),
        ),
        mod16(after - before),
      );
  for (const before of [0xffff, 0x1ffff, 0xffffffff, 65520])
    for (const after of [0x10000, 0x20001, 0]) {
      const reference =
        ((after & 65535) +
          (after >>> 16) -
          (before & 65535) -
          (before >>> 16) +
          131072) %
        65536;
      assert.equal(
        checksumDifference(
          { experience: before },
          { experience: after },
          nibbles(4, 4),
        ),
        reference,
      );
    }
  assert.equal(checksumDifference({}, { heldItem: 1 }, nibbles(2, 2)), null);
});

test("all six move swaps account for word-preserving IDs, byte-weighted PP and packed counters", () => {
  const source = {
    ...newSnapshot("s", "Source", {
      moves: [1, 300, 400, 65535],
      pp: [10, 20, 30, 40],
      ppBonuses: 0x39,
      friendship: 70,
    }),
    summaryStats: { level: 10, stats: Array(6).fill(null) },
  };
  for (const action of controlledActions(source).filter(
    (a) => a.kind === "moves",
  )) {
    const target = createControlledTest(source, action.id, action, []);
    const before = source.knownFacts,
      after = target.knownFacts;
    const ppSum = (pp: (number | null)[]) =>
      pp.reduce<number>((n, v, i) => n + v! * (i % 2 ? 256 : 1), 0);
    const reference = mod16(
      ppSum(after.pp!) -
        ppSum(before.pp!) +
        after.ppBonuses! -
        before.ppBonuses!,
    );
    assert.equal(experimentChecksumDelta(source, target), reference);
    assert.equal(
      loadInvestigation(
        saveInvestigation({
          format: "emerald-curtain-investigation",
          schemaVersion: 1,
          mappingVersion: PROFILE.id,
          origin: "unknown",
          identity: { shiny: true },
          snapshots: [source, target],
          activeId: source.id,
          ownedItems: [],
        }),
      ).snapshots[1].itemTest!.actionId,
      action.id,
    );
  }
  const zero = {
    ...source,
    knownFacts: { ...source.knownFacts, ppBonuses: 0 },
  };
  const actions = controlledActions(zero);
  for (const id of ["moves-0-2", "moves-1-3"]) {
    assert.equal(
      experimentChecksumDelta(
        zero,
        createControlledTest(
          zero,
          id,
          actions.find((a) => a.id === id)!,
          [],
        ),
      ),
      0,
    );
  }
  const unknown = {
    ...zero,
    knownFacts: { ...zero.knownFacts, pp: [null, null, null, null] },
  };
  const unknownActions = controlledActions(unknown);
  assert.equal(
    experimentChecksumDelta(
      unknown,
      createControlledTest(
        unknown,
        "u",
        unknownActions.find((a) => a.id === "moves-0-1")!,
        [],
      ),
    ),
    null,
  );
  assert.equal(
    experimentChecksumDelta(
      unknown,
      createControlledTest(
        unknown,
        "u",
        unknownActions.find((a) => a.id === "moves-0-2")!,
        [],
      ),
    ),
    0,
  );
});

test("Rare Candy and vitamins fall back when side effects are unknown, and known friendship is weighted as the high byte", () => {
  const source = {
    ...newSnapshot("s", "Source", {
      moves: [1, 2, 3, 4],
      experience: 1000,
      evs: [0, 0, 0, 0, 0, 0],
      friendship: 70,
    }),
    summaryStats: { level: 10, stats: Array(6).fill(null) },
  };
  for (const action of controlledActions(source, 25).filter(
    (a) => a.kind !== "moves",
  )) {
    const target = createControlledTest(source, action.id, action, []);
    assert.equal(experimentChecksumDelta(source, target), null);
    target.knownFacts.friendship = 75;
    const main =
      action.kind === "candy"
        ? 1331 - 1000
        : 10 *
          (action.id.endsWith("1") ||
          action.id.endsWith("3") ||
          action.id.endsWith("5")
            ? 256
            : 1);
    assert.equal(
      experimentChecksumDelta(source, target),
      mod16(main + 5 * 256),
    );
  }
});

test("checksum column/carry supports and inferred payload digits match exhaustive independent word sums", () => {
  for (let seed = 0; seed < 8; seed++) {
    const plain = Array(96).fill(1),
      choices = [
        [0, 1, 15],
        [0, 7, 15],
        [1, 15],
        [0, 15],
      ],
      positions = [0, 4, 1, 95];
    for (let i = 0; i < choices.length; i++)
      plain[positions[i]] = choices[i].reduce((m, d) => m | (1 << d), 0);
    // Include FFFF words to exercise discarded final carries.
    for (let i = 8; i < 16; i++) plain[i] = 1 << 15;
    const accepted: { sum: number; values: number[] }[] = [];
    const masks = [seed & 1 ? 1 : 65534, 65535, 65535, 65535];
    const visit = (i: number, values: number[]) => {
      if (i < 4) {
        for (const d of choices[i]) visit(i + 1, [...values, d]);
        return;
      }
      const digits = plain.map((m) => 31 - Math.clz32(m));
      positions.forEach((p, n) => (digits[p] = values[n]));
      const bytes = Uint8Array.from(
        { length: 48 },
        (_, i) => digits[i * 2] | (digits[i * 2 + 1] << 4),
      );
      const view = new DataView(bytes.buffer);
      let sum = 0;
      for (let i = 0; i < 48; i += 2)
        sum = (sum + view.getUint16(i, true)) % 65536;
      if (masks.every((m, n) => m & (1 << ((sum >>> (n * 4)) & 15))))
        accepted.push({ sum, values });
    };
    visit(0, []);
    assert.deepEqual(
      checksumValues(plain, masks).sort((a, b) => a - b),
      [...new Set(accepted.map((a) => a.sum))].sort((a, b) => a - b),
    );
    const refined = refineChecksumPayload(plain, masks);
    positions.forEach((p, n) =>
      assert.equal(
        refined[p],
        accepted.reduce((m, a) => m | (1 << a.values[n]), 0),
      ),
    );
  }
});

test("combined experiment scoring improves the reproducible four-identity example without counting nuisance checksums as identities", () => {
  const r = checksumRankingExample(),
    old = r.previous.find((e) => e.item.id === 4)!,
    now = r.improved.find((e) => e.item.id === 4)!;
  assert.equal(r.candidates.length, 4);
  assert.equal(old.worstCase, 4);
  assert.equal(now.worstCase, 2);
  assert.equal(now.checksumContributes, true);
  assert.equal(r.previous[0].item.name, "REPEAT BALL");
  assert.equal(r.improved[0].item.id, 4);
  assert.ok(now.pixels.some((p) => p.index >= 72 && p.index < 76));
  assert.ok(
    r.candidates.some(
      (h) => h.sid === r.d.sid && h.rng!.ivs.join() === r.d.ivs.join(),
    ),
  );
  const same = rankCombinedPixels(
    [[{ index: 80, value: 1 }], [{ index: 80, value: 1 }]],
    [
      [1, 2, 3],
      [1, 2, 3],
    ],
    1,
  );
  assert.equal(same.worstCase, 2);
  assert.equal(same.informationGain, 0);
  assert.equal(same.checksumContributes, false);
  const redundant = rankCombinedPixels(
    [[{ index: 80, value: 0 }], [{ index: 80, value: 1 }]],
    [[0], [1]],
    0,
  );
  assert.equal(redundant.informationGain, 1);
  assert.equal(redundant.checksumContributes, false);
  assert.deepEqual(skarmoryPredictionExample(), {
    predicted: 74,
    black: 59,
    transparent: 15,
    mismatches: [],
    observed: 0,
  });
});

test("unknown baseline checksum stays relational across recorded snapshots, chains and JSON, with no fabricated checksum fact", () => {
  const a = newSnapshot("a", "A", { heldItem: 0 });
  a.observations[72] = 0; // C low digit zero.
  const b = createItemTest(a, "b", 1, []);
  b.itemTest = { ...b.itemTest!, phase: "recorded", changed: true };
  b.observations[72] = 0; // C+1 cannot also end in zero.
  const identity = { pid: 0, tid: 0 };
  assert.ok(
    solveSids(identity, [a], [0], undefined, Infinity, [0]).candidates.length,
  );
  assert.equal(
    solveSids(identity, [a, b], [0], undefined, Infinity, [0]).candidates
      .length,
    0,
  );
  assert.equal(
    compileHypothesisValidator(identity, [a, b])(makeHypothesis(0, 0, 0)),
    false,
  );
  assert.equal(a.knownFacts.checksum, undefined);
  assert.equal(b.knownFacts.checksum, undefined);
  b.observations[72] = 1;
  const c = createItemTest(b, "c", 16, []);
  c.itemTest = { ...c.itemTest!, phase: "recorded", changed: true };
  c.observations[72] = 0;
  const inv = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: PROFILE.id,
    origin: "unknown" as const,
    identity,
    snapshots: [a, b, c],
    activeId: "a",
    ownedItems: [],
  };
  assert.equal(
    solveSids(
      identity,
      loadInvestigation(saveInvestigation(inv)).snapshots,
      [0],
      undefined,
      Infinity,
      [0],
    ).candidates.length,
    1,
  );
  b.knownFacts.friendship = 50; // Unknown original friendship breaks exact delta.
  assert.equal(experimentChecksumDelta(a, b), null);
});

test("experiment targets omit nuisance and redundant pixels while preserving all joint candidate eliminations", () => {
  const outcomes = Array.from({ length: 4 }, (_, id) =>
    [0, 1].map((noise) => [
      { index: 72, value: noise },
      { index: 73, value: id & 1 },
      { index: 100, value: id >>> 1 },
      { index: 101, value: id >>> 1 },
    ]),
  );
  const scored = scoreOutcomes(outcomes);
  assert.ok(
    !scored.pixels.some((p) => p.index === 72),
    "nuisance checksum changes do not become questions",
  );
  assert.equal(
    scored.pixels.length,
    2,
    "duplicate encrypted question is removed",
  );
  const possibilities = Array.from({ length: 4 }, (_, bits) => [
    { index: 72, value: bits & 1 },
    { index: 100, value: bits >>> 1 },
  ]);
  for (let a = 1; a < 16; a++)
    for (let b = 1; b < 16; b++)
      for (let c = 1; c < 16; c++) {
        const supports = [a, b, c].map((mask) =>
          possibilities.filter((_, i) => mask & (1 << i)),
        );
        const targets = scoreOutcomes(supports).pixels.map((p) => p.index);
        for (const actual of supports.flat()) {
          const matches = (indices: number[]) =>
            supports.flatMap((patterns, id) =>
              patterns.some((pattern) =>
                indices.every(
                  (n) =>
                    pattern.find((p) => p.index === n)!.value ===
                    actual.find((p) => p.index === n)!.value,
                ),
              )
                ? [id]
                : [],
            );
          assert.deepEqual(matches(targets), matches([72, 100]));
        }
      }
});
