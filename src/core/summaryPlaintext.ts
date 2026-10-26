import type { KnownFacts } from "./constraints";
import type { Snapshot } from "./investigation";
import { knownPlaintext } from "./inference";
import { estimateIVs } from "./stats";

/** Opt-in summary evidence for the guide's unknown-PID backup. Packed-IV nibble
 * projections are conservative: cross-nibble correlations are not invented. */
export function snapshotPlaintext(facts: KnownFacts, snapshot: Snapshot) {
  const plain = knownPlaintext(facts);
  if (!snapshot.useSummaryStats || !snapshot.summaryStats) return plain;
  const ranges = estimateIVs(
    facts,
    snapshot.summaryStats,
    Array.from({ length: 6 }, () => Array.from({ length: 32 }, (_, n) => n)),
  );
  for (let stat = 0; stat < 6; stat++) {
    const values = ranges[stat].stats;
    if (!values) continue;
    if (!values.length) {
      plain.fill(0, 80, 88);
      return plain;
    }
    for (let nibble = 0; nibble < 8; nibble++) {
      let owned = 0;
      for (let bit = 0; bit < 4; bit++)
        if (nibble * 4 + bit >= stat * 5 && nibble * 4 + bit < stat * 5 + 5)
          owned |= 1 << bit;
      if (!owned) continue;
      const fragments = new Set(
        values.map(
          (iv) =>
            Math.floor((iv * 2 ** (stat * 5)) / 2 ** (nibble * 4)) & owned,
        ),
      );
      let mask = 0;
      for (let v = 0; v < 16; v++) if (fragments.has(v & owned)) mask |= 1 << v;
      plain[80 + nibble] &= mask;
    }
  }
  return plain;
}
