import assert from "node:assert/strict";
import fs from "node:fs";
import {
  newStarterGuide,
  searchStarter,
  battleEvs,
} from "../src/core/starterGuide";
import { levelExperience } from "../src/core/controlledExperiments";
import { calculateStat } from "../src/core/stats";
import { NATURES, hex } from "../src/core/pokemon";

type Match = { advance: number; pid: string; ivs: number[] };
type Trial = {
  trial: number;
  advance: number;
  pid: string;
  nature: string;
  gender: string;
  stats: number[];
  ivs: number[];
  possiblePids: number;
  matches: Match[];
};
const source = JSON.parse(
  fs.readFileSync("research/starter-timing-one-second-simulation.json", "utf8"),
);
const trials: Trial[] = source.rows.filter(
  (row: Trial) => row.possiblePids > 1,
);
const names = ["HP", "Attack", "Defense", "Speed", "Sp. Attack", "Sp. Defense"];

// Independent integer stat calculation to cross-check the app's stat function.
function stats(match: Match, level: number, evs: number[]) {
  const nature = parseInt(match.pid, 16) % 25;
  const plus = Math.floor(nature / 5) + 1,
    minus = (nature % 5) + 1;
  return [45, 60, 40, 45, 70, 50].map((base, i) => {
    const scaled = Math.floor(
      ((base * 2 + match.ivs[i] + Math.floor(evs[i] / 4)) * level) / 100,
    );
    const value =
      i === 0
        ? scaled + level + 10
        : Math.floor(
            ((scaled + 5) *
              (plus === minus
                ? 100
                : i === plus
                  ? 110
                  : i === minus
                    ? 90
                    : 100)) /
              100,
          );
    assert.equal(
      value,
      calculateStat(base, match.ivs[i], evs[i], level, i, nature),
    );
    return value;
  });
}

const rows = trials.map((trial) => {
  const state = newStarterGuide();
  state.starter = { ...source.setup.timing };
  state.species = 280;
  state.nature = String(NATURES.indexOf(trial.nature));
  state.gender = trial.gender;
  state.ability = "66";
  let experience = levelExperience(280, 5) + Math.floor((60 * 2) / 7);
  let additionalBattles = 0;
  const checks = [];
  for (let level = 5; level <= 15; level++) {
    while (experience < levelExperience(280, level)) {
      experience += Math.floor((60 * 2) / 7);
      additionalBattles++;
    }
    state.battles = [{ id: "birch", species: 288, count: 1, multiplier: 1 }];
    if (additionalBattles)
      state.battles.push({
        id: "training",
        species: 288,
        count: additionalBattles,
        multiplier: 1,
      });
    const evs = battleEvs(state.battles);
    const pair = trial.matches.map((match) => ({
      ...match,
      stats: stats(match, level, evs),
    }));
    const actual = pair.find((match) => match.pid === trial.pid)!;
    if (level === 5) assert.deepEqual(actual.stats, trial.stats);
    state.readings = [
      { id: `level-${level}`, evs, summary: { level, stats: actual.stats } },
    ];
    const matches = searchStarter(state);
    assert.ok(matches.some((match) => hex(match.pid, 8) === trial.pid));
    if (level === 5)
      assert.deepEqual(
        matches.map((m) => hex(m.pid, 8)),
        trial.matches.map((m) => m.pid),
      );
    checks.push({
      level,
      experience,
      additionalBattles,
      evs,
      pair,
      distinguishingStats: names.filter(
        (_, i) => pair[0].stats[i] !== pair[1].stats[i],
      ),
      remaining: matches.map((m) => ({
        advance: m.advance,
        pid: hex(m.pid, 8),
        ivs: m.ivs,
      })),
    });
    if (matches.length === 1) break;
  }
  const last = checks.at(-1)!;
  return {
    trial: trial.trial,
    actualAdvance: trial.advance,
    actualPid: trial.pid,
    firstUniqueLevel: last.remaining.length === 1 ? last.level : null,
    checks,
  };
});
const result = {
  assumptions: {
    species: "Torchic",
    window: source.setup.range,
    training:
      "Solo defeat only level-2 wild Zigzagoon on Route 101 after Birch's battle; run from other encounters. No EXP sharing, held EXP/EV modifiers or Pokerus.",
    startingExperience: 152,
    startingSpeedEvs: 1,
    expPerAdditionalBattle: 17,
    speedEvsPerAdditionalBattle: 1,
    statOrder: names,
    limitation:
      "Earliest levels are conditional on this explicit battle log; a different route can change the rounding checkpoints.",
  },
  rows,
};
fs.writeFileSync(
  "research/starter-level-up-simulation.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      trial: r.trial,
      actualAdvance: r.actualAdvance,
      actualPid: r.actualPid,
      firstUniqueLevel: r.firstUniqueLevel,
      evs: r.checks.at(-1)!.evs,
      distinguishingStats: r.checks.at(-1)!.distinguishingStats,
      pair: r.checks
        .at(-1)!
        .pair.map((m) => ({ advance: m.advance, pid: m.pid, stats: m.stats })),
    })),
    null,
    2,
  ),
);
assert.equal(rows.length, 8);
assert.ok(rows.every((row) => row.firstUniqueLevel === 6));
