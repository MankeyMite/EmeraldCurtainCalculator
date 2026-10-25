import fs from "node:fs";
import assert from "node:assert/strict";
const shardCount = Number(process.argv[2] ?? 8);
const files = Array.from(
  { length: shardCount },
  (_, i) => `research/local-history/sid-sim-shard-${i}.json`,
);
const shards = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const config = { ...shards[0].config };
delete config.shardIndex;
delete config.shardCount;
for (const s of shards) {
  assert.deepEqual(s.config.sourceHashes, config.sourceHashes);
  assert.equal(s.config.seed, config.seed);
}
const rows = shards
  .flatMap((s) => s.rows)
  .sort((a, b) => a.trial - b.trial || a.species.localeCompare(b.species));
assert.equal(rows.length, config.runs);
assert.equal(
  new Set(rows.map((r) => `${r.trial}/${r.species}`)).size,
  config.runs,
);
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
function aggregate(sample) {
  const successes = sample.filter((r) => r.status === "recovered"),
    failed = sample.filter((r) => r.status !== "recovered");
  const v = successes.map((r) => r.experimentCount).sort((a, b) => a - b);
  const experiments = sample.flatMap((r) => r.experiments);
  return {
    runs: sample.length,
    recovered: successes.length,
    unresolved: failed.length,
    trueSidRetained: sample.filter((r) => r.audits.trueSidRetained).length,
    zeroExperiments: successes.filter((r) => r.experimentCount === 0).length,
    meanExperimentsSuccessful: mean(v),
    medianExperimentsSuccessful:
      v.length % 2
        ? v[Math.floor(v.length / 2)]
        : (v[v.length / 2 - 1] + v[v.length / 2]) / 2,
    maxExperimentsSuccessful: Math.max(...v),
    p90ExperimentsSuccessful: v[Math.ceil(0.9 * v.length) - 1],
    meanExperimentsAttemptedAll: mean(sample.map((r) => r.experimentCount)),
    successDistribution: Object.fromEntries(
      [...new Set(v)].map((n) => [n, v.filter((x) => x === n).length]),
    ),
    stalledDistribution: Object.fromEntries(
      [...new Set(failed.map((r) => r.experimentCount))]
        .sort((a, b) => a - b)
        .map((n) => [n, failed.filter((r) => r.experimentCount === n).length]),
    ),
    meanAfterDrawing: mean(sample.map((r) => r.afterDrawing)),
    maxAfterDrawing: Math.max(...sample.map((r) => r.afterDrawing)),
    meanPixelQuestionsSuccessful: mean(successes.map((r) => r.pixelQuestions)),
    starterRetries: sample.reduce((n, r) => n + r.starter.retries, 0),
    ambiguousFirstAttempts: sample.filter(
      (r) => r.starter.attempts[0].matchingPids > 1,
    ).length,
    distinctAcceptedPids: new Set(sample.map((r) => r.starter.pid)).size,
    kinds: Object.fromEntries(
      ["item", "moves", "ev"].map((kind) => [
        kind,
        experiments.filter((e) => e.kind === kind).length,
      ]),
    ),
    lastResortExperiments: experiments.filter((e) => e.lastResort).length,
    meanRouteItems: mean(sample.map((r) => r.route.items.length)),
    meanDistinctItemsUsed: mean(
      sample.map(
        (r) =>
          new Set(
            [
              r.route.heldItem,
              ...r.experiments
                .filter((e) => e.kind === "item")
                .map((e) => e.item),
            ].filter(Boolean),
          ).size,
      ),
    ),
    routeTraining: sample.filter((r) =>
      r.route.battles.some((b) => b.id.startsWith("journey-ev-")),
    ).length,
    routeLevel10: sample.filter((r) =>
      r.route.moves.includes(
        r.species === "Torchic" ? 52 : r.species === "Mudkip" ? 55 : 98,
      ),
    ).length,
    extraEVBattles: experiments
      .filter((e) => e.kind === "ev")
      .reduce((n, e) => n + e.training.battles, 0),
    maxEVTarget: Math.max(
      0,
      ...experiments
        .filter((e) => e.kind === "ev")
        .map((e) => e.training.target),
    ),
    minimumRemainingWhenStalled: failed.length
      ? Math.min(...failed.map((r) => r.finalSids.length))
      : 0,
    maximumRemainingWhenStalled: failed.length
      ? Math.max(...failed.map((r) => r.finalSids.length))
      : 0,
  };
}
const summary = {
  overall: aggregate(rows),
  byStarter: Object.fromEntries(
    ["Treecko", "Torchic", "Mudkip"].map((name) => [
      name,
      aggregate(rows.filter((r) => r.species === name)),
    ]),
  ),
  totalComputations: shards.reduce(
    (n, s) => n + s.summary.totalComputations,
    0,
  ),
  distinctTids: new Set(rows.map((r) => r.tid)).size,
  distinctSids: new Set(rows.map((r) => r.trueSid)).size,
  sourceVerified: true,
};
const output = { config, summary, rows };
fs.writeFileSync(
  "research/starter-sid-recovery-simulation.json",
  JSON.stringify(output, null, 2) + "\n",
);
const csv =
  [
    "trial,starter,TID,SID,starter_advance,PID,retries,initial_SID_candidates,after_drawing,experiments,pixel_questions,EV_redraws,status,remaining_SIDs",
    ...rows.map((r) =>
      [
        r.trial,
        r.species,
        r.tid,
        r.trueSid,
        r.starter.advance,
        r.starter.pid,
        r.starter.retries,
        r.initialSidCandidates,
        r.afterDrawing,
        r.experimentCount,
        r.pixelQuestions,
        r.fullRedraws,
        r.status,
        `"${r.finalSids.join(";")}"`,
      ].join(","),
    ),
  ].join("\n") + "\n";
fs.writeFileSync("research/starter-sid-recovery-simulation.csv", csv);
console.log(JSON.stringify(summary, null, 2));
