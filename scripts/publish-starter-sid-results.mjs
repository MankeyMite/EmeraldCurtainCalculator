import fs from "node:fs";
import assert from "node:assert/strict";
const primary = JSON.parse(
  fs.readFileSync("research/starter-sid-recovery-simulation.json", "utf8"),
);
const audit = JSON.parse(
  fs.readFileSync("research/starter-sid-stall-audit.json", "utf8"),
);
const fallback = new Map(audit.rows.map((r) => [`${r.trial}/${r.species}`, r]));
const csvValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const headers = [
  "case",
  "starter",
  "TID",
  "SID",
  "SID_hex",
  "starter_advance",
  "PID",
  "IVs_HP_Atk_Def_Spe_SpA_SpD",
  "nature",
  "starter_retries",
  "initial_SID_candidates",
  "after_first_drawing",
  "current_guide_status",
  "current_guide_experiments",
  "targeted_pixel_answers",
  "EV_redraws",
  "collected_item_count",
  "distinct_held_items_used",
  "manual_fallback_checkpoints",
  "fallback_one_EV_battles",
  "maximum_fallback_EV_target",
  "recovered_with_fallback",
  "total_experiments_with_fallback",
];
let total = 0,
  recovered = 0,
  maximum = 0;
const lines = primary.rows.map((r) => {
  const f = fallback.get(`${r.trial}/${r.species}`);
  assert.equal(!!f, r.status !== "recovered");
  if (f) assert.ok(f.manuallyRecovered);
  const experiments = r.experimentCount + (f?.additionalCheckpoints ?? 0);
  total += experiments;
  maximum = Math.max(maximum, experiments);
  if (r.status === "recovered" || f?.manuallyRecovered) recovered++;
  return [
    r.trial,
    r.species,
    r.tid,
    r.trueSid,
    r.trueSidHex,
    r.starter.advance,
    r.starter.pid,
    r.starter.ivs.join("/"),
    r.starter.nature,
    r.starter.retries,
    r.initialSidCandidates,
    r.afterDrawing,
    r.status,
    r.experimentCount,
    r.pixelQuestions,
    r.fullRedraws,
    r.route.items.length,
    new Set(
      [
        r.route.heldItem,
        ...r.experiments.filter((e) => e.kind === "item").map((e) => e.item),
      ].filter(Boolean),
    ).size,
    f?.additionalCheckpoints ?? 0,
    f?.steps.reduce((n, s) => n + s.battles, 0) ?? 0,
    f ? Math.max(...f.steps.map((s) => s.target)) : 0,
    true,
    experiments,
  ]
    .map(csvValue)
    .join(",");
});
assert.equal(recovered, 300);
assert.equal(lines.length, 300);
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(
  "artifacts/Starter-SID-Simulation-All-300-Results.csv",
  "\uFEFF" + [headers.join(","), ...lines].join("\r\n") + "\r\n",
);
console.log(
  JSON.stringify(
    {
      runs: lines.length,
      recoveredWithFallback: recovered,
      meanWithFallback: total / lines.length,
      maximumWithFallback: maximum,
      totalExperiments: total,
      negativeControlPassed: audit.negativeControlPassed,
    },
    null,
    2,
  ),
);
