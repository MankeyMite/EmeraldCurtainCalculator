import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { scanStaticSpreads } from "../src/core/staticRng";
import {
  defaultRngSettings,
  rngAppliesToOrigin,
  validateRngSettings,
  scanWildSpreads,
  type RngSettings,
} from "../src/core/rng";
import { searchWild } from "../src/core/rngSearch";
import { computeDeduction } from "../src/core/deduction";
import {
  ORIGINS,
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
} from "../src/core/investigation";
import { PROFILE } from "../src/core/memory";
import { speciesTraits } from "../src/core/traits";
import { calculateStat } from "../src/core/stats";
import { WildRngCompact } from "../src/components/WildRngCompact";
import { WildRngPanel } from "../src/components/WildRngPanel";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

const base: RngSettings = {
  ...defaultRngSettings("static", { species: 158 }),
  maxAdvance: 9,
  methods: ["Method1", "Method4"],
};
// Independent reference: BigInt calls, not the production jump/generator.
function oracle(seed: number, advance: number, method: string) {
  let state = BigInt(seed);
  const next = () => {
    state = (state * 1103515245n + 24691n) % 4294967296n;
    return Number(state >> 16n);
  };
  for (let n = 0; n < advance; n++) next();
  const lo = next(),
    hi = next(),
    a = next();
  if (method === "Method4") next();
  const b = next();
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
test("static Method 1 and 4 match published PokeFinder PID/IV vectors without wild slot or nature calls", () => {
  // https://github.com/Admiral-Fish/PokeFinder/blob/master/Test/Gen3/static3.json
  const snapshots = [newSnapshot("base", "Base")];
  const totodile = scanStaticSpreads(
    { ...base, seed: 1431655765, methods: ["Method1"], maxAdvance: 1 },
    { species: 158 },
    snapshots,
  );
  assert.deepEqual(
    totodile.map(({ pid, ivs }) => ({ pid, ivs })),
    [
      { pid: 2828921363, ivs: [17, 7, 31, 14, 29, 13] },
      { pid: 2096212125, ivs: [14, 29, 13, 12, 8, 5] },
    ],
  );
  const fourth = scanStaticSpreads(
    { ...base, methods: ["Method4"], maxAdvance: 0 },
    { species: 158 },
    snapshots,
  );
  assert.deepEqual(
    { pid: fourth[0].pid, ivs: fourth[0].ivs },
    { pid: 3917348864, ivs: [17, 19, 20, 2, 18, 3] },
  );
  assert.equal(
    totodile[0].abilitySlot,
    0,
    "actual CreateBoxMon stored bit is zero for single-ability species",
  );
});
test("static inclusive advance ranges and both IV sequences match independent unsigned BigInt generation", () => {
  for (const seed of [0, 0xffffffff, 0x12345678]) {
    const actual = scanStaticSpreads(
      { ...base, seed, minAdvance: 23, maxAdvance: 77 },
      { species: 25 },
      [],
    );
    const expected = Array.from({ length: 55 }, (_, i) =>
      ["Method1", "Method4"].map((method) => ({
        ...oracle(seed, i + 23, method),
        method,
        advance: i + 23,
      })),
    ).flat();
    const canonical = (rows: typeof expected) =>
      rows
        .map((r) => `${r.pid}/${r.ivs.join()}/${r.method}/${r.advance}`)
        .sort();
    assert.deepEqual(
      canonical(
        actual.flatMap((r) => r.methods.map((method) => ({ ...r, method }))),
      ),
      canonical(expected),
    );
  }
  assert.equal(
    scanStaticSpreads(
      { ...base, minAdvance: 1234, maxAdvance: 1234, methods: ["Method1"] },
      { species: 25 },
      [],
    ).length,
    1,
  );
});
test("static scopes reject wild methods/leads, preserve legacy wild scopes and require valid Emerald species", () => {
  assert.throws(
    () => validateRngSettings({ ...base, methods: ["H1"] }),
    /Method 1/,
  );
  assert.throws(
    () => validateRngSettings({ ...base, lead: "synchronize" }),
    /lead/,
  );
  assert.throws(() => validateRngSettings({ ...base, kind: "other" }), /model/);
  assert.throws(
    () => validateRngSettings({ ...base, maxAdvance: 1_000_000 }),
    /inclusive range/,
  );
  assert.throws(() => scanWildSpreads(base, { species: 25 }, []), /static/);
  assert.throws(() => scanStaticSpreads(base, {}, []), /species/);
  assert.throws(
    () => scanStaticSpreads(base, { species: 25, metGame: 2 }, []),
    /Emerald/,
  );
  const legacy = defaultRngSettings("wild", { species: 286 });
  delete legacy.kind;
  assert.equal(validateRngSettings(legacy).kind, undefined);
  assert.equal(rngAppliesToOrigin(legacy, "static"), false);
  assert.equal(rngAppliesToOrigin(legacy, "wild"), true);
  assert.equal(rngAppliesToOrigin(base, "wild"), false);
  assert.equal(rngAppliesToOrigin(base, "static"), true);
});
test("static search applies ability, nature, gender, IVs, all snapshot stats and only verified header evidence", () => {
  const species = 337,
    traits = speciesTraits(species)!,
    settings = {
      ...base,
      minAdvance: 23,
      maxAdvance: 23,
      methods: ["Method1"],
    } satisfies RngSettings;
  const generated = oracle(settings.seed, 23, "Method1"),
    nature = generated.pid % 25;
  const ability = traits.abilities[generated.pid & 1].id;
  const source = newSnapshot("base", "Base", { evs: [0, 0, 0, 0, 0, 0] });
  source.summaryStats = {
    level: 50,
    stats: generated.ivs.map((v, i) =>
      calculateStat(traits.summaryBaseStats[i], v, 0, 50, i, nature),
    ),
  };
  const identity = { species, nature, ability, ivs: generated.ivs };
  assert.equal(
    searchWild({ settings, identity, snapshots: [source] }).spreads.length,
    1,
  );
  assert.equal(
    searchWild({
      settings,
      identity: {
        ...identity,
        ability: traits.abilities[1 - (generated.pid & 1)].id,
      },
      snapshots: [source],
    }).spreads.length,
    0,
  );
  assert.equal(
    searchWild({
      settings,
      identity: { ...identity, nature: (nature + 1) % 25 },
      snapshots: [source],
    }).spreads.length,
    0,
  );
  const bad = structuredClone(source);
  bad.id = "bad";
  bad.summaryStats!.stats[0] = 999;
  assert.equal(
    searchWild({ settings, identity, snapshots: [source, bad] }).spreads.length,
    0,
  );
  delete source.knownFacts.evs;
  assert.equal(
    searchWild({ settings, identity, snapshots: [source] }).spreads.length,
    1,
    "unknown EVs are not assumed zero",
  );
  const pending = structuredClone(source);
  pending.id = "draft";
  pending.itemTest = { sourceId: source.id, phase: "editing", changed: true };
  pending.observations[16] = (generated.pid & 15) === 0 ? 1 : 0;
  assert.equal(
    searchWild({ settings, identity, snapshots: [source, pending] }).spreads
      .length,
    1,
    "legacy drafts are excluded",
  );
  pending.itemTest.mode = "pixels";
  pending.targets = [16];
  assert.equal(
    searchWild({ settings, identity, snapshots: [source, pending] }).spreads
      .length,
    0,
    "explicit partial target answers are immediate evidence",
  );
});
test("static generated PID/IV correlations constrain SID, shiny status, projections and experiment recommendations", () => {
  const settings = {
    ...base,
    minAdvance: 0,
    maxAdvance: 0,
    methods: ["Method1"],
  } satisfies RngSettings;
  const genuine = oracle(0, 0, "Method1"),
    tid = 12345,
    sid = tid ^ (genuine.pid & 65535) ^ (genuine.pid >>> 16);
  const source = newSnapshot("base", "Base", { heldItem: 0 });
  const withoutTid = computeDeduction({
    identity: { species: 25 },
    snapshots: [source],
    activeId: source.id,
    rng: settings,
  });
  assert.deepEqual(
    withoutTid.ivEstimates.map((row) => row.combined),
    genuine.ivs.map((v) => [v]),
  );
  assert.equal(withoutTid.wildResult!.spreads[0].pid, genuine.pid);
  assert.equal(withoutTid.sidAnalysis, null);
  // Leave SID unknown: a shiny static PID permits precisely eight trainer SIDs.
  const result = computeDeduction({
    identity: { species: 25, tid, shiny: true },
    snapshots: [source],
    activeId: source.id,
    rng: settings,
  });
  assert.equal(result.sidAnalysis!.sidValues.length, 8);
  assert.ok(result.sidAnalysis!.sidValues.includes(sid));
  assert.ok(
    result.sidAnalysis!.candidates.every(
      (h) => h.pid === genuine.pid && h.rng!.ivs.join() === genuine.ivs.join(),
    ),
  );
  assert.ok(result.recovery);
  assert.equal(result.ivEstimates[0].combined[0], genuine.ivs[0]);
  assert.ok(result.experiments.some((e) => e.groups > 1));
  const nonShiny = searchWild({
    settings,
    identity: { species: 25, tid, sid, shiny: false },
    snapshots: [source],
  });
  assert.equal(nonShiny.spreads.length, 0);
});
test("Starter/Gift JSON migrates into one Static category and static RNG scope survives backup/autosave parsing", () => {
  assert.equal(ORIGINS.filter(([id]) => id === "static").length, 1);
  assert.ok(!ORIGINS.some(([id]) => ["starter", "gift"].includes(id)));
  const document = {
    format: "emerald-curtain-investigation",
    schemaVersion: 1,
    mappingVersion: PROFILE.id,
    origin: "static",
    identity: { species: 158 },
    snapshots: [newSnapshot("base", "Base")],
    activeId: "base",
    ownedItems: [],
    rng: base,
  } as const;
  const text = saveInvestigation({
    ...document,
    snapshots: [...document.snapshots],
    ownedItems: [],
  });
  for (const origin of ["starter", "gift", "static"]) {
    const restored = loadInvestigation(
      JSON.stringify({ ...JSON.parse(text), origin }),
    );
    assert.equal(restored.origin, "static");
    assert.deepEqual(restored.rng, base);
    assert.deepEqual(restored.snapshots, document.snapshots);
  }
});
test("Static uses the same enabled advance-limit controls without wild area/lead requirements", () => {
  const lab = {
    origin: "static",
    facts: { species: 158 },
    identity: { species: 158 },
    rngActive: false,
    rngSettings: undefined,
    factError: "",
    summaryError: "",
    wildRng: { result: null, busy: false, error: "", progress: 0 },
  } as unknown as CurtainLab;
  const compact = renderToStaticMarkup(createElement(WildRngCompact, { lab }));
  assert.match(compact, /<input type="checkbox"\/>Limit RNG advances/);
  assert.match(compact, /Static includes starters and ordinary gifts/);
  const advanced = renderToStaticMarkup(createElement(WildRngPanel, { lab }));
  assert.match(advanced, /Method 1/);
  assert.match(advanced, /Method 4/);
  assert.doesNotMatch(
    advanced,
    /Encounter area|Lead ability at the encounter|Wild methods|>H1</,
  );
  assert.doesNotMatch(advanced, /<button disabled=""[^>]*>Search/);
});
