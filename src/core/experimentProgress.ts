import type { KnownFacts } from "./constraints";
import type { Inference } from "./inference";
import type { Snapshot } from "./investigation";
import { analyzeObservations } from "./jointInference";

/** Marginal contribution of a recorded test under today's stored-data facts.
 * Both sides use the same relaxation, before optional RNG filtering. Historical
 * candidatesBefore may count PIDs or enumerated hypotheses, so cannot supply
 * the before value for a joint-pair comparison.
 */
export function experimentProgress(
  identity: KnownFacts,
  evidence: Snapshot[],
  baseline: Snapshot,
  active: Snapshot,
  current: Inference,
  sidDigitFilters?: number[],
) {
  const completed =
    active.itemTest?.phase === "recorded"
      ? active
      : active.id === baseline.id
        ? [...evidence].reverse().find((s) => s.itemTest?.phase === "recorded")
        : undefined;
  if (
    identity.tid === undefined ||
    !completed ||
    !current.consistent ||
    evidence.some((s) => s.itemTest?.sourceId === completed.id)
  )
    return null;
  const before = analyzeObservations(
    identity,
    evidence.filter((s) => s.id !== completed.id),
    baseline,
    sidDigitFilters,
  );
  const after =
    active.id === baseline.id
      ? current
      : analyzeObservations(identity, evidence, baseline, sidDigitFilters);
  if (!before.consistent || !after.consistent) return null;
  return {
    snapshotId: completed.id,
    pairsBefore: Number(before.headerPairCount),
    pairsAfter: Number(after.headerPairCount),
    pidsBefore: Number(before.pidCount),
    pidsAfter: Number(after.pidCount),
    excludedKeyDigits: before.keyMasks.flatMap((mask, digit) => {
      const excluded = mask & ~after.keyMasks[digit];
      return excluded
        ? [
            {
              digit,
              values: Array.from({ length: 16 }, (_, n) => n).filter(
                (n) => excluded & (1 << n),
              ),
            },
          ]
        : [];
    }),
    eliminatedOrders: before.orders.filter((o) => !after.orders.includes(o)),
  };
}
export type ExperimentProgress = ReturnType<typeof experimentProgress>;
