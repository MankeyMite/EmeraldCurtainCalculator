import { SUBSTRUCT_POSITIONS } from "./pokemon";
import type { Hypothesis } from "./sid";
import { checksumPixelOutcomes, scoreOutcomes } from "./checksum";

/** Enumerate observable patterns, not PID/SID space. Unknown plaintext keeps
 * an identity in every supported binary outcome. Independent nuisance domains
 * are an outer approximation; the worst-case survivor count remains sound. */
export function rankPixelDomains(
  candidates: Hypothesis[],
  plain: number[],
  positions: number[],
  supports?: number[][],
  delta: number | null = null,
  verified = new Set<number>(),
  budget = 4096,
) {
  let size = 0;
  const cache = new Map<number[], ReturnType<typeof checksumPixelOutcomes>>();
  const outcomes: { index: number; value: number }[][][] = [];
  for (let i = 0; i < candidates.length; i++) {
    const h = candidates[i],
      blocks = SUBSTRUCT_POSITIONS[h.pid % 24];
    let patterns: { index: number; value: number }[][] = [[]];
    if (supports && delta !== null) {
      let cs = cache.get(supports[i]);
      if (!cs) {
        cs = checksumPixelOutcomes(supports[i], delta);
        cache.set(supports[i], cs);
      }
      patterns = cs.map((p) => p.filter((p) => !verified.has(p.index)));
    }
    for (const index of positions) {
      const physical = index - 80;
      const logical =
        blocks.indexOf(Math.floor(physical / 24)) * 24 + (physical % 24);
      const mask = plain[logical],
        k = (h.key >>> ((physical % 8) * 4)) & 15;
      const binary = [
        ...(mask & (1 << k) ? [0] : []),
        ...(mask & (65535 ^ (1 << k)) ? [1] : []),
      ];
      if (size + patterns.length * binary.length > budget) return null;
      patterns = patterns.flatMap((p) =>
        binary.map((value) => [...p, { index, value }]),
      );
    }
    size += patterns.length;
    if (size > budget) return null;
    outcomes.push(patterns);
  }
  const ranked = scoreOutcomes(outcomes);
  const nuisance = outcomes.some((patterns) => patterns.length > 1);
  return {
    ...ranked,
    // Unknown fields have no established probability distribution. Rank their
    // overlapping supports by a survivor bound, without claiming entropy.
    expectedRemaining: nuisance ? ranked.worstCase : ranked.expectedRemaining,
    informationGain: nuisance ? 0 : ranked.informationGain,
  };
}
