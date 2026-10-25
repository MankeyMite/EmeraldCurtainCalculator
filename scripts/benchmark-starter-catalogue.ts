import fs from "node:fs";
import os from "node:os";
import type { StarterCatalogue } from "../src/core/starterCatalogue";
import {
  scanStarterCatalogue,
  rankCatalogueTargets,
} from "../src/core/starterCatalogueScan";
import { newStarterGuide } from "../src/core/starterGuide";
import { genderForPid } from "../src/core/traits";

const catalogue = JSON.parse(
  fs.readFileSync("src/data/starter-catalogue.json", "utf8"),
) as StarterCatalogue;
const tids = process.argv.slice(2).map(Number);
if (!tids.length) tids.push(48734, 30134, 52759, 46049, 16159);
const results = [];
for (const tid of tids) {
  const state = newStarterGuide(),
    start = performance.now();
  const scan = scanStarterCatalogue(
    catalogue,
    { tid, intro: state.intro, starter: state.starter },
    (done, total) => {
      if (done === total || done % 256 === 1)
        console.log(`TID ${tid}: ${done}/${total} advances`);
    },
  );
  const milliseconds = Math.round(performance.now() - start);
  const baselineRows = scan.landings.filter(
    (r) => r.species === 280 && Math.abs(r.advance - 1195) <= 60,
  );
  const signature = (advance: number) => {
    const s = catalogue.spreads[advance - catalogue.rules.minAdvance];
    return `${s.pid % 25}/${genderForPid(280, s.pid)}/${s.level5Stats[280]}`;
  };
  const signatures = baselineRows.map((r) => signature(r.advance));
  const baselineDrawingOnly =
    baselineRows.reduce(
      (sum, row, n) =>
        sum +
        (signatures.filter((s) => s === signatures[n]).length === 1
          ? row.drawingOnly
          : 0),
      0,
    ) /
    (baselineRows.length * scan.priority.length);
  const row = {
    tid,
    milliseconds,
    fullSidCount: scan.fullSidCount,
    priority: scan.priority,
    evaluatedSetups: scan.evaluatedSetups,
    assumptions: scan.assumptions,
    targets: scan.targets,
    tighterTimingTargets: rankCatalogueTargets(
      catalogue,
      scan.landings,
      state.starter,
      scan.priority.length,
      9,
      scan.sidWeights,
    ),
    longestPerfectDrawingRun: [277, 280, 283].map((species) => {
      const rows = scan.landings.filter((r) => r.species === species);
      let longest = 0,
        start = 0,
        run = 0,
        bestStart = 0;
      for (const r of rows) {
        if (r.drawingOnly === scan.priority.length) {
          if (!run) start = r.advance;
          run++;
          if (run > longest) {
            longest = run;
            bestStart = start;
          }
        } else run = 0;
      }
      return {
        species,
        length: longest,
        minAdvance: longest ? bestStart : null,
        maxAdvance: longest ? bestStart + longest - 1 : null,
        note: "Known-pixel coverage for all 19 likely SIDs; PID-identification ambiguity must still be checked for a chosen search window.",
      };
    }),
    baseline: {
      description:
        "Fixed 20-second Torchic target (advance 1195), using the same optimized catalogue preparations and ±60 landing window",
      expectedDrawingOnly: baselineDrawingOnly,
    },
  };
  results.push(row);
  console.log(
    JSON.stringify({ tid, milliseconds, recommended: scan.recommended }),
  );
}
fs.writeFileSync(
  "research/starter-catalogue-benchmark.json",
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      cpu: os.cpus()[0]?.model,
      range: [catalogue.rules.minAdvance, catalogue.rules.maxAdvance],
      timing: newStarterGuide().intro,
      results,
    },
    null,
    2,
  ) + "\n",
);
