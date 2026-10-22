import {
  emptyObservations,
  type KnownFacts,
  type Observations,
} from "./constraints";
import { analyzeConstraints, type Inference } from "./inference";
import { describeByte } from "./inspection";

export const visibleState = (mask: number): -1 | 0 | 1 =>
  mask === 1 ? 0 : mask && !(mask & 1) ? 1 : -1;
export function completeAssistedDrawing(
  observations: Observations,
  predictions: Observations,
  includeNeighbors = false,
): Observations {
  return observations.map((value, n) =>
    value === -1 && (includeNeighbors || (n >= 16 && n < 176))
      ? predictions[n] === -1
        ? 0
        : predictions[n]
      : value,
  );
}
const independentCache = new Map<string, Inference>();

/** Render-only assistance until the player explicitly confirms the full visible
 * pattern with Finish drawing. This function never mutates observations.
 * Superset projections can miss deductions but
 * cannot invent a guarantee by choosing one representative hypothesis. */
export function pixelAssistance(
  observations: Observations,
  facts: KnownFacts,
  inference?: Inference,
  jointMasks?: number[],
) {
  const signature = JSON.stringify(facts);
  let independent = independentCache.get(signature);
  if (!independent) {
    independent = analyzeConstraints(Array(160).fill(65535), facts);
    if (independentCache.size >= 8) independentCache.clear();
    independentCache.set(signature, independent);
  }
  const current =
    inference ??
    analyzeConstraints(
      observations
        .slice(16, 176)
        .map((v) => (v === 0 ? 1 : v === 1 ? 65534 : 65535)),
      facts,
    );
  const source =
    current.consistent && jointMasks?.some(Boolean)
      ? jointMasks
      : current.consistent
        ? current.masks
        : independent.masks;
  const predictions = emptyObservations(),
    reasons = Array<string>(192).fill("");
  const contradictions = new Set<number>();
  for (let n = 0; n < 160; n++) {
    const index = n + 16,
      byte = n >> 1;
    const independentState = independent.consistent
      ? visibleState(independent.masks[n])
      : -1;
    // For observed cells, use only independent facts to diagnose disagreement.
    predictions[index] =
      observations[index] === -1 ? visibleState(source[n]) : independentState;
    if (
      observations[index] !== -1 &&
      independentState !== -1 &&
      observations[index] !== independentState
    )
      contradictions.add(index);
    if (predictions[index] === -1) continue;
    const orders = current.consistent ? current.orders : independent.orders;
    const names = new Set(
      orders.map((order) => describeByte(byte, order).name),
    );
    const name = names.size === 1 ? [...names][0] : "Encrypted data";
    reasons[index] =
      byte === 28 || byte === 29
        ? "Checksum constraint (24 decrypted 16-bit words)"
        : byte < 32
          ? `Known ${name} / compatible header constraints`
          : `${name}; known plaintext and all compatible XOR keys / PID orders`;
    if (facts.shiny !== undefined)
      reasons[index] +=
        `; ${facts.shiny ? "shiny" : "not shiny"} constraint active`;
    if (facts.assumed?.length)
      reasons[index] += " · Conditional on active assumptions";
  }
  return {
    predictions,
    reasons,
    contradictions,
    consistent: current.consistent,
    conflictReason: current.consistent
      ? null
      : "Known facts and recorded pixels conflict. Recheck the highlighted observations, entered fields, optional assumptions and snapshot refresh; manual observations were preserved.",
  };
}
