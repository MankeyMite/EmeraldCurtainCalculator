import fs from "node:fs";
import { analyzeConstraints, fieldPossibilities } from "../src/core/inference";
import { recordMasks, type KnownFacts } from "../src/core/constraints";
import { loadSession } from "../src/core/session";

if (process.argv[2]) {
  const session = loadSession(fs.readFileSync(process.argv[2], "utf8"));
  const r = analyzeConstraints(
    recordMasks(session.observations, 5),
    session.knownFacts,
  );
  console.log(
    JSON.stringify(
      {
        observed: session.observations.filter((v) => v !== -1).length,
        facts: session.knownFacts,
        pidCount: r.pidCount.toString(),
        pidValues: r.pidValues,
        consistent: r.consistent,
      },
      null,
      2,
    ),
  );
  process.exit(r.consistent ? 0 : 1);
}

for (const reference of ["emulator-ss8", "emulator-latios-ss9"]) {
  const masks = recordMasks(
    loadSession(
      fs.readFileSync(
        `research/fixtures/${reference}/observations.json`,
        "utf8",
      ),
    ).observations,
    5,
  );
  const facts: KnownFacts[] =
    reference === "emulator-ss8"
      ? [
          {},
          { species: 298 },
          { species: 298, evs: [0, 0, 0, 0, 0, 0] },
          { species: 298, evs: [0, 0, 0, 0, 0, 0], tid: 38726 },
          { species: 298, evs: [0, 0, 0, 0, 0, 0], tid: 38726, nature: 7 },
        ]
      : [
          {},
          { species: 408 },
          { species: 408, evs: [30, 8, 4, 90, 32, 2] },
          {
            species: 408,
            evs: [30, 8, 4, 90, 32, 2],
            tid: 27292,
            sid: 18230,
            nature: 22,
          },
        ];
  for (const known of facts) {
    const start = performance.now(),
      r = analyzeConstraints(masks, known);
    console.log(
      JSON.stringify({
        reference,
        known,
        ms: Math.round(performance.now() - start),
        consistent: r.consistent,
        pidCount: r.pidCount.toString(),
        headerPairs: r.headerPairCount.toString(),
        orders: r.orders,
        exactNibbles: r.masks.filter((m) => m !== 0 && (m & (m - 1)) === 0)
          .length,
        plaintextExact: r.plaintextMasks.filter(
          (m) => m !== 0 && (m & (m - 1)) === 0,
        ).length,
        hpEV: fieldPossibilities(
          r.plaintextMasks,
          r.plaintextByteValues,
          24,
          1,
        ).count.toString(),
      }),
    );
  }
}
