import fs from "node:fs";
import { analyzeConstraints, ivPossibilities } from "../src/core/inference";
import { observeMemory, recordMasks } from "../src/core/constraints";
import { assembleMemory } from "../src/core/memory";
import { decodePokemon, SUBSTRUCT_POSITIONS, hex } from "../src/core/pokemon";
import { loadSession } from "../src/core/session";
import { calculateStat, estimateIVs } from "../src/core/stats";
import { speciesTraits } from "../src/core/traits";

const session = loadSession(
  fs.readFileSync("research/fixtures/solver-example-skarmory.json", "utf8"),
);
const record = new Uint8Array(
  fs.readFileSync("research/fixtures/skarmory-test.ek3"),
);
const p = decodePokemon(record),
  masks = recordMasks(session.observations, 5);
const { ivs: _, ...beforeFacts } = session.knownFacts;
const before = analyzeConstraints(masks, beforeFacts),
  base = analyzeConstraints(masks, session.knownFacts);
const ivRows = estimateIVs(
  beforeFacts,
  session.summaryStats!,
  Array.from({ length: 6 }, (_, i) => ivPossibilities(before, i)),
);
console.log(
  JSON.stringify({
    kind: "saved-baseline",
    beforeHP: before.pidCount.toString(),
    afterHP: base.pidCount.toString(),
    hpStats: ivRows[0].stats,
    hpCurtain: ivRows[0].curtain,
    hpCombined: ivRows[0].combined,
    orders: base.orders,
    actualPID: hex(p.pid, 8),
  }),
);

// Forecast only: preserve the reference record except EXP and its checksum.
// Friendship/move/PP changes are not simulated; the report labels this boundary.
function atEXP(exp: number) {
  const next = record.slice(),
    view = new DataView(next.buffer);
  const growth = 32 + SUBSTRUCT_POSITIONS[p.pid % 24][0] * 12;
  view.setUint32(growth + 4, (exp ^ p.key) >>> 0, true);
  let sum = 0;
  for (let i = 32; i < 80; i += 4) {
    const word = (view.getUint32(i, true) ^ p.key) >>> 0;
    sum = (sum + (word & 65535) + (word >>> 16)) & 65535;
  }
  view.setUint16(28, sum, true);
  return recordMasks(observeMemory(assembleMemory({ 5: next })), 5);
}
let survivors = base.pidValues!;
let statSets = Array.from({ length: 6 }, (_, i) => ivRows[i].stats!);
const endLevel = Number(process.argv[2] ?? 30);
if (!Number.isInteger(endLevel) || endLevel < 17 || endLevel > 100)
  throw Error("Final level must be 17–100");
for (let level = 17; level <= endLevel; level++) {
  const exp = Math.floor((5 * level ** 3) / 4),
    futureMasks = atEXP(exp);
  const facts = { ...session.knownFacts, experience: exp };
  const standalone = analyzeConstraints(futureMasks, facts);
  survivors = survivors.filter(
    (pid) => analyzeConstraints(futureMasks, { ...facts, pid }).consistent,
  );
  const stats = speciesTraits(p.species)!.summaryBaseStats.map((b, i) =>
    calculateStat(b, p.ivs[i], p.evs[i], level, i, p.nature),
  );
  const rows = estimateIVs(
    facts,
    { level, stats },
    Array.from({ length: 6 }, (_, i) => ivPossibilities(standalone, i)),
  );
  statSets = statSets.map((values, i) =>
    values.filter((v) => rows[i].stats!.includes(v)),
  );
  const singletons = statSets.map((values, i) =>
    values.length === 1 ? values[0] : (session.knownFacts.ivs?.[i] ?? null),
  );
  const withExactIVs = survivors.filter(
    (pid) =>
      analyzeConstraints(futureMasks, { ...facts, pid, ivs: singletons })
        .consistent,
  );
  console.log(
    JSON.stringify({
      kind: "simulated-EXP-and-summary",
      level,
      candies: level - 16,
      exp,
      stats,
      standalonePIDs: standalone.pidCount.toString(),
      combinedWithOriginal: survivors.length,
      exactIVsFromStats: singletons,
      combinedIncludingThoseIVs: withExactIVs.length,
      statsAcrossLevels: statSets,
    }),
  );
}

// A measurement-selection aid independent of the reference PID: partition the
// existing candidate list by the EXP nibble-zero pattern each would predict.
const expPattern = (pid: number, exp: number) => {
  const word = (exp ^ pid ^ p.otId) >>> 0;
  return Array.from({ length: 8 }, (_, i) =>
    ((word >>> (4 * i)) & 15) === 0 ? "0" : "1",
  ).join("");
};
const partitions = [];
for (let level = 17; level <= 100; level++) {
  const exp = Math.floor((5 * level ** 3) / 4),
    groups = new Map<string, number>();
  for (const pid of base.pidValues!) {
    const pattern = expPattern(pid, exp);
    groups.set(pattern, (groups.get(pattern) ?? 0) + 1);
  }
  const sizes = [...groups.values()].sort((a, b) => b - a);
  partitions.push({
    level,
    candies: level - 16,
    exp,
    bucketSizes: sizes,
    worstCase: Math.max(...sizes),
    meanRemaining:
      sizes.reduce((n, s) => n + s * s, 0) / base.pidValues!.length,
  });
}
console.log(
  JSON.stringify({
    kind: "EXP-only-design-from-the-20-candidate-list",
    bestSingleCheckpoint: partitions
      .sort(
        (a, b) =>
          a.worstCase - b.worstCase ||
          a.meanRemaining - b.meanRemaining ||
          a.level - b.level,
      )
      .slice(0, 5),
  }),
);
