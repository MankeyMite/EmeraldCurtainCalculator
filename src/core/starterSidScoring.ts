import type { SidTimingPriority } from "./starterSidPriority";
import { compareSidSteps } from "./nextSidStep";

export type SidPriorityScore = {
  informationGain: number;
  leadingGain: number;
  closestSeparation: number;
  isolatesLeading: boolean;
  confirmsLeading: boolean;
  benefit: number;
};

/** Shared guide/planning policy. Branches may overlap when plaintext or Pokemon
 * hypotheses are uncertain. They are supports, never outcome probabilities. */
export function scoreStarterSidOutcomes(
  sids: number[],
  survivors: Set<number>[],
  timing: SidTimingPriority,
): SidPriorityScore {
  const total = sids.length;
  const patternsBySid = new Map(sids.map((sid) => [sid, new Set<number>()]));
  survivors.forEach((group, pattern) =>
    group.forEach((sid) => patternsBySid.get(sid)?.add(pattern)),
  );
  const sizes = survivors.map((s) => s.size).filter(Boolean);
  const nuisance = [...patternsBySid.values()].some(
    (patterns) => patterns.size !== 1,
  );
  const informationGain =
    total < 2 || !sizes.length
      ? 0
      : nuisance
        ? Math.log2(total / Math.max(...sizes))
        : sizes.reduce((sum, n) => sum - (n / total) * Math.log2(n / total), 0);
  let leadingGain = 0,
    closestSeparation = 0;
  for (const leader of timing.leaders) {
    const patterns = patternsBySid.get(leader.sid)!;
    const worst = Math.max(...[...patterns].map((p) => survivors[p].size));
    leadingGain += worst > 0 ? Math.log2(total / worst) : 0;
    const alternatives = timing.candidates.filter(
      (c) => c.sid !== leader.sid && c.distance !== null,
    );
    const closest = alternatives.filter(
      (c) => c.distance === alternatives[0]?.distance,
    );
    closestSeparation += closest.length
      ? closest.filter(
          (c) => ![...patterns].some((p) => patternsBySid.get(c.sid)!.has(p)),
        ).length / closest.length
      : 0;
  }
  const leaders = timing.leaders;
  leadingGain /= leaders.length || 1;
  closestSeparation /= leaders.length || 1;
  const single =
    leaders.length === 1 ? patternsBySid.get(leaders[0].sid)! : null;
  const confirmsLeading =
    !!single && [...single].some((p) => survivors[p].size === 1);
  const isolatesLeading = confirmsLeading && single!.size === 1;
  // Bounded information bonuses, divided by real action cost by the caller.
  // They express a preference, not a timing-derived success probability.
  return {
    informationGain,
    leadingGain,
    closestSeparation,
    isolatesLeading,
    confirmsLeading,
    benefit:
      informationGain +
      2 * leadingGain +
      closestSeparation +
      (isolatesLeading ? 1 : confirmsLeading ? 0.5 : 0),
  };
}

export function compareStarterSidExperiments(
  a: {
    seconds: number;
    informationGain: number;
    lastResort?: boolean;
    benefit: number;
  },
  b: {
    seconds: number;
    informationGain: number;
    lastResort?: boolean;
    benefit: number;
  },
) {
  return (
    Number(!!a.lastResort) - Number(!!b.lastResort) ||
    b.benefit / Math.max(1, b.seconds) - a.benefit / Math.max(1, a.seconds) ||
    compareSidSteps(a, b)
  );
}
