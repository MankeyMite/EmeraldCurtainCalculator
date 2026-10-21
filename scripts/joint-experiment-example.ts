import fs from "node:fs";
import { loadInvestigation } from "../src/core/investigation";
import { computeDeduction } from "../src/core/deduction";

// Reads the contributed JSON unchanged. No PID, SID, IVs or EVs are injected.
const investigation = loadInvestigation(
  fs.readFileSync(
    process.argv[2] ?? "research/fixtures/unknown-sid-user-investigation.json",
    "utf8",
  ),
);
for (const sidRng of [undefined, investigation.sidRng]) {
  const start = performance.now();
  const result = computeDeduction({ ...investigation, sidRng });
  const best = result.controlledExperiments.find(
    (e) => e.action.id === "moves-0-3",
  );
  const item = result.experiments[0];
  console.log(
    JSON.stringify(
      {
        sidRng: sidRng ?? "disabled",
        elapsedMs: Math.round(performance.now() - start),
        status: result.experimentStatus,
        pidBound: String(result.inference.pidCount),
        jointPairBound: String(result.inference.headerPairCount),
        orders: result.inference.orders,
        sidRows: result.sidResult?.rows.length,
        itemChoices: result.experiments.length,
        controlledChoices: result.controlledExperiments.map((e) => e.action.id),
        item: item && {
          name: item.item.name,
          ...result.domainQuestions[`item-${item.item.id}`],
        },
        move: best && {
          name: best.action.name,
          ...result.domainQuestions[best.action.id],
        },
        limitations: result.experimentLimitations,
      },
      null,
      2,
    ),
  );
}
