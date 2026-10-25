import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { buildStarterCatalogue } from "../src/core/starterCatalogue";

const begin = performance.now();
const catalogue = buildStarterCatalogue();
const data = JSON.stringify(catalogue) + "\n";
const path = "src/data/starter-catalogue.json";
const digits = (mask: number) =>
  Array.from({ length: 16 }, (_, n) => n)
    .filter((n) => mask & (1 << n))
    .map((n) => n.toString(16).toUpperCase())
    .join("|");
const csv =
  [
    "advance,PID,HP_IV,Attack_IV,Defense_IV,Speed_IV,SpAttack_IV,SpDefense_IV,IV_test_S1,IV_test_S2,IV_test_S3,IV_test_S4,Base_tests_S1,Base_tests_S2,Base_tests_S3,Base_tests_S4",
    ...catalogue.spreads.map((row) =>
      [
        row.advance,
        row.pid.toString(16).toUpperCase().padStart(8, "0"),
        ...row.ivs,
        ...row.ivMasks.slice().reverse().map(digits),
        ...row.baseMasks.slice().reverse().map(digits),
      ].join(","),
    ),
  ].join("\n") + "\n";
const csvPath = "research/starter-catalogue-spreads.csv";
if (process.argv.includes("--check")) {
  if (
    !fs.existsSync(path) ||
    fs.readFileSync(path, "utf8") !== data ||
    !fs.existsSync(csvPath) ||
    fs.readFileSync(csvPath, "utf8") !== csv
  )
    throw Error("Starter catalogue is stale. Run npm run catalogue:build.");
} else {
  fs.writeFileSync(path, data);
  fs.writeFileSync(csvPath, csv);
}
console.log(
  JSON.stringify(
    {
      path,
      spreads: catalogue.spreads.length,
      preparations: catalogue.preparations.length,
      items: catalogue.items.length,
      distinctCoverage: Object.fromEntries(
        Object.entries(catalogue.options).map(([s, options]) => [
          s,
          options.length,
        ]),
      ),
      bytes: Buffer.byteLength(data),
      gzipBytes: gzipSync(data).length,
      milliseconds: Math.round(performance.now() - begin),
    },
    null,
    2,
  ),
);
