import { allowedValues, type KnownFacts } from "./constraints";
import { xorMask } from "./cryptoConstraints";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { genderPidCases } from "./traits";

export const shinyKey = (key: number) => ((key & 65535) ^ (key >>> 16)) < 8;
export const fitsShiny = (facts: KnownFacts, key: number) =>
  facts.shiny === undefined || facts.shiny === shinyKey(key);

type Option = {
  a: number;
  b: number;
  bad: number;
  residue: number;
  pairs: [number, number][];
};
type Counts = bigint[][];
const empty = (mod: number): Counts => [
  Array(mod).fill(0n),
  Array(mod).fill(0n),
];

/** Four paired digit factors couple KEY[i] and KEY[i+4]. The flag records
 * whether their XOR violates shininess. Residue DP retains PID order/nature
 * correlations; OT choices are counted once, rather than filtering marginals.
 */
export function shinyDomains(
  header: number[],
  plain: number[],
  facts: KnownFacts,
  orderKeys?: number[][],
) {
  const masks = Array(160).fill(0),
    plaintextMasks = Array(96).fill(0),
    keyMasks = Array(8).fill(0),
    orderKeyCounts = Array.from({ length: 24 }, () =>
      Array.from({ length: 8 }, () => Array<number>(16).fill(0)),
    );
  const orders = new Set<number>(),
    natures = new Set<number>(),
    pids = new Set<number>();
  let headerPairCount = 0n,
    pidCount = 0n;
  const mod = facts.nature === undefined ? 24 : 600;
  const weights = Array.from({ length: 8 }, (_, i) => 16 ** i % mod);
  const wanted = facts.shiny ? 0 : 1;
  for (const [lo, hi] of genderPidCases(facts.species, facts.gender)) {
    const hd = header.slice();
    hd[0] &= lo;
    hd[1] &= hi;
    if (hd.some((m) => !m)) continue;
    for (let order = 0; order < 24; order++) {
      const positions = SUBSTRUCT_POSITIONS[order],
        keys = orderKeys?.[order].slice() ?? Array(8).fill(65535);
      plain.forEach((p, n) => {
        const physical = positions[Math.floor(n / 24)] * 24 + (n % 24);
        let support = 0;
        for (const k of allowedValues(keys[physical % 8]))
          if (p & xorMask(hd[64 + physical], k)) support |= 1 << k;
        keys[physical % 8] &= support;
      });
      if (keys.some((m) => !m)) continue;
      const factors: Option[][] = Array.from({ length: 4 }, (_, i) => {
        const result: Option[] = [];
        for (const a of allowedValues(hd[i]))
          for (const b of allowedValues(hd[i + 4])) {
            if (i === 0 && a % 8 !== order % 8) continue;
            const pairs: [number, number][][] = [[], []];
            for (const q of allowedValues(hd[8 + i]))
              for (const r of allowedValues(hd[12 + i])) {
                const k = a ^ q,
                  l = b ^ r;
                if (!(keys[i] & (1 << k)) || !(keys[i + 4] & (1 << l)))
                  continue;
                const bad = i === 0 ? Number((k ^ l) >= 8) : Number(k !== l);
                pairs[bad].push([q, r]);
              }
            for (let bad = 0; bad < 2; bad++)
              if (pairs[bad].length && (!facts.shiny || !bad))
                result.push({
                  a,
                  b,
                  bad,
                  residue: (a * weights[i] + b * weights[i + 4]) % mod,
                  pairs: pairs[bad],
                });
          }
        return result;
      });
      if (factors.some((f) => !f.length)) continue;
      const target =
        facts.nature === undefined
          ? order
          : order + 24 * ((order - facts.nature + 25) % 25);
      const count = (
        omit = -1,
        mode: "pairs" | "pids" | "onlyGood" = "pairs",
      ) => {
        let dp = empty(mod);
        dp[0][0] = 1n;
        factors.forEach((options, i) => {
          if (i === omit) return;
          const local = empty(mod),
            seen = new Set<string>();
          for (const o of options) {
            if (mode !== "pairs") {
              const key = `${o.a}/${o.b}`;
              if (seen.has(key)) continue;
              seen.add(key);
              if (
                mode === "onlyGood" &&
                options.some((p) => p.a === o.a && p.b === o.b && p.bad)
              )
                continue;
              local[0][o.residue]++;
            } else local[o.bad][o.residue] += BigInt(o.pairs.length);
          }
          const next = empty(mod);
          for (let b = 0; b < 2; b++)
            for (let r = 0; r < mod; r++)
              if (dp[b][r])
                for (let c = 0; c < 2; c++)
                  for (let s = 0; s < mod; s++)
                    if (local[c][s])
                      next[b | c][(r + s) % mod] += dp[b][r] * local[c][s];
          dp = next;
        });
        return dp;
      };
      const total = count()[wanted][target];
      if (!total) continue;
      orders.add(order);
      headerPairCount += total;
      const distinct =
        count(-1, "pids")[0][target] -
        (facts.shiny ? 0n : count(-1, "onlyGood")[0][target]);
      pidCount += distinct;
      if (facts.nature !== undefined) natures.add(facts.nature);
      // Nature projections are conservatively widened when not supplied.
      else for (let n = 0; n < 25; n++) natures.add(n);
      const supported: Option[][] = [];
      factors.forEach((options, i) => {
        const rest = count(i);
        const local = options.filter((o) => {
          const needed = (target - o.residue + mod) % mod;
          return rest.some(
            (rs, flag) => (flag | o.bad) === wanted && rs[needed] > 0n,
          );
        });
        supported.push(local);
        for (const o of local) {
          // rest counts every OT choice in the other three paired factors.
          // Each q/r pair here contributes once to each key marginal.
          if (facts.tid !== undefined) {
            const needed = (target - o.residue + mod) % mod;
            const count = rest.reduce(
              (sum, row, flag) =>
                sum + ((flag | o.bad) === wanted ? Number(row[needed]) : 0),
              0,
            );
            for (const [q, r] of o.pairs) {
              orderKeyCounts[order][i][o.a ^ q] += count;
              orderKeyCounts[order][i + 4][o.b ^ r] += count;
            }
          }
          masks[i] |= 1 << o.a;
          masks[i + 4] |= 1 << o.b;
          for (const [q, r] of o.pairs) {
            masks[8 + i] |= 1 << q;
            masks[12 + i] |= 1 << r;
            keyMasks[i] |= 1 << (o.a ^ q);
            keyMasks[i + 4] |= 1 << (o.b ^ r);
          }
        }
      });
      for (let n = 16; n < 64; n++) masks[n] |= hd[n];
      for (let n = 0; n < 96; n++) {
        const physical = positions[Math.floor(n / 24)] * 24 + (n % 24);
        // Local key projections are exact; combining nibbles remains an upper bound.
        const factor = physical % 4,
          upper = physical % 8 >= 4;
        let km = 0;
        for (const o of supported[factor])
          for (const [q, r] of o.pairs) km |= 1 << (upper ? o.b ^ r : o.a ^ q);
        for (const k of allowedValues(km)) {
          const decoded = plain[n] & xorMask(hd[64 + physical], k);
          plaintextMasks[n] |= decoded;
          masks[64 + physical] |= xorMask(decoded, k);
        }
      }
      if (distinct <= 256n) {
        const visit = (
          i: number,
          residue: number,
          pid: number,
          flags: number,
        ) => {
          if (i === 4) {
            if (residue === target && flags & (1 << wanted)) pids.add(pid);
            return;
          }
          const unique = new Map<string, { o: Option; flags: number }>();
          for (const o of supported[i]) {
            const id = `${o.a}/${o.b}`,
              entry = unique.get(id) ?? { o, flags: 0 };
            entry.flags |= 1 << o.bad;
            unique.set(id, entry);
          }
          for (const { o, flags: f } of unique.values()) {
            let next = 0;
            for (let a = 0; a < 2; a++)
              for (let b = 0; b < 2; b++)
                if (flags & (1 << a) && f & (1 << b)) next |= 1 << (a | b);
            visit(
              i + 1,
              (residue + o.residue) % mod,
              pid + o.a * 16 ** i + o.b * 16 ** (i + 4),
              next,
            );
          }
        };
        // Avoid visiting a large Cartesian product with a tiny residue slice.
        if (
          supported.reduce(
            (n, o) => n * new Set(o.map((p) => `${p.a}/${p.b}`)).size,
            1,
          ) <= 200000
        )
          visit(0, 0, 0, 1);
      }
    }
  }
  return {
    masks,
    plaintextMasks,
    keyMasks,
    orderKeyCounts,
    orders: [...orders].sort((a, b) => a - b),
    natures: [...natures],
    pidCount,
    pidValues:
      pidCount <= 256n && BigInt(pids.size) === pidCount
        ? [...pids].sort((a, b) => a - b)
        : null,
    headerPairCount,
  };
}
