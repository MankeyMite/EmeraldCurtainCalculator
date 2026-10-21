// Emerald: BattleFrontier_Lounge1/scripts.inc and BufferVarsForIVRater.
export const JUDGE_STAT_RATINGS = [
  { text: "That stat is relatively good.", min: 0, max: 15 },
  { text: "That stat is quite impressive.", min: 16, max: 25 },
  { text: "That stat is outstanding!", min: 26, max: 30 },
  { text: "It's flawless! A thing of perfection!", min: 31, max: 31 },
];
export const JUDGE_OVERALL_RATINGS = [
  { text: "Average ability", min: 0, max: 90 },
  { text: "Better-than-average ability", min: 91, max: 120 },
  { text: "Quite impressive in ability", min: 121, max: 150 },
  { text: "Wonderfully outstanding in ability", min: 151, max: 186 },
];
export type IvJudgeEvidence = {
  overall?: number;
  best: { stat: number; rating: number }[];
};
export function validateIvJudge(input: unknown): IvJudgeEvidence {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid IV judge evidence");
  const e = input as Record<string, unknown>;
  const tier = (n: unknown) =>
    Number.isInteger(n) && Number(n) >= 0 && Number(n) < 4;
  if (
    Object.keys(e).some((k) => k !== "overall" && k !== "best") ||
    (e.overall !== undefined && !tier(e.overall)) ||
    !Array.isArray(e.best) ||
    e.best.length > 100 ||
    e.best.some(
      (r) =>
        !r ||
        typeof r !== "object" ||
        Object.keys(r).some((k) => k !== "stat" && k !== "rating") ||
        !Number.isInteger(r.stat) ||
        r.stat < 0 ||
        r.stat > 5 ||
        !tier(r.rating),
    )
  )
    throw Error(
      "Invalid IV judge answer: choose a stat and a supported rating",
    );
  return {
    ...(e.overall === undefined ? {} : { overall: Number(e.overall) }),
    best: e.best.map((r) => ({ stat: r.stat, rating: r.rating })),
  };
}
export function judgeAllows(e: IvJudgeEvidence | undefined, ivs: number[]) {
  if (!e) return true;
  const total = ivs.reduce((a, b) => a + b, 0),
    highest = Math.max(...ivs),
    overall =
      e.overall === undefined ? undefined : JUDGE_OVERALL_RATINGS[e.overall];
  return (
    (!overall || (total >= overall.min && total <= overall.max)) &&
    e.best.every(({ stat, rating }) => {
      const range = JUDGE_STAT_RATINGS[rating];
      return (
        ivs[stat] === highest && highest >= range.min && highest <= range.max
      );
    })
  );
}
const cache = new Map<string, number[][]>();
/** Exact IV marginals for independent input domains + common maximum + total.
 * A named stat is ONE maximum, never necessarily the unique maximum. Repeated
 * mentions supply no negative evidence about stats the judge has not named.
 */
export function judgeIvDomains(
  e: IvJudgeEvidence | undefined,
  domains: number[][],
): number[][] {
  if (!e) return domains;
  if (domains.every((v) => v.length === 1))
    return judgeAllows(
      e,
      domains.map((v) => v[0]),
    )
      ? domains
      : domains.map(() => []);
  const signature = JSON.stringify([e, domains]),
    found = cache.get(signature);
  if (found) return found.map((v) => v.slice());
  const supports = Array.from({ length: 6 }, () => new Set<number>()),
    total =
      e.overall === undefined
        ? { min: 0, max: 186 }
        : JUDGE_OVERALL_RATINGS[e.overall];
  let low = 0,
    high = 31;
  for (const answer of e.best) {
    low = Math.max(low, JUDGE_STAT_RATINGS[answer.rating].min);
    high = Math.min(high, JUDGE_STAT_RATINGS[answer.rating].max);
  }
  const named = new Set(e.best.map((r) => r.stat));
  // Without a highest-stat answer only the sum is restricted.
  if (!named.size) low = high = 31;
  for (let maximum = low; maximum <= high; maximum++) {
    const choices = domains.map((values, i) =>
      values.filter((v) => (named.has(i) ? v === maximum : v <= maximum)),
    );
    if (choices.some((v) => !v.length)) continue;
    const minSum = choices.reduce((s, v) => s + Math.min(...v), 0),
      maxSum = choices.reduce((s, v) => s + Math.max(...v), 0);
    if (minSum >= total.min && maxSum <= total.max) {
      choices.forEach((v, i) => v.forEach((n) => supports[i].add(n)));
      continue;
    }
    const advance = (previous: Uint8Array, values: number[]) => {
      const next = new Uint8Array(187);
      previous.forEach((yes, sum) => {
        if (yes) for (const v of values) if (sum + v <= 186) next[sum + v] = 1;
      });
      return next;
    };
    const forward = [new Uint8Array(187)],
      backward = Array<Uint8Array>(7);
    forward[0][0] = 1;
    backward[6] = new Uint8Array(187);
    backward[6][0] = 1;
    for (let i = 0; i < 6; i++) forward.push(advance(forward[i], choices[i]));
    for (let i = 5; i >= 0; i--)
      backward[i] = advance(backward[i + 1], choices[i]);
    for (let i = 0; i < 6; i++) {
      const prefix = new Uint16Array(188);
      for (let sum = 0; sum <= 186; sum++)
        prefix[sum + 1] = prefix[sum] + backward[i + 1][sum];
      for (const v of choices[i]) {
        for (let sum = 0; sum <= 186; sum++)
          if (forward[i][sum]) {
            const from = Math.max(0, total.min - v - sum),
              to = Math.min(186, total.max - v - sum);
            if (from <= to && prefix[to + 1] > prefix[from]) {
              supports[i].add(v);
              break;
            }
          }
      }
    }
  }
  const result = supports.map((s) => [...s].sort((a, b) => a - b));
  if (cache.size >= 128) cache.clear();
  cache.set(signature, result);
  return result.map((v) => v.slice());
}

/** Project judge relations into the existing packed-IV nibble architecture.
 * Marginal relaxation is conservative; full generated IV tuples are tested by
 * judgeAllows. Never turn unseen tied stats into IV < 31 constraints.
 */
export function refineJudgePlaintext(
  plain: number[],
  e: IvJudgeEvidence | undefined,
) {
  if (!e) return plain;
  const masks = plain.slice();
  let changed = true;
  while (changed) {
    changed = false;
    const domains = Array.from({ length: 6 }, (_, i) => {
      const start = 320 + i * 5;
      return Array.from({ length: 32 }, (_, n) => n).filter((v) => {
        for (
          let nibble = Math.floor(start / 4);
          nibble <= Math.floor((start + 4) / 4);
          nibble++
        ) {
          let support = false;
          for (let d = 0; d < 16; d++)
            if (masks[nibble] & (1 << d)) {
              let fits = true;
              for (let bit = 0; bit < 4; bit++) {
                const at = nibble * 4 + bit - start;
                if (at >= 0 && at < 5 && ((d >>> bit) & 1) !== ((v >>> at) & 1))
                  fits = false;
              }
              if (fits) support = true;
            }
          if (!support) return false;
        }
        return true;
      });
    });
    const allowed = judgeIvDomains(e, domains);
    for (let i = 0; i < 6; i++) {
      const start = 320 + i * 5;
      for (
        let n = Math.floor(start / 4);
        n <= Math.floor((start + 4) / 4);
        n++
      ) {
        let support = 0;
        for (let d = 0; d < 16; d++)
          if (
            allowed[i].some((v) => {
              for (let bit = 0; bit < 4; bit++) {
                const at = n * 4 + bit - start;
                if (at >= 0 && at < 5 && ((d >>> bit) & 1) !== ((v >>> at) & 1))
                  return false;
              }
              return true;
            })
          )
            support |= 1 << d;
        const next = masks[n] & support;
        if (next !== masks[n]) {
          changed = true;
          masks[n] = next;
        }
      }
    }
  }
  return masks;
}
