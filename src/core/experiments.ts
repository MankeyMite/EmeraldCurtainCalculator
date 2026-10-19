import items from "../data/items.json";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import type { Hypothesis } from "./sid";

export const ITEM_CATALOG = items;
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
) {
  if (
    !candidates.length ||
    new Set(candidates.map((h) => SUBSTRUCT_POSITIONS[h.pid % 24][0])).size !==
      1
  )
    return [];
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
        groups: sizes.length,
        worstCase: Math.max(...sizes),
        expectedRemaining: sizes.reduce((sum, n) => sum + (n * n) / total, 0),
        informationGain,
        pixels,
        signature,
        effort: "One reversible held-item swap; no battle required.",
      };
    })
    .sort(
      (a, b) =>
        a.worstCase - b.worstCase ||
        b.informationGain - a.informationGain ||
        a.item.id - b.item.id,
    );
}
