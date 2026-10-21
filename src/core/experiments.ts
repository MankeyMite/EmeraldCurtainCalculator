import items from "../data/items.json";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import type { Hypothesis } from "./sid";
import { compileChecksumSupport } from "./sid";
import type { Snapshot } from "./investigation";
import type { KnownFacts } from "./constraints";
import { rankCombinedPixels } from "./checksum";
import { experimentChecksumDelta } from "./checksumExperiments";

export const ITEM_CATALOG = items;
/** Scorers discard nuisance-only targets even when several visible patterns
 * remain. Multiple patterns alone do not prove that any identity is excluded.
 */
export function isInformativeExperiment(experiment: {
  groups: number;
  pixels: { index: number }[];
}) {
  return experiment.groups > 1 && experiment.pixels.length > 0;
}
export type ItemQuestion = {
  index: number;
  keyDigit: number;
  digit: number;
  transparentCount: number;
  blackCount: number;
  values: number[];
};
function questionBuilder(candidates: Hypothesis[]) {
  const counts = Array.from({ length: 4 }, () => Array(16).fill(0));
  candidates.forEach((h) =>
    counts.forEach((row, n) => row[(h.key >>> ((4 + n) * 4)) & 15]++),
  );
  return (itemId: number): ItemQuestion[] =>
    itemPixels(candidates[0], itemId).flatMap((p, n) => {
      const digit = (itemId >>> (n * 4)) & 15,
        transparentCount = counts[n][digit],
        blackCount = candidates.length - transparentCount;
      return transparentCount && blackCount
        ? [
            {
              index: p.index,
              keyDigit: p.keyDigit,
              digit,
              transparentCount,
              blackCount,
              values: counts[n].flatMap((count, d) => (count ? [d] : [])),
            },
          ]
        : [];
    });
}
export function itemPixels(h: Hypothesis, itemId: number) {
  const offset = 32 + SUBSTRUCT_POSITIONS[h.pid % 24][0] * 12 + 2;
  return Array.from({ length: 4 }, (_, n) => {
    const keyDigit = (h.key >>> ((4 + n) * 4)) & 15;
    const plainDigit = (itemId >>> (n * 4)) & 15;
    return {
      index: 16 + offset * 2 + n,
      keyDigit: 4 + n,
      value: (keyDigit ^ plainDigit) === 0 ? (0 as const) : (1 as const),
    };
  });
}
// Only the Growth-block position must be shared. Several different PID orders
// can still put the item at exactly the same observable location.
export function rankItemExperiments(
  candidates: Hypothesis[],
  ownedItems?: number[],
  source?: Snapshot,
  identity: KnownFacts = {},
  snapshots: Snapshot[] = source ? [source] : [],
) {
  if (
    !candidates.length ||
    new Set(candidates.map((h) => SUBSTRUCT_POSITIONS[h.pid % 24][0])).size !==
      1
  )
    return [];
  const questions = questionBuilder(candidates);
  if (source) {
    const support = compileChecksumSupport(identity, snapshots, source);
    const supports = candidates.map(support);
    if (
      supports.every((s) => s === supports[0]) ||
      supports.every((s) => s.length === 65536)
    )
      return rankItemExperiments(candidates, ownedItems);
    return ITEM_CATALOG.filter(
      (i) =>
        i.experiment && (ownedItems === undefined || ownedItems.includes(i.id)),
    )
      .map((item) => {
        const target = {
          ...source,
          knownFacts: { ...source.knownFacts, heldItem: item.id },
          itemTest: { sourceId: source.id, phase: "question" as const },
        };
        const delta = experimentChecksumDelta(source, target);
        const ranked = rankCombinedPixels(
          candidates.map((h) => itemPixels(h, item.id)),
          supports,
          delta,
        );
        return {
          ...ranked,
          item,
          questions: questions(item.id),
          effort: ranked.checksumContributes
            ? "Combined encrypted and checksum pixels eliminate additional identities."
            : "One reversible held-item swap; no battle required.",
        };
      })
      .sort(
        (a, b) =>
          a.worstCase - b.worstCase ||
          b.informationGain - a.informationGain ||
          a.item.id - b.item.id,
      );
  }
  // Counts of matching key digits for all 16 subsets. Reuse these marginals
  // across the catalog instead of traversing every candidate for every item.
  const digitMasks = Array.from({ length: 16 }, (_, subset) => {
    let mask = 0;
    for (let n = 0; n < 4; n++) if (subset & (1 << n)) mask |= 15 << (n * 4);
    return mask;
  });
  const marginals = Array.from({ length: 16 }, () => new Uint32Array(65536));
  for (const h of candidates) {
    const key = h.key >>> 16;
    for (let subset = 0; subset < 16; subset++)
      marginals[subset][key & digitMasks[subset]]++;
  }
  return ITEM_CATALOG.filter(
    (i) =>
      i.experiment && (ownedItems === undefined || ownedItems.includes(i.id)),
  )
    .map((item) => {
      const matching = digitMasks.map(
        (mask, subset) => marginals[subset][item.id & mask],
      );
      const groups = matching.slice();
      // Inclusion/exclusion converts "these digits match" into exact binary
      // black/transparent pattern counts, preserving correlations and weights.
      for (let bit = 0; bit < 4; bit++)
        for (let subset = 0; subset < 16; subset++)
          if (!(subset & (1 << bit)))
            groups[subset] -= groups[subset | (1 << bit)];
      const present = Array.from({ length: 4 }, (_, n) => matching[1 << n] > 0);
      const sizes = groups.filter(Boolean),
        total = candidates.length;
      const informationGain = sizes.reduce(
        (sum, n) => sum - (n / total) * Math.log2(n / total),
        0,
      );
      const pixels = itemPixels(candidates[0], item.id).filter(
        (_, i) => matching[1 << i] > 0 && matching[1 << i] < total,
      );
      // Identical binary patterns for every candidate define equivalent tests.
      const signature = present
        .map((yes, n) => (yes ? (item.id >>> (n * 4)) & 15 : "*"))
        .join(",");
      return {
        item,
        questions: questions(item.id),
        groups: sizes.length,
        worstCase: Math.max(...sizes),
        expectedRemaining: sizes.reduce((sum, n) => sum + (n * n) / total, 0),
        informationGain,
        pixels,
        signature,
        effort: "One reversible held-item swap; no battle required.",
        checksumContributes: false,
        checksumQuestions: [] as {
          index: number;
          transparentCount: number;
          blackCount: number;
        }[],
        checksumDelta: null as number | null,
      };
    })
    .sort(
      (a, b) =>
        a.worstCase - b.worstCase ||
        b.informationGain - a.informationGain ||
        a.item.id - b.item.id,
    );
}
