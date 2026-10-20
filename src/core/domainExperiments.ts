import { allowedValues, type KnownFacts } from "./constraints";
import { knownPlaintext, type Inference } from "./inference";
import type { Snapshot } from "./investigation";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { ITEM_CATALOG, type rankItemExperiments } from "./experiments";
import {
  controlledActions,
  type rankControlledExperiments,
} from "./controlledExperiments";

export type DomainQuestion = {
  index: number;
  keyDigit: number;
  digits: number[];
  transparentCount: number;
  blackCount: number;
  total: number;
  conditional: boolean;
};

/** Large PID sets stay in residue-DP form. Fixed trainer IDs make each PID a
 * unique key. Per-order key marginals count a SINGLE binary pixel question
 * exactly under the stored-data model, without treating digits as independent.
 * Unknown plaintext allows both outcomes, conservatively retaining the PID.
 * This deliberately does not invent checksum supports or RNG/IV/EV tuples.
 */
export function rankDomainExperiments(
  identity: KnownFacts,
  snapshots: Snapshot[],
  source: Snapshot,
  inference: Inference,
) {
  const experiments: ReturnType<typeof rankItemExperiments> = [],
    controlledExperiments: ReturnType<typeof rankControlledExperiments> = [],
    questions: Record<string, DomainQuestion> = {};
  const total = Number(inference.pidCount);
  if (
    identity.tid === undefined ||
    identity.sid === undefined ||
    !inference.consistent ||
    total <= 1
  )
    return { experiments, controlledExperiments, questions };
  const original = { ...source.knownFacts, ...identity };
  const previous = snapshots
    .filter((s) => s.itemTest?.sourceId === source.id)
    .map((s) => ({
      snapshot: s,
      plain: knownPlaintext({ ...s.knownFacts, ...identity }),
    }));
  const rank = (id: string, changes: KnownFacts, logical: number[]) => {
    const facts = { ...original, ...changes };
    delete facts.checksum;
    // Match the recorded experiment's conservative side-effect policy.
    delete facts.friendship;
    const plain = knownPlaintext(facts);
    const positions = new Set<number>();
    for (const order of inference.orders)
      for (const n of logical)
        positions.add(
          80 + SUBSTRUCT_POSITIONS[order][Math.floor(n / 24)] * 24 + (n % 24),
        );
    const verified = new Set<number>();
    for (const { snapshot: s, plain: before } of previous) {
      const same =
        (id.startsWith("item-")
          ? !s.itemTest!.actionId && s.knownFacts.heldItem === changes.heldItem
          : s.itemTest!.actionId === id) &&
        plain.every((m, n) => n === 18 || n === 19 || m === before[n]);
      if (same)
        s.observations.forEach((v, n) => {
          if (v !== -1) verified.add(n);
        });
    }
    let best: DomainQuestion | null = null;
    for (const index of positions) {
      if (verified.has(index)) continue;
      const physical = index - 80,
        keyDigit = physical % 8;
      let transparentCount = 0,
        blackCount = 0;
      const digits = new Set<number>();
      for (const order of inference.orders) {
        const blocks = SUBSTRUCT_POSITIONS[order],
          logical =
            blocks.indexOf(Math.floor(physical / 24)) * 24 + (physical % 24),
          counts = inference.orderKeyCounts[order][keyDigit];
        const mask = plain[logical];
        if (mask && !(mask & (mask - 1))) digits.add(Math.log2(mask));
        counts.forEach((count, k) => {
          if (mask & (1 << k)) transparentCount += count;
          if (mask & (65535 ^ (1 << k))) blackCount += count;
        });
      }
      if (
        !transparentCount ||
        !blackCount ||
        Math.min(transparentCount, blackCount) >= total
      )
        continue;
      const question: DomainQuestion = {
        index,
        keyDigit,
        digits: [...digits].sort((a, b) => a - b),
        transparentCount,
        blackCount,
        total,
        conditional: transparentCount + blackCount > total,
      };
      const worst = (q: DomainQuestion) =>
          Math.max(q.transparentCount, q.blackCount),
        bestCase = (q: DomainQuestion) =>
          Math.min(q.transparentCount, q.blackCount);
      if (
        !best ||
        worst(question) < worst(best) ||
        (worst(question) === worst(best) && bestCase(question) < bestCase(best))
      )
        best = question;
    }
    if (!best) return null;
    questions[id] = best;
    const sizes = [best.transparentCount, best.blackCount],
      worstCase = Math.max(...sizes),
      expectedRemaining = best.conditional
        ? worstCase
        : sizes.reduce((sum, n) => sum + (n * n) / total, 0),
      informationGain = best.conditional
        ? Math.log2(total / worstCase)
        : sizes.reduce((sum, n) => sum - (n / total) * Math.log2(n / total), 0);
    return {
      groups: 2,
      worstCase,
      expectedRemaining,
      informationGain,
      pixels: [{ index: best.index, value: 0 }],
      // Physical question + its per-order plaintext semantics define a test;
      // matching counts alone do not establish equivalence.
      signature:
        `${best.index}:` +
        inference.orders
          .map((order) => {
            const physical = best!.index - 80,
              blocks = SUBSTRUCT_POSITIONS[order],
              n =
                blocks.indexOf(Math.floor(physical / 24)) * 24 +
                (physical % 24);
            return `${order}/${plain[n]}`;
          })
          .join(";"),
      checksumContributes: false,
      checksumQuestions: [],
      checksumDelta: null,
    };
  };
  for (const item of ITEM_CATALOG) {
    if (!item.experiment || item.id === source.knownFacts.heldItem) continue;
    const ranked = rank(`item-${item.id}`, { heldItem: item.id }, [4, 5, 6, 7]);
    if (ranked)
      experiments.push({
        ...ranked,
        item,
        questions: [],
        effort:
          "One targeted pixel; all remaining PID block orders are considered. Counts are stored-data bounds.",
      });
  }
  for (const action of controlledActions(source, identity.species)) {
    const ranked = rank(action.id, action.changes, action.logical);
    if (ranked) controlledExperiments.push({ ...ranked, action });
  }
  const compare = (
    a: { worstCase: number; informationGain: number },
    b: { worstCase: number; informationGain: number },
  ) => a.worstCase - b.worstCase || b.informationGain - a.informationGain;
  experiments.sort(compare);
  controlledExperiments.sort(compare);
  return { experiments, controlledExperiments, questions };
}
