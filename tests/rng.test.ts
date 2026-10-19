import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  advanceSeed,
  nextSeed,
  scanWildSpreads,
  validateRngSettings,
  parseRngNumber,
  type RngSettings,
  WILD_AREAS,
} from "../src/core/rng";
import { searchWild } from "../src/core/rngSearch";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { decodePokemon } from "../src/core/pokemon";
import { solveSids, projectRecord } from "../src/core/sid";
import {
  createItemTest,
  answerItemTest,
  isRecorded,
} from "../src/core/itemTests";
import { rankItemExperiments } from "../src/core/experiments";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WildRngPanel } from "../src/components/WildRngPanel";
import type { CurtainLab } from "../src/hooks/useCurtainLab";
import { generateSidRng, intersectSidCandidates } from "../src/core/sidRng";

const settings: RngSettings = {
  seed: 0,
  minAdvance: 0,
  maxAdvance: 99,
  methods: ["H1", "H2", "H4"],
  areaId: "MAP_ROUTE101:land",
  lead: "none",
  synchronizeNature: 0,
};
test("LCG uses unsigned 32-bit arithmetic and jumps to inclusive advance bounds", () => {
  assert.equal(
    new Set(WILD_AREAS.map((a) => a.id)).size,
    WILD_AREAS.length,
    "alternate encounter tables must remain independently selectable",
  );
  let seed = 0;
  for (let i = 0; i < 10000; i++) {
    const expected = Number(
      (BigInt(seed) * 0x41c64e6dn + 0x6073n) & 0xffffffffn,
    );
    assert.equal(nextSeed(seed), expected);
    if (i % 137 === 0) assert.equal(advanceSeed(0, i), seed);
    seed = expected;
  }
  assert.equal(advanceSeed(0, 0), 0);
  assert.equal(advanceSeed(0, 0x100000000), 0);
  assert.equal(parseRngNumber("0xFFFFFFFF"), 0xffffffff);
  assert.throws(() => parseRngNumber(""));
  assert.throws(() =>
    validateRngSettings({ ...settings, minAdvance: 20, maxAdvance: 19 }),
  );
  assert.throws(() =>
    validateRngSettings({ ...settings, maxAdvance: 1000000 }),
  );
  assert.throws(() => validateRngSettings({ ...settings, methods: [] }));
});

// Numeric golden outputs from PokeFinder Test/Gen3/wild3.json; its IV order is
// HP/Atk/Def/SpA/SpD/Spe, reordered here to the application's HP/Atk/Def/Spe/SpA/SpD.
// https://github.com/Admiral-Fish/PokeFinder/blob/master/Test/Gen3/wild3.json
test("Emerald Method H matches independent H1, H2 Synchronize and H4 Cute Charm golden vectors", () => {
  for (const vector of [
    {
      seed: 477218588,
      method: "H1",
      lead: "none",
      expected: [
        { pid: 1012584442, ivs: [12, 31, 4, 20, 27, 8], slot: 3, level: 21 },
        { pid: 93172815, ivs: [10, 18, 15, 29, 7, 0], slot: 6, level: 19 },
      ],
    },
    {
      seed: 954437176,
      method: "H2",
      lead: "synchronize",
      expected: [
        { pid: 3691093611, ivs: [4, 18, 26, 24, 23, 8], slot: 4, level: 19 },
        { pid: 933109623, ivs: [13, 28, 4, 18, 27, 15], slot: 1, level: 20 },
      ],
    },
    {
      seed: 1431655764,
      method: "H4",
      lead: "cuteCharmF",
      expected: [
        { pid: 2018095781, ivs: [4, 26, 17, 4, 2, 21], slot: 7, level: 19 },
        { pid: 2018095781, ivs: [4, 26, 17, 4, 2, 21], slot: 5, level: 21 },
      ],
    },
  ] as const) {
    for (let advance = 0; advance < 2; advance++) {
      const rows = scanWildSpreads(
        {
          ...settings,
          seed: vector.seed,
          minAdvance: advance,
          maxAdvance: advance,
          methods: [vector.method],
          lead: vector.lead,
          areaId: "MAP_ROUTE111:land",
        },
        {},
        [newSnapshot("first", "Before")],
      );
      assert.equal(rows.length, 1);
      assert.deepEqual(
        {
          pid: rows[0].pid,
          ivs: rows[0].ivs,
          slot: rows[0].slot,
          level: rows[0].level,
        },
        vector.expected[advance],
      );
      assert.equal(rows[0].advance, advance);
    }
  }
});

test("all three methods preserve PID/IV correlation and summary-stat/trait/header filters", () => {
  const area = WILD_AREAS.find((a) => a.id === settings.areaId)!;
  const all = scanWildSpreads({ ...settings, maxAdvance: 1000 }, {}, [
    newSnapshot("first", "Before"),
  ]);
  const original = all.find((s) => s.methods.includes("H1"))!;
  const species = area.slots[original.slot].species;
  const one = newSnapshot("first", "Before", { evs: [0, 0, 0, 0, 0, 0] });
  const filtered = scanWildSpreads(
    { ...settings, maxAdvance: 1000 },
    { species, pid: original.pid, ivs: original.ivs },
    [one],
  );
  assert.ok(
    filtered.some(
      (s) => s.pid === original.pid && s.ivs.join() === original.ivs.join(),
    ),
  );
  assert.ok(filtered.every((s) => s.ivs.join() === original.ivs.join()));
  assert.deepEqual(
    scanWildSpreads(
      { ...settings, maxAdvance: 1000 },
      { species, pid: original.pid, nature: ((original.pid % 25) + 1) % 25 },
      [one],
    ),
    [],
  );
  one.observations[16] = (original.pid & 15) === 0 ? 1 : 0;
  assert.deepEqual(
    scanWildSpreads(
      { ...settings, maxAdvance: 1000 },
      { species, pid: original.pid },
      [one],
    ),
    [],
  );
  assert.throws(
    () => scanWildSpreads(settings, { metGame: 2 }, [one]),
    /Emerald origins/,
  );
});

test("optimized RNG SID enumeration equals the independent full-SID path and projects generated IVs", () => {
  const rows = scanWildSpreads({ ...settings, maxAdvance: 0 }, {}, [
    newSnapshot("first", "Before"),
  ]);
  const spread = rows[0],
    identity = { tid: 40492, ivs: spread.ivs };
  const snapshot = newSnapshot("first", "Before");
  const expected = solveSids(
    { ...identity, pid: spread.pid },
    [snapshot],
    [spread.pid],
  );
  const actual = solveSids(
    identity,
    [snapshot],
    [spread.pid],
    [spread],
    200000,
  );
  assert.deepEqual(actual.sidValues, expected.sidValues);
  assert.equal(actual.candidates.length, expected.candidates.length);
  const projected = projectRecord(identity, snapshot, actual.candidates);
  assert.ok(projected.plaintext.slice(80, 87).some((m) => m !== 0xffff));
  const disagree = spread.ivs.slice();
  disagree[0] = (disagree[0] + 1) % 32;
  assert.equal(
    solveSids({ tid: 40492, ivs: disagree }, [snapshot], [spread.pid], [spread])
      .candidates.length,
    0,
  );
});

test("seed 0 wild search derives the reviewed Poochyena PID and all six IVs without supplying either", () => {
  const investigation = loadInvestigation(
    readFileSync(
      "research/fixtures/poochyena-review-investigation.json",
      "utf8",
    ),
  );
  assert.equal(investigation.identity.pid, undefined);
  assert.equal(investigation.identity.ivs, undefined);
  const input = {
    settings: { ...settings, maxAdvance: 99999 },
    identity: investigation.identity,
    snapshots: investigation.snapshots,
  };
  const result = searchWild(input);
  const reference = decodePokemon(
    new Uint8Array(readFileSync("research/fixtures/poochyena-test.ek3")),
  );
  assert.equal(result.spreads.length, 1);
  assert.equal(result.spreads[0].pid, reference.pid);
  assert.deepEqual(result.spreads[0].ivs, reference.ivs);
  assert.equal(result.spreads[0].advance, 603);
  assert.deepEqual(result.spreads[0].methods, ["H2"]);
  assert.ok(
    result.analysis?.candidates.some(
      (h) => h.pid === reference.pid && h.sid === reference.sid,
    ),
  );
  const exhaustive = solveSids(
    {
      ...input.identity,
      pid: result.spreads[0].pid,
      ivs: result.spreads[0].ivs,
    },
    input.snapshots,
    [result.spreads[0].pid],
  );
  assert.deepEqual(
    result.analysis!.sidValues,
    exhaustive.sidValues,
    "key-domain optimization must agree with exhaustive SID checking on encrypted real observations",
  );
  const withoutTid = { ...input.identity };
  delete withoutTid.tid;
  const noTid = searchWild({
    ...input,
    identity: withoutTid,
    settings: { ...input.settings, maxAdvance: 9999 },
  });
  assert.equal(noTid.analysis, null);
  assert.ok(
    noTid.spreads.some(
      (s) => s.pid === reference.pid && s.ivs.join() === reference.ivs.join(),
    ),
    "PID/IV searching itself does not require TID",
  );
  assert.ok(
    rankItemExperiments(result.analysis!.candidates).some(
      (item) => item.groups > 1,
    ),
  );
  const wider = searchWild({
    ...input,
    settings: { ...settings, maxAdvance: 999999 },
  });
  const sidRng = { minAdvance: 1, maxAdvance: 3600 };
  const combined = searchWild({ ...input, sidRng });
  const intersection = intersectSidCandidates(
    result.analysis!,
    generateSidRng(input.identity.tid!, sidRng),
  );
  assert.deepEqual(
    combined.analysis!.candidates,
    intersection.analysis!.candidates,
    "SID timing scope filters actual correlated wild hypotheses before applying the candidate limit",
  );
  assert.ok(combined.analysis!.sidValues.includes(reference.sid));
  assert.ok(
    combined.analysis!.candidates.length < result.analysis!.candidates.length,
  );
  assert.equal(result.analysis!.candidates.length, 144);
  assert.equal(combined.analysis!.candidates.length, 9);
  assert.equal(result.analysis!.candidates.length, 144);
  assert.equal(combined.analysis!.candidates.length, 9);
  assert.equal(
    new Set(wider.spreads.map((s) => s.pid)).size,
    2,
    "widening scope retains the second compatible PID instead of selecting the first",
  );
  const wrong = searchWild({
    ...input,
    settings: { ...settings, minAdvance: 604, maxAdvance: 610 },
  });
  assert.equal(wrong.spreads.length, 0);
  assert.equal(wrong.analysis?.candidates.length, 0);
  const restored = loadInvestigation(
    saveInvestigation({
      ...investigation,
      origin: "wild",
      rng: input.settings,
    }),
  );
  assert.deepEqual(restored.rng, input.settings);
  assert.equal(restored.identity.pid, undefined);
  assert.equal(restored.identity.ivs, undefined);
  assert.throws(
    () =>
      loadInvestigation(
        JSON.stringify({ ...restored, rng: { ...settings, seed: -1 } }),
      ),
    /Seed and advances/,
  );
});

test("pending item drafts do not constrain the RNG search, while recorded No results do", () => {
  const investigation = loadInvestigation(
    readFileSync(
      "research/fixtures/poochyena-review-investigation.json",
      "utf8",
    ),
  );
  const source = investigation.snapshots[0];
  const input = {
    settings: { ...settings, maxAdvance: 9999 },
    identity: investigation.identity,
    snapshots: [source],
  };
  const initial = searchWild(input);
  const recommendation = rankItemExperiments(initial.analysis!.candidates).find(
    (e) => e.groups > 1,
  )!;
  const draft = createItemTest(
    source,
    "pending",
    recommendation.item.id,
    recommendation.pixels.map((p) => p.index),
  );
  draft.observations[16] = source.observations[16] === 0 ? 1 : 0;
  const pending = searchWild({ ...input, snapshots: [source, draft] });
  assert.deepEqual(pending.spreads, initial.spreads);
  assert.deepEqual(pending.analysis?.sidValues, initial.analysis?.sidValues);
  const no = answerItemTest(draft, source, false);
  const recorded = searchWild({ ...input, snapshots: [source, no] });
  assert.ok(
    recorded.analysis!.candidates.length < initial.analysis!.candidates.length,
  );
  assert.ok(
    recorded.spreads.every((s) =>
      initial.spreads.some(
        (before) => before.pid === s.pid && before.ivs.join() === s.ivs.join(),
      ),
    ),
  );
});

test("wild search controls allow blank PID/IVs and distinguish derived results from supplied facts", () => {
  const html = renderToStaticMarkup(
    createElement(WildRngPanel, {
      lab: {
        origin: "wild",
        facts: { species: 286 },
        identity: { species: 286 },
        factError: "",
        summaryError: "",
        rngSettings: undefined,
        wildRng: { result: null, busy: false, error: "", progress: 0 },
      } as unknown as CurtainLab,
    }),
  );
  assert.match(html, /Seed<input[^>]*value="0"/);
  assert.match(html, /Minimum advances/);
  assert.match(html, /Maximum advances/);
  assert.match(html, /H1/);
  assert.match(html, /H2/);
  assert.match(html, /H4/);
  assert.match(html, /Search and use matching spreads/);
  assert.match(html, /A known PID is not required/);
  assert.match(html, /Both advance bounds are included/);
  assert.doesNotMatch(html, /<button disabled=""[^>]*>Search/);
});
