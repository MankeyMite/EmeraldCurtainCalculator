import type { KnownFacts } from "./constraints";

export const EXPERIMENT_SECONDS = {
  item: 30,
  vitamin: 10,
  battle: 60,
  catch: 240,
};
export type EvTrainingPlan = {
  target: number;
  vitamins: number;
  battles: number;
  gain: number;
  removeBrace: boolean;
  seconds: number;
  lastResort: boolean;
};

/** Train from the saved baseline, then return to inspect the curtain. Vitamins
 * precede battles, as Emerald stops accepting them at 100 EVs. The 60 seconds
 * per battle includes returning to check; it is not an extra 30-second battle. */
export function evTrainingPlan(
  facts: KnownFacts,
  stat: number,
  target: number,
): EvTrainingPlan | null {
  if (!facts.evs || facts.evs.some((n) => n === null)) return null;
  const evs = facts.evs as number[],
    start = evs[stat];
  const cap = Math.min(255, start + 510 - evs.reduce((a, b) => a + b, 0));
  if (!Number.isInteger(target) || target <= start || target > cap) return null;
  // Both active and cured Pokerus retain their EV multiplier.
  const multiplier =
    facts.pokerus === undefined ? undefined : facts.pokerus >>> 4 ? 2 : 1;
  const gains =
    multiplier === undefined
      ? []
      : facts.heldItem === 181
        ? [multiplier, multiplier * 2]
        : [multiplier];
  let best: EvTrainingPlan | null = null;
  let checkpoint = start;
  for (let vitamins = 0; ; vitamins++) {
    const remaining = target - checkpoint;
    for (const gain of remaining === 0 ? [multiplier ?? 1] : gains) {
      const battles = Math.ceil(remaining / gain);
      // A stat/total cap can truncate the final battle's EV award.
      if (remaining < 0 || (remaining % gain !== 0 && target !== cap)) continue;
      const removeBrace =
        battles > 0 &&
        (facts.heldItem === undefined ||
          (facts.heldItem === 181 && gain === multiplier));
      const plan = {
        target,
        vitamins,
        battles,
        gain,
        removeBrace,
        seconds:
          30 +
          vitamins * EXPERIMENT_SECONDS.vitamin +
          battles * EXPERIMENT_SECONDS.battle +
          (removeBrace ? 2 * EXPERIMENT_SECONDS.item : 0),
        lastResort: target > 110,
      };
      if (!best || plan.seconds < best.seconds) best = plan;
    }
    const next = Math.min(100, cap, checkpoint + 10);
    if (next <= checkpoint || next > target) break;
    checkpoint = next;
  }
  return best;
}
