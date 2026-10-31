import { allowedValues, type KnownFacts } from "./constraints";
import { FACT_CATALOGS } from "./catalogs";
import { WILD_METHODS, summaryMatchesSpread, type WildMethod } from "./rng";
import type { SummaryStats } from "./stats";
import { newSnapshot } from "./investigation";
import type { SpindaCandidate } from "./spindaMatcher";
import { initialWildMoves } from "./consumableEffects";
import {
  guidePlaintextDetails,
  newSpindaSidGuide,
  spindaInfoPlaintext,
  spindaRngEvidence,
  spindaSidMasks,
  spindaSidTargets,
  type SpindaSidGuideState,
} from "./spindaSidGuide";

/** Masks use the same little-endian order as the main SID controls: S4..S1. */
export type SpindaSidProgress = { remainingSids?: number[]; tested: number[] };
export const emptySpindaProgress = (): SpindaSidProgress => ({
  tested: [0, 0, 0, 0],
});

/** Carry trainer identity between catches without inventing blank fact entries. */
export function spindaTrainerFacts(facts: KnownFacts): KnownFacts {
  return Object.fromEntries(
    Object.entries(facts).filter(
      ([key, value]) =>
        ["tid", "sid", "otName", "otGender"].includes(key) &&
        value !== undefined,
    ),
  );
}

export function sidCandidateMasks(sids?: number[]) {
  if (!sids) return [65535, 65535, 65535, 65535];
  return [0, 1, 2, 3].map((n) =>
    sids.reduce((mask, sid) => mask | (1 << ((sid >>> (n * 4)) & 15)), 0),
  );
}

export function usefulSpindaTargets(
  guide: SpindaSidGuideState,
  remaining: number[],
  tested: number[],
  info?: number[],
  rng?: number[],
) {
  return ([1, 2, 3, 4] as const).flatMap((digit) => {
    const position = 4 - digit,
      seen = new Set<number>();
    // One pixel per position/candidate, even when several fields repeat it.
    return spindaSidTargets(guide.pid, digit)
      .sort((a, b) => Number(b.block === 2) - Number(a.block === 2))
      .flatMap((target) => {
        const plain = guidePlaintextDetails(guide, target, info, rng).value;
        if (
          plain === undefined ||
          guide.observations[target.nibble] !== undefined
        )
          return [];
        const candidate = plain ^ target.pidDigit,
          bit = 1 << candidate;
        if (
          !(remaining[position] & bit) ||
          tested[position] & bit ||
          seen.has(candidate) ||
          !(remaining[position] & (remaining[position] - 1))
        )
          return [];
        seen.add(candidate);
        return [{ ...target, plaintext: plain, candidate }];
      });
  });
}

export function testedSpindaDigits(
  guide: SpindaSidGuideState,
  info?: number[],
  rng?: number[],
) {
  const masks = [0, 0, 0, 0];
  for (const digit of [1, 2, 3, 4] as const)
    for (const target of spindaSidTargets(guide.pid, digit)) {
      const plain = guidePlaintextDetails(guide, target, info, rng).value;
      if (
        plain !== undefined &&
        guide.observations[target.nibble] !== undefined
      )
        masks[4 - digit] |= 1 << (plain ^ target.pidDigit);
    }
  return masks;
}

/** Preserve whole IV-word correlations while carrying SID evidence to another catch. */
export function spindaRemainingSids(
  guide: SpindaSidGuideState,
  base: number[] | undefined,
  filters: number[],
  info?: number[],
  plaintexts?: number[][],
) {
  const alternatives = (plaintexts ?? [undefined]).map((plain) =>
    spindaSidMasks(guide, info, plain ? [plain] : undefined, filters).reverse(),
  );
  return (base ?? Array.from({ length: 65536 }, (_, sid) => sid)).filter(
    (sid) =>
      alternatives.some((masks) =>
        masks.every(
          (mask, n) => (mask & (1 << ((sid >>> (n * 4)) & 15))) !== 0,
        ),
      ),
  );
}

export function spindaStatCandidate(
  candidate: SpindaCandidate | undefined,
  facts: KnownFacts,
  summary?: SummaryStats,
) {
  if (!candidate || !summary) return candidate;
  const snapshot = {
    ...newSnapshot("stats", "Stats"),
    knownFacts: facts,
    summaryStats: summary,
  };
  return {
    ...candidate,
    encounters: candidate.encounters.filter((e) =>
      summaryMatchesSpread(308, candidate.pid, e.ivs, [snapshot]),
    ),
  };
}

export function spindaUsefulness(
  candidate: SpindaCandidate,
  remaining: number[],
  tested: number[],
  otGender?: KnownFacts["otGender"],
) {
  const guide = {
    ...newSpindaSidGuide(candidate.pid),
    freshZeros: true,
    paddingZero: true,
  };
  const evaluate = (ball: number) =>
    Object.fromEntries(
      WILD_METHODS.map((method) => {
        const keys = new Set<string>();
        for (const encounter of candidate.encounters.filter((e) =>
          e.methods.includes(method),
        )) {
          const info = spindaInfoPlaintext({
            species: 308,
            metGame: 3,
            ball,
            metLevel: encounter.level,
            otGender,
            ...initialWildMoves(308, encounter.level),
            ppBonuses: 0,
          });
          const rng = spindaRngEvidence(candidate.pid, {
            pid: candidate.pid,
            encounters: [encounter],
          });
          for (const target of usefulSpindaTargets(
            guide,
            remaining,
            tested,
            info,
            rng?.masks,
          ))
            keys.add(`${target.digit}:${target.candidate}`);
        }
        return [method, keys];
      }),
    ) as Record<WildMethod, Set<string>>;
  const baseline = evaluate(4);
  let selected = baseline,
    ball = 4,
    gain = 0;
  // Ordinary Route 113 catches: Safari Ball is unavailable; don't spend a Master Ball.
  for (const option of FACT_CATALOGS.balls.filter(
    (b) => ![1, 4, 5].includes(b.id),
  )) {
    const next = evaluate(option.id);
    const additional = new Set(
      WILD_METHODS.flatMap((m) =>
        [...next[m]].filter((k) => !baseline[m].has(k)),
      ),
    ).size;
    const total = WILD_METHODS.reduce((n, m) => n + next[m].size, 0);
    const current = WILD_METHODS.reduce((n, m) => n + selected[m].size, 0);
    if (
      additional > 0 &&
      (total > current || (total === current && additional > gain))
    ) {
      selected = next;
      ball = option.id;
      gain = additional;
    }
  }
  return {
    ball,
    suggested: gain > 0,
    counts: Object.fromEntries(
      WILD_METHODS.map((m) => [m, selected[m].size]),
    ) as Record<WildMethod, number>,
  };
}
