// Produce a review copy, keeping disputed pixels UNKNOWN rather than copying
// the reference record's predictions into experimental evidence.
import fs from "node:fs";
import {
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { decodePokemon } from "../src/core/pokemon";
import { compareCandidate, recordMasks } from "../src/core/constraints";
import { analyzeConstraints } from "../src/core/inference";
import { solveSids } from "../src/core/sid";
import { windowLayout } from "../src/core/window";
import { pixelAddress } from "../src/core/tiles";
const original = loadInvestigation(
  fs.readFileSync(
    "research/fixtures/poochyena-user-investigation.json",
    "utf8",
  ),
);
const bytes = new Uint8Array(
  fs.readFileSync("research/fixtures/poochyena-test.ek3"),
);
const record = decodePokemon(bytes),
  snapshot = original.snapshots[0];
const comparison = compareCandidate(
  snapshot.observations,
  { 5: bytes },
  { ...snapshot.knownFacts, ...original.identity },
);
const pixels = comparison.contradictions.map((index) => {
  const positions: {
    x: number;
    y: number;
    curtainRow: number;
    curtainColumn: number;
  }[] = [];
  for (const placement of windowLayout("left").placements)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        if (
          pixelAddress(placement.tile, x, y, placement.hflip, placement.vflip)
            .nibble === index
        )
          positions.push({
            x: placement.x + x,
            y: placement.y + y,
            curtainRow: placement.y + y - 18 + 1,
            curtainColumn: placement.x + x - 16 + 1,
          });
      }
  const offset = Math.floor((index - 16) / 2),
    side = (index - 16) % 2;
  const actual = (bytes[offset] >>> (side * 4)) & 15;
  return {
    index,
    byte: `0x${offset.toString(16).toUpperCase()}`,
    nibble: side ? "high" : "low",
    observed: snapshot.observations[index] === 1 ? "Black" : "Transparent",
    reference: actual ? "Black" : "Transparent",
    positions,
  };
});
const review = structuredClone(original);
review.identity.metGame = record.metGame;
for (const index of comparison.contradictions)
  review.snapshots[0].observations[index] = -1;
review.snapshots[0].targets = comparison.contradictions;
review.snapshots[0].notes =
  "Review copy: origin game corrected to Emerald (3) from supplied checksum-valid .ek3. Pixels 122 and 130 differed from that reference and are now UNKNOWN, not transparent. Recheck them independently in game. No PID, SID or IVs were copied into known facts.";
const inference = analyzeConstraints(
  recordMasks(review.snapshots[0].observations, 5),
  { ...review.snapshots[0].knownFacts, ...review.identity },
);
const result =
  inference.pidValues?.length && inference.pidValues.length <= 32
    ? solveSids(review.identity, review.snapshots, inference.pidValues)
    : null;
const truthCheck = analyzeConstraints(
  recordMasks(review.snapshots[0].observations, 5),
  { ...review.snapshots[0].knownFacts, ...review.identity, pid: record.pid },
);
const conditionalSids = solveSids(
  { ...review.identity, pid: record.pid },
  review.snapshots,
  [record.pid],
);
fs.writeFileSync(
  "research/fixtures/poochyena-review-investigation.json",
  saveInvestigation(review) + "\n",
);
console.log(
  JSON.stringify(
    {
      checksumValid: record.checksumValid,
      pixels,
      factConflicts: comparison.factContradictions,
      remainingPidCount: inference.pidCount.toString(),
      pids: inference.pidValues,
      sidCount: result?.sidValues.length,
      groundTruthPidSurvives: truthCheck.pidCount === 1n,
      conditionalSidCountWithReferencePid: conditionalSids.sidValues.length,
      groundTruthSidSurvives: conditionalSids.sidValues.includes(record.sid),
    },
    null,
    2,
  ),
);
