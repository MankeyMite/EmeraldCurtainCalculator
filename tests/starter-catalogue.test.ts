import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildStarterCatalogue,
  STARTER_CATALOGUE_RULES,
  cataloguePreparation,
  type StarterCatalogue,
  type CataloguePreparation,
  type CatalogueSpread,
  type CatalogueOption,
} from "../src/core/starterCatalogue";
import {
  catalogueCandidateMasks,
  rankCatalogueTargets,
  scanStarterCatalogue,
  type CatalogueLanding,
} from "../src/core/starterCatalogueScan";
import { STARTERS, newStarterGuide, battleEvs } from "../src/core/starterGuide";
import { generateSidRng } from "../src/core/sidRng";
import { estimatedSidWindow } from "../src/core/starterTiming";
import { speciesTraits, genderForPid } from "../src/core/traits";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { solveSids } from "../src/core/sid";
import { newSnapshot } from "../src/core/investigation";
import type { Observations } from "../src/core/constraints";

const catalogue = JSON.parse(
  fs.readFileSync(
    new URL("../src/data/starter-catalogue.json", import.meta.url),
    "utf8",
  ),
) as StarterCatalogue;

// Independent exact record: canonical G/A/E/M bytes, explicitly permuted and
// encrypted. Unknown nuisance fields get valid example values but are excluded
// from the catalogue's conservative pattern comparison.
function oracleRecord(
  spread: CatalogueSpread,
  prep: CataloguePreparation,
  item: number,
  tid: number,
  sid: number,
) {
  const logical = new Uint8Array(48),
    v = new DataView(logical.buffer);
  v.setUint16(0, prep.species, true);
  v.setUint16(2, item, true);
  v.setUint32(4, prep.experience, true);
  logical[9] = 99;
  prep.facts.moves!.forEach((move, n) => v.setUint16(12 + 2 * n, move!, true));
  logical.set(prep.facts.pp as number[], 20);
  logical.set(prep.facts.evs as number[], 24);
  logical[37] = 16;
  v.setUint16(38, 5 | (3 << 7) | (4 << 11), true);
  v.setUint32(
    40,
    spread.ivs.reduce((word, iv, n) => word + iv * 2 ** (5 * n), 0),
    true,
  );
  const record = new Uint8Array(80),
    header = new DataView(record.buffer);
  header.setUint32(0, spread.pid, true);
  header.setUint16(4, tid, true);
  header.setUint16(6, sid, true);
  record.fill(255, 8, 18);
  record[18] = 2;
  record[19] = 2;
  record.fill(255, 20, 27);
  let sum = 0;
  for (let n = 0; n < 48; n += 2) sum = (sum + v.getUint16(n, true)) & 65535;
  header.setUint16(28, sum, true);
  const order = SUBSTRUCT_POSITIONS[spread.pid % 24];
  for (let block = 0; block < 4; block++)
    record.set(
      logical.subarray(block * 12, block * 12 + 12),
      32 + order[block] * 12,
    );
  const key = (spread.pid ^ ((sid << 16) | tid)) >>> 0;
  for (let n = 32; n < 80; n += 4)
    header.setUint32(n, header.getUint32(n, true) ^ key, true);
  return record;
}
const ORACLE_KNOWN_NIBBLES = [
  ...Array.from({ length: 8 }, (_, n) => n),
  16,
  17,
  ...Array.from({ length: 54 }, (_, n) => n + 20),
  76,
  77,
  78,
  ...Array.from({ length: 16 }, (_, n) => n + 80),
];

function oraclePattern(record: Uint8Array, pid: number) {
  let out = "";
  for (let n = 12; n < 16; n++)
    out += ((record[n >> 1] >>> ((n % 2) * 4)) & 15) === 0 ? "T" : "B";
  const order = SUBSTRUCT_POSITIONS[pid % 24];
  for (const n of ORACLE_KNOWN_NIBBLES) {
    if (n % 8 < 4) continue;
    const byte = 32 + order[Math.floor(n / 24)] * 12 + Math.floor((n % 24) / 2);
    out += ((record[byte] >>> ((n % 2) * 4)) & 15) === 0 ? "T" : "B";
  }
  return out;
}
function maskPattern(sid: number, masks: number[]) {
  return masks
    .map((m, n) =>
      m & (1 << ((sid >>> (n * 4)) & 15))
        ? String((sid >>> (n * 4)) & 15)
        : "x",
    )
    .join("/");
}

test("all 2001 cached Method 1 spreads match an independent BigInt RNG and level-5 stat formulas", () => {
  let seed = 0n;
  const words: number[] = [];
  for (let n = 0; n < 3004; n++) {
    seed = (seed * 1103515245n + 24691n) & 0xffffffffn;
    words.push(Number(seed >> 16n));
  }
  assert.equal(catalogue.spreads.length, 2001);
  const orders = new Set<number>();
  for (const spread of catalogue.spreads) {
    const a = spread.advance,
      ivs = [
        words[a + 2] & 31,
        (words[a + 2] >>> 5) & 31,
        (words[a + 2] >>> 10) & 31,
        words[a + 3] & 31,
        (words[a + 3] >>> 5) & 31,
        (words[a + 3] >>> 10) & 31,
      ];
    assert.equal(spread.pid, words[a] + words[a + 1] * 65536);
    assert.deepEqual(spread.ivs, ivs);
    assert.equal(spread.abilitySlot, 0);
    orders.add(spread.pid % 24);
    const packed = ivs.reduce((word, iv, n) => word + iv * 2 ** (n * 5), 0);
    for (const question of spread.ivTests) {
      const n = 4 - question.position,
        plain = (packed >>> ((n + 4) * 4)) & 15;
      assert.equal(question.plaintext, plain);
      assert.equal(
        question.candidate,
        plain ^ ((spread.pid >>> ((n + 4) * 4)) & 15),
      );
      assert.equal(
        question.observation,
        80 + SUBSTRUCT_POSITIONS[spread.pid % 24][3] * 24 + 12 + n,
      );
    }
    for (const species of STARTERS) {
      const base = speciesTraits(species)!.summaryBaseStats,
        nature = spread.pid % 25;
      const stats = ivs.map((iv, n) => {
        const core = Math.floor(((2 * base[n] + iv) * 5) / 100);
        if (n === 0) return core + 15;
        const increase = Math.floor(nature / 5),
          decrease = nature % 5;
        const factor =
          increase === decrease
            ? 10
            : increase === n - 1
              ? 11
              : decrease === n - 1
                ? 9
                : 10;
        return Math.floor(((core + 5) * factor) / 10);
      });
      assert.deepEqual(spread.level5Stats[species], stats);
    }
  }
  assert.equal(orders.size, 24);
});

test("the committed catalogue regenerates exactly; routes include both forest trainers and every legal order", () => {
  assert.deepEqual(buildStarterCatalogue(), catalogue);
  const groups = new Map<string, Set<string>>();
  for (const prep of catalogue.preparations) {
    const evs = prep.facts.evs as number[],
      moves = prep.facts.moves as number[];
    assert.deepEqual(evs, battleEvs(prep.battles));
    assert.equal(evs[2], 2);
    assert.equal(evs[3], prep.species === 283 ? 2 : 1);
    assert.equal(evs[0], 4 + prep.extraLevelBattles);
    assert.equal(prep.battles.find((b) => b.id === "journey-lyle")?.count, 4);
    assert.equal(prep.battles.find((b) => b.id === "journey-lyle")?.level, 3);
    assert.equal(prep.battles.find((b) => b.id === "journey-james")?.count, 2);
    if (!prep.extraLevelBattles) assert.equal(prep.experience, 684);
    if (prep.extraLevelBattles) {
      assert.equal(prep.species, 277);
      assert.equal(prep.extraLevelBattles, 2);
      assert.equal(prep.level, 11);
    }
    if (prep.species === 283) assert.ok(!moves.includes(15));
    if (moves.includes(331)) {
      assert.equal(prep.species, 277);
      assert.deepEqual(prep.consumedItems, [297]);
    }
    const key = `${prep.species}/${prep.level}/${moves.filter(Boolean).sort((a, b) => a - b)}/${prep.consumedItems}`;
    const group = groups.get(key) ?? new Set<string>();
    group.add(moves.join());
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const occupied = key.split("/")[2].split(",").length;
    assert.equal(group.size, occupied === 4 ? 24 : occupied === 3 ? 6 : 2);
  }
  const full = [10, 45, 116, 52];
  for (const replaced of full)
    assert.ok(
      catalogue.preparations.some(
        (p) =>
          p.species === 280 &&
          p.facts.moves?.includes(15) &&
          full
            .filter((m) => m !== replaced)
            .every((m) => p.facts.moves?.includes(m)) &&
          !p.facts.moves?.includes(replaced),
      ),
    );
  assert.ok(
    catalogue.preparations.some(
      (p) =>
        p.species === 277 &&
        p.facts.moves?.includes(15) &&
        p.facts.moves.includes(331),
    ),
  );
  for (const prep of catalogue.preparations)
    for (const item of catalogue.items) {
      if (prep.consumedItems.includes(item.id)) continue;
      const masks = prep.plaintextMasks.map(
          (m, n) => m | item.plaintextMasks[n],
        ),
        seconds = prep.seconds + item.seconds;
      assert.ok(
        catalogue.options[prep.species].some(
          (option) =>
            option.seconds <= seconds &&
            masks.every((m, n) => (option.plaintextMasks[n] & m) === m) &&
            [
              prep.withoutTrainingMasks,
              prep.shortTrainingMasks,
              ...prep.trainingMasks.map((t) => t.masks),
            ].every((profile, index) => {
              const other = catalogue.preparations[option.preparation];
              const covering = [
                other.withoutTrainingMasks,
                other.shortTrainingMasks,
                ...other.trainingMasks.map((t) => t.masks),
              ][index];
              return profile.every((m, n) => (covering[n] & m) === m);
            }),
        ),
        "pruning may remove only an equally strong or weaker, no-cheaper setup",
      );
    }
});

test("factorised digit coverage matches independently encrypted binary pixels across all 24 permutations", () => {
  const state = newStarterGuide(),
    tid = 48734;
  const sids = generateSidRng(tid, estimatedSidWindow(state.intro)).map(
    (r) => r.sid,
  );
  const examples = [
    ...new Map(catalogue.spreads.map((s) => [s.pid % 24, s])).values(),
  ];
  for (const spread of examples)
    for (const species of STARTERS) {
      const options = catalogue.options[species];
      for (const option of [
        options[0],
        options[Math.floor(options.length / 2)],
        options.at(-1)!,
      ]) {
        const prep = catalogue.preparations[option.preparation];
        const masks = catalogueCandidateMasks(spread, option);
        const physical = sids.map((sid) =>
          oraclePattern(
            oracleRecord(spread, prep, option.item, tid, sid),
            spread.pid,
          ),
        );
        const cached = sids.map((sid) => maskPattern(sid, masks));
        for (let n = 0; n < sids.length; n++)
          assert.deepEqual(
            sids.filter((_, m) => physical[n] === physical[m]),
            sids.filter((_, m) => cached[n] === cached[m]),
          );
      }
    }
});

test("future item, move and EV coverage matches independently encrypted records without changing the initial route", () => {
  const tids = 50998;
  const examples = STARTERS.flatMap((species) => {
    const preps = catalogue.preparations.filter(
      (p) => p.species === species && p.facts.moves!.every(Boolean),
    );
    return [
      preps[0],
      preps[Math.floor(preps.length / 2)],
      preps[preps.length - 1],
    ];
  });
  for (const [index, prep] of examples.entries()) {
    const spread = catalogue.spreads[index * 197];
    const before = JSON.stringify(prep.facts);
    const observed = [1, 1, 1, 1]; // A zero SID header nibble is transparent.
    const addRecord = (facts: CataloguePreparation["facts"], item = 0) => {
      const record = oracleRecord(spread, { ...prep, facts }, item, tids, 0);
      const order = SUBSTRUCT_POSITIONS[spread.pid % 24];
      for (const n of ORACLE_KNOWN_NIBBLES) {
        if (n % 8 < 4) continue;
        const byte =
          32 + order[Math.floor(n / 24)] * 12 + Math.floor((n % 24) / 2);
        const cipher = (record[byte] >>> ((n % 2) * 4)) & 15;
        observed[n % 4] |= 1 << cipher;
      }
    };
    for (const item of catalogue.items)
      if (!prep.consumedItems.includes(item.id)) addRecord(prep.facts, item.id);
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++) {
        const facts = structuredClone(prep.facts);
        [facts.moves![a], facts.moves![b]] = [facts.moves![b], facts.moves![a]];
        [facts.pp![a], facts.pp![b]] = [facts.pp![b], facts.pp![a]];
        addRecord(facts);
      }
    const option = catalogue.options[prep.species][0];
    const candidateMasks = (masks: typeof prep.plaintextMasks) =>
      catalogueCandidateMasks(spread, { ...option, plaintextMasks: masks });
    assert.deepEqual(candidateMasks(prep.withoutTrainingMasks), observed);
    let previous = prep.withoutTrainingMasks;
    for (const checkpoint of [
      { cap: 10, masks: prep.shortTrainingMasks },
      ...prep.trainingMasks,
    ]) {
      for (const stat of [2, 3])
        for (
          let target = prep.facts.evs![stat]! + 1;
          target <= checkpoint.cap;
          target++
        ) {
          const facts = structuredClone(prep.facts);
          facts.evs![stat] = target;
          addRecord(facts);
        }
      assert.deepEqual(
        candidateMasks(checkpoint.masks),
        observed,
        "all future tests must correspond to attainable encrypted pixels",
      );
      assert.ok(
        checkpoint.masks.every((m, n) => (m & previous[n]) === previous[n]),
      );
      previous = checkpoint.masks;
    }
    assert.deepEqual(observed, [65535, 65535, 65535, 65535]);
    assert.equal(
      JSON.stringify(prep.facts),
      before,
      "future training must not become initial plaintext or recorded EVs",
    );
  }
});

test("fast scanner retains the full window, agrees with a slow exact grouping and chooses one truth-blind preparation", () => {
  const small = buildStarterCatalogue({
    ...STARTER_CATALOGUE_RULES,
    maxAdvance: 1005,
  });
  const state = newStarterGuide();
  state.starter.uncertainty = 2;
  const input = { tid: 48734, intro: state.intro, starter: state.starter },
    before = JSON.stringify(input);
  const scan = scanStarterCatalogue(small, input);
  assert.equal(scan.fullSidCount, 121);
  assert.equal(scan.priority.length, 19);
  assert.deepEqual(
    scan.priority.map((p) => p.advance),
    Array.from({ length: 19 }, (_, n) => 1236 + n),
  );
  const full = generateSidRng(input.tid, estimatedSidWindow(input.intro)).map(
    (r) => r.sid,
  );
  const spread = small.spreads[0];
  let outsidePriorityMatters = false;
  for (const species of STARTERS) {
    const cache = new Map<
      string,
      { counts: number[]; weight: number; count: number }
    >();
    const slow = (raw: number[]) => {
      const key = raw.join();
      if (cache.has(key)) return cache.get(key)!;
      const masks = catalogueCandidateMasks(spread, {
        ...small.options[species][0],
        plaintextMasks: raw as [number, number, number, number],
      });
      const groups = new Map<string, number>();
      for (const sid of full) {
        const p = maskPattern(sid, masks);
        groups.set(p, (groups.get(p) ?? 0) + 1);
      }
      const counts = scan.priority.map((row) =>
        groups.get(maskPattern(row.sid, masks))!,
      );
      const value = {
        counts,
        weight: counts.reduce(
          (sum, n, j) => sum + (n === 1 ? scan.sidWeights[j] : 0),
          0,
        ),
        count: counts.filter((n) => n === 1).length,
      };
      cache.set(key, value);
      return value;
    };
    const scoreOption = (o: CatalogueOption) => {
      const prep = small.preparations[o.preparation],
        d = slow(o.plaintextMasks),
        e = slow(prep.withoutTrainingMasks),
        t = slow(prep.shortTrainingMasks);
      const budgets = [
        { cap: 0, r: e },
        { cap: 10, r: t },
        ...prep.trainingMasks.map((b) => ({ cap: b.cap, r: slow(b.masks) })),
      ];
      const effort = scan.priority.map(
        (_, n) => budgets.find((b) => b.r.counts[n] === 1)?.cap ?? 240,
      );
      return [
        -Math.max(...effort),
        -effort.reduce((sum, n, j) => sum + n * scan.sidWeights[j], 0) /
          scan.sidWeights.reduce((a, b) => a + b, 0),
        t.weight,
        e.weight,
        d.weight,
        t.count,
        e.count,
        d.count,
        -o.seconds,
        -d.counts.reduce((a, b) => a + b, 0) / d.counts.length,
      ];
    };
    let best: number[] = [];
    for (const option of small.options[species]) {
      const masks = catalogueCandidateMasks(spread, option),
        groups = new Map<string, number[]>();
      for (const sid of full) {
        const key = maskPattern(sid, masks),
          g = groups.get(key) ?? [];
        g.push(sid);
        groups.set(key, g);
      }
      const good = scan.priority.filter(
        (row) => groups.get(maskPattern(row.sid, masks))!.length === 1,
      ).length;
      const score = scoreOption(option);
      if (
        !best.length ||
        (score.map((v, n) => v - best[n]).find((v) => v !== 0) ?? 0) > 0
      )
        best = score;
      const sampled = scan.priority.filter(
        (row) =>
          scan.priority.filter(
            (other) =>
              maskPattern(row.sid, masks) === maskPattern(other.sid, masks),
          ).length === 1,
      ).length;
      outsidePriorityMatters ||= sampled > good;
    }
    const chosen = scan.landings.find(
      (r) => r.advance === spread.advance && r.species === species,
    )!;
    assert.deepEqual(
      scoreOption(chosen.option),
      best,
      "risk-first recipe agrees with an independent full-window grouping",
    );
    assert.ok(
      !small.preparations[chosen.option.preparation].consumedItems.includes(
        chosen.option.item,
      ),
    );
  }
  assert.ok(outsidePriorityMatters);
  for (const target of scan.targets) {
    assert.ok(target.advance >= 1002 && target.advance <= 1003);
    assert.ok(target.secondCountdown >= 15);
    assert.equal(target.evaluatedLandings, 5);
    const row = scan.landings.filter(
      (r) =>
        r.species === target.species &&
        Math.abs(r.advance - target.advance) <= 2,
    );
    const counts = new Map<string, number>();
    const key = (advance: number) => {
      const spread = small.spreads.find((s) => s.advance === advance)!;
      return `${spread.pid % 25}/${genderForPid(target.species, spread.pid)}/${spread.level5Stats[target.species]}`;
    };
    for (const r of row)
      counts.set(key(r.advance), (counts.get(key(r.advance)) ?? 0) + 1);
    const expected =
      row.reduce(
        (sum, r) =>
          sum + (counts.get(key(r.advance)) === 1 ? r.drawingOnly : 0),
        0,
      ) /
      (5 * 19);
    assert.equal(target.expectedDrawingOnly, expected);
  }
  assert.equal(JSON.stringify(input), before);
  const tighter = scanStarterCatalogue(small, {
    ...input,
    expectedLandingRadius: 0,
  });
  assert.equal(tighter.fullSidCount, 121);
  assert.equal(tighter.priority.length, 19);
  assert.ok(
    tighter.targets.every(
      (t) =>
        t.radius === 0 && t.searchRadius === 2 && t.evaluatedLandings === 1,
    ),
  );
  assert.equal(
    scanStarterCatalogue(small, {
      ...input,
      starter: { ...input.starter, uncertainty: 60 },
    }).recommended,
    null,
    "do not certify unmodelled edges of the landing window",
  );
});

test("exact-target safety and close neighbours outrank a flattering outer-window average", () => {
  const sample: StarterCatalogue = {
    ...catalogue,
    rules: { ...catalogue.rules, maxAdvance: 1200 },
    spreads: catalogue.spreads
      .filter((s) => s.advance <= 1200)
      .map((s) => ({
        ...s,
        level5Stats: Object.fromEntries(STARTERS.map((p) => [p, [s.advance]])),
      })),
  };
  const mask = (n: number) => (1 << n) - 1;
  const landings: CatalogueLanding[] = STARTERS.flatMap((species) =>
    sample.spreads.map((s) => {
      const safe = species === 280 && s.advance >= 1060 && s.advance <= 1070,
        centre = safe && s.advance === 1065;
      const flattering =
        species === 283 && s.advance >= 1130 && s.advance <= 1140;
      const isolated = species === 277 && s.advance === 1165;
      const draw = centre || isolated ? 19 : safe ? 14 : flattering ? 18 : 2,
        easy = centre || isolated ? 19 : safe ? 18 : flattering ? 18 : 4,
        short = safe || isolated ? 19 : 18;
      return {
        advance: s.advance,
        pid: s.pid,
        species,
        option: sample.options[species][0],
        drawingOnly: draw,
        coverageBits: mask(draw),
        fullDrawingOnly: draw,
        expectedSurvivors: 2,
        worstSurvivors: 2,
        priorityExpectedSurvivors: 2,
        withoutTraining: easy,
        withoutTrainingBits: mask(easy),
        shortTraining: short,
        shortTrainingBits: mask(short),
        evCap: centre || isolated ? 0 : safe ? 10 : flattering ? 110 : 240,
        evEffort: centre || isolated ? 0 : safe ? 2 : 32,
      };
    }),
  );
  const ranked = rankCatalogueTargets(
    sample,
    landings,
    { ...newStarterGuide().starter, uncertainty: 30 },
    19,
    5,
  );
  assert.equal(ranked[0].species, 280);
  assert.equal(ranked[0].advance, 1065);
  assert.equal(ranked[0].evaluatedLandings, 11);
  assert.equal(ranked[0].ranking.centreEvCap, 0);
  assert.equal(ranked[0].ranking.nearEvCap, 10);
  assert.ok(
    ranked.find((t) => t.species === 283)!.expectedDrawingOnly >
      ranked[0].expectedDrawingOnly,
    "raw average may be higher despite much heavier training",
  );
});

test("SID timings nearer the target receive more weight without removing any candidates", () => {
  const sample: StarterCatalogue = {
    ...catalogue,
    rules: { ...catalogue.rules, maxAdvance: 1200 },
    spreads: catalogue.spreads
      .filter((s) => s.advance <= 1200)
      .map((s) => ({
        ...s,
        level5Stats: Object.fromEntries(STARTERS.map((p) => [p, [s.advance]])),
      })),
  };
  const all = (1 << 19) - 1,
    good = all ^ 7,
    bad = all ^ (7 << 8);
  const rows: CatalogueLanding[] = STARTERS.flatMap((species) =>
    sample.spreads.map((s) => {
      const bits =
        species === 280
          ? s.advance === 1060
            ? good
            : s.advance === 1100
              ? bad
              : 0
          : 0;
      return {
        advance: s.advance,
        pid: s.pid,
        species,
        option: sample.options[species][0],
        drawingOnly: bits ? 16 : 0,
        coverageBits: bits,
        fullDrawingOnly: 16,
        expectedSurvivors: 2,
        worstSurvivors: 2,
        priorityExpectedSurvivors: 2,
        withoutTraining: 19,
        withoutTrainingBits: all,
        shortTraining: 19,
        shortTrainingBits: all,
        evCap: 0,
        evEffort: 0,
      };
    }),
  );
  const weights = Array.from({ length: 19 }, (_, n) => 10 - Math.abs(n - 9));
  const result = rankCatalogueTargets(
    sample,
    rows,
    { ...newStarterGuide().starter, uncertainty: 30 },
    19,
    5,
    weights,
  );
  assert.equal(result[0].advance, 1060);
  assert.equal(result[0].species, 280);
});

test("custom sources must be backed by supported facts; they cannot inject a SID or contradict a route", () => {
  const rules = { ...STARTER_CATALOGUE_RULES, maxAdvance: 1000 };
  const extra = {
    id: "verified-location",
    source: "Emerald starter on Route 101",
    facts: { metLocation: 16 },
  };
  const expanded = buildStarterCatalogue({
    ...rules,
    additionalPlaintext: [extra],
  });
  assert.ok(expanded.preparations.every((p) => p.facts.metLocation === 16));
  assert.throws(
    () =>
      buildStarterCatalogue({
        ...rules,
        additionalPlaintext: [{ ...extra, facts: { sid: 49423 } }],
      }),
    /hidden identity/,
  );
  assert.throws(
    () =>
      buildStarterCatalogue({
        ...rules,
        additionalPlaintext: [{ ...extra, facts: { evs: [0, 0, 0, 0, 0, 0] } }],
      }),
    /contradicts/,
  );
  assert.throws(
    () =>
      buildStarterCatalogue({
        ...rules,
        additionalPlaintext: [{ ...extra, source: "" }],
      }),
    /verified source/,
  );
});

test("drawing-only claims recover the hidden SID through the existing solver on independently encrypted curtains", () => {
  const state = newStarterGuide(),
    tid = 48734;
  const full = generateSidRng(tid, estimatedSidWindow(state.intro)).map(
    (r) => r.sid,
  );
  const small = buildStarterCatalogue({
    ...STARTER_CATALOGUE_RULES,
    maxAdvance: 1010,
  });
  const scan = scanStarterCatalogue(small, {
    tid,
    intro: state.intro,
    starter: { ...state.starter, uncertainty: 2 },
  });
  let checked = 0;
  outer: for (const row of scan.landings)
    for (let n = 0; n < scan.priority.length; n++) {
      if (!(row.coverageBits & (1 << n))) continue;
      const sid = scan.priority[n].sid,
        spread = small.spreads.find((s) => s.advance === row.advance)!;
      const prep = small.preparations[row.option.preparation],
        record = oracleRecord(spread, prep, row.option.item, tid, sid);
      const observations = Array(192).fill(-1) as Observations;
      for (let k = 0; k < 160; k++)
        observations[16 + k] =
          ((record[k >> 1] >>> ((k % 2) * 4)) & 15) === 0 ? 0 : 1;
      const prepared = cataloguePreparation(small, spread, row.option);
      const identity = { ...prepared.facts, tid };
      const snapshot = {
        ...newSnapshot("draw", "Initial drawing", identity),
        observations,
      };
      assert.deepEqual(
        solveSids(identity, [snapshot], [row.pid], undefined, Infinity, full)
          .sidValues,
        [sid],
      );
      checked++;
      if (checked === 100) break outer;
    }
  assert.equal(checked, 100);
});
