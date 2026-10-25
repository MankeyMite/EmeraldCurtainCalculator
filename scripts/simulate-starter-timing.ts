import assert from "node:assert/strict";
import fs from "node:fs";
import { newStarterGuide, searchStarter } from "../src/core/starterGuide";
import {
  defaultStarterTiming,
  estimatedStarterWindow,
  starterTargetFrame,
} from "../src/core/starterTiming";
import { NATURES, hex } from "../src/core/pokemon";

// Fixed timer/setup throughout. Only the simulated net reset-to-confirmation
// input error varies, uniformly within [-1, +1] seconds. This is a calculation
// Historical BIOS-reset simulation with the former -254 calibration.
// These results do not model the current in-game soft-reset default.
const timing = {
  ...defaultStarterTiming(),
  first: 15,
  second: 20,
  uncertainty: 100,
  calibration: -254,
};
const hz = 16777216 / 280896;
const randomSeed = 0xc0ffee32;
let randomState = randomSeed;
function random() {
  randomState += 0x6d2b79f5;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

// Independent BigInt Method 1 generator: deliberately avoids the app generator.
function reference(advance: number) {
  let seed = 0n;
  const next = () => {
    seed = (seed * 0x41c64e6dn + 0x6073n) & 0xffffffffn;
    return Number(seed >> 16n);
  };
  for (let i = 0; i < advance; i++) next();
  const lo = next(),
    hi = next(),
    a = next(),
    b = next();
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

// Independent level-5 Torchic summary, after Birch's 1-Speed-EV Zigzagoon.
// Stat order here and in the report: HP / Atk / Def / Spe / SpA / SpD.
function summary(pid: number, ivs: number[]) {
  const nature = pid % 25;
  const raised = [1, 2, 3, 4, 5][Math.floor(nature / 5)];
  const lowered = [1, 2, 3, 4, 5][nature % 5];
  return [45, 60, 40, 45, 70, 50].map((base, i) => {
    const ev = i === 3 ? 1 : 0;
    const unmodified = Math.floor(
      (base * 2 + ivs[i] + Math.floor(ev / 4)) / 20,
    );
    if (i === 0) return unmodified + 15;
    const modifier =
      raised === lowered ? 100 : i === raised ? 110 : i === lowered ? 90 : 100;
    return Math.floor(((unmodified + 5) * modifier) / 100);
  });
}

const rows = Array.from({ length: 100 }, (_, i) => {
  const errorSeconds = random() * 2 - 1;
  const advance =
    Math.round((timing.second + errorSeconds) * hz) + timing.calibration;
  const actual = reference(advance);
  const stats = summary(actual.pid, actual.ivs);
  const state = newStarterGuide();
  state.starter = { ...timing };
  state.species = 280; // Torchic, matching the user's attempts.
  state.nature = String(actual.pid % 25);
  state.gender = (actual.pid & 255) < 31 ? "female" : "male";
  state.ability = "66"; // Blaze; it cannot distinguish Torchic's ability slots.
  state.readings = [
    {
      id: `trial-${i + 1}`,
      evs: [0, 0, 0, 1, 0, 0],
      summary: { level: 5, stats },
    },
  ];
  const matches = searchStarter(state);
  const correctRetained = matches.some(
    (e) =>
      e.pid === actual.pid &&
      e.advance === advance &&
      e.ivs.join() === actual.ivs.join(),
  );
  assert.deepEqual(state.starter, timing);
  assert.ok(Math.abs(errorSeconds) <= 1);
  return {
    trial: i + 1,
    errorSeconds,
    advance,
    pid: hex(actual.pid, 8),
    ivs: actual.ivs,
    stats,
    nature: NATURES[actual.pid % 25],
    gender: state.gender,
    correctRetained,
    possiblePids: new Set(matches.map((e) => e.pid)).size,
    matches: matches.map((e) => ({
      advance: e.advance,
      pid: hex(e.pid, 8),
      ivs: e.ivs,
    })),
  };
});
const distribution: Record<number, number> = {};
for (const row of rows)
  distribution[row.possiblePids] = (distribution[row.possiblePids] ?? 0) + 1;
const result = {
  setup: {
    species: "Torchic",
    level: 5,
    evs: [0, 0, 0, 1, 0, 0],
    timing,
    target: starterTargetFrame(timing),
    range: estimatedStarterWindow(timing),
    randomSeed,
    errorModel:
      "Uniform net input error [-1, +1] seconds; calibrated center assumed correct",
    inputs:
      "All six level-5 stats, nature, gender, Blaze; no exact IVs, PID, shininess or curtain pixels supplied",
    statOrder: "HP / Atk / Def / Spe / SpA / SpD",
  },
  totals: {
    trials: rows.length,
    correctRetained: rows.filter((r) => r.correctRetained).length,
    uniqueCorrect: rows.filter((r) => r.correctRetained && r.possiblePids === 1)
      .length,
    ambiguous: rows.filter((r) => r.possiblePids > 1).length,
    zeroMatches: rows.filter((r) => !r.possiblePids).length,
    distinctLandedAdvances: new Set(rows.map((r) => r.advance)).size,
    distribution,
    errorMin: Math.min(...rows.map((r) => r.errorSeconds)),
    errorMax: Math.max(...rows.map((r) => r.errorSeconds)),
  },
  rows,
};
fs.writeFileSync(
  "research/starter-timing-simulation.json",
  JSON.stringify(result, null, 2) + "\n",
);
const csv = [
  "Trial,Input error seconds,Actual advance,Actual PID,Nature,Gender,Stats HP/Atk/Def/Spe/SpA/SpD,Possible PIDs,Correct retained,Matching advances",
];
for (const row of rows)
  csv.push(
    [
      row.trial,
      row.errorSeconds.toFixed(6),
      row.advance,
      row.pid,
      row.nature,
      row.gender,
      row.stats.join("/"),
      row.possiblePids,
      row.correctRetained,
      row.matches.map((e) => e.advance).join("/"),
    ].join(","),
  );
fs.writeFileSync(
  "research/starter-timing-simulation.csv",
  csv.join("\n") + "\n",
);
console.log(
  JSON.stringify(
    {
      setup: result.setup,
      totals: result.totals,
      ambiguousExamples: rows.filter((r) => r.possiblePids > 1).slice(0, 3),
    },
    null,
    2,
  ),
);
assert.equal(
  result.totals.correctRetained,
  100,
  "The actual PID and IV tuple must survive every simulated attempt",
);
