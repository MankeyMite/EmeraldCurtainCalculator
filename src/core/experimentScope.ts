import { allowedValues, type KnownFacts } from "./constraints";
import type { Snapshot } from "./investigation";
import { analyzeObservations } from "./jointInference";
import type { ExperimentDomain } from "./domainExperiments";

/** Scope rows may contain witnesses or unresolved searches. Only their SIDs
 * enter this projection. An incomplete existence search cannot remove a row.
 * Large non-Cartesian scopes are relaxed, never sampled. */
export function scopeExperimentDomain(
  identity: KnownFacts,
  snapshots: Snapshot[],
  source: Snapshot,
  rows: { sid: number }[],
): { inference: ExperimentDomain; scopeRelaxed: boolean } {
  const values = [...new Set(rows.map((r) => r.sid))];
  const masks = Array.from({ length: 4 }, (_, n) =>
    values.reduce((mask, sid) => mask | (1 << ((sid >>> (4 * n)) & 15)), 0),
  );
  const envelopeSize = masks.reduce(
    (size, m) => size * allowedValues(m).length,
    1,
  );
  if (values.length > 8 || envelopeSize === values.length)
    return {
      inference: analyzeObservations(identity, snapshots, source, masks),
      scopeRelaxed: envelopeSize !== values.length,
    };
  const models = values.map((sid) =>
    analyzeObservations({ ...identity, sid }, snapshots, source),
  );
  return {
    scopeRelaxed: false,
    inference: {
      consistent: models.some((m) => m.consistent),
      headerPairCount: models.reduce((n, m) => n + m.headerPairCount, 0n),
      orders: [...new Set(models.flatMap((m) => m.orders))].sort(
        (a, b) => a - b,
      ),
      orderKeyCounts: Array.from({ length: 24 }, (_, o) =>
        Array.from({ length: 8 }, (_, d) =>
          Array.from({ length: 16 }, (_, k) =>
            models.reduce((n, m) => n + m.orderKeyCounts[o][d][k], 0),
          ),
        ),
      ),
    },
  };
}
