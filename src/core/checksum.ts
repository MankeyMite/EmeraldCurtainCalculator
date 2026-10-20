import { allowedValues, type KnownFacts } from "./constraints";
import { knownPlaintext } from "./inference";

export const mod16 = (n: number) => ((n % 65536) + 65536) % 65536;
const columnCache = new Map<string, number[]>(),
  headerCache = new Map<string, number[]>();
const checksumMaskCache = new WeakMap<number[], number[]>();
function headerValues(masks: number[]) {
  const id = masks.join(","),
    cached = headerCache.get(id);
  if (cached) return cached;
  let values = [0];
  masks.forEach(
    (m, n) =>
      (values = values.flatMap((v) =>
        allowedValues(m).map((d) => v | (d << (n * 4))),
      )),
  );
  if (headerCache.size > 64) headerCache.clear();
  headerCache.set(id, values);
  return values;
}

/** Changes are nibble positions in logical secure data. Unknown unchanged
 * words cancel; changed bytes retain their actual low/high-word weights. */
export function checksumDifference(
  before: KnownFacts,
  after: KnownFacts,
  changed: number[],
): number | null {
  const a = knownPlaintext(before),
    b = knownPlaintext(after);
  let delta = 0;
  for (const n of new Set(changed)) {
    const av = allowedValues(a[n]),
      bv = allowedValues(b[n]);
    if (av.length !== 1 || bv.length !== 1) return null;
    delta += (bv[0] - av[0]) * 16 ** (n % 4);
  }
  return mod16(delta);
}

/** Exact checksum support for independent nibble domains. Column sums and
 * carries preserve modular overflow. No chosen checksum becomes evidence. */
export function checksumValues(
  plain: number[],
  masks = [65535, 65535, 65535, 65535],
): number[] {
  if (plain.length !== 96 || masks.length !== 4)
    throw Error("Invalid checksum domains");
  if (plain.some((m) => !m) || masks.some((m) => !m)) return [];
  if (
    Array.from({ length: 24 }, (_, w) =>
      plain.slice(w * 4, w * 4 + 4).every((m) => m === 65535),
    ).some(Boolean)
  ) {
    return headerValues(masks);
  }
  if (plain.every((m) => !(m & (m - 1)))) {
    let sum = 0;
    plain.forEach((m, n) => (sum += (31 - Math.clz32(m)) * 16 ** (n % 4)));
    sum &= 65535;
    return masks.every((m, n) => m & (1 << ((sum >>> (n * 4)) & 15)))
      ? [sum]
      : [];
  }
  const transitions: number[][][] = [];
  for (let column = 0; column < 4; column++) {
    const domains = plain.filter((_, n) => n % 4 === column),
      signature = domains.join(",");
    let values = columnCache.get(signature);
    if (!values) {
      let sums = 1n;
      for (const domain of domains) {
        let next = 0n;
        for (const digit of allowedValues(domain))
          next |= sums << BigInt(digit);
        sums = next;
      }
      values = [];
      for (let s = 0; s <= 360; s++)
        if (sums & (1n << BigInt(s))) values.push(s);
      if (columnCache.size > 4096) columnCache.clear();
      columnCache.set(signature, values);
    }
    const sums = values;
    transitions.push(
      Array.from({ length: 24 }, (_, carry) => {
        const digits = Array(16).fill(0);
        for (const s of sums) {
          const total = s + carry,
            digit = total & 15;
          if (masks[column] & (1 << digit)) digits[digit] |= 1 << (total >>> 4);
        }
        return digits;
      }),
    );
  }
  if (
    transitions.every((rows, n) =>
      rows.every((row) => allowedValues(masks[n]).every((d) => row[d] !== 0)),
    )
  )
    return headerValues(masks);
  const result: number[] = [];
  const visit = (column: number, carries: number, value: number) => {
    if (column === 4) {
      result.push(value);
      return;
    }
    for (const digit of allowedValues(masks[column])) {
      let next = 0;
      for (let carry = 0; carry < 24; carry++)
        if (carries & (1 << carry)) next |= transitions[column][carry][digit];
      if (next) visit(column + 1, next, value | (digit << (column * 4)));
    }
  };
  visit(0, 1, 0);
  return result;
}

export function checksumMasks(values: number[]) {
  const cached = checksumMaskCache.get(values);
  if (cached) return cached.slice();
  const masks = [0, 0, 0, 0];
  for (const value of values)
    for (let n = 0; n < 4; n++) masks[n] |= 1 << ((value >>> (4 * n)) & 15);
  checksumMaskCache.set(values, masks);
  return masks.slice();
}

/** Exact unary projections of one modular checksum equation. Prefix/suffix
 * sums omit each variable; forward/backward carry supports retain every real
 * payload while exposing digits forced by checksum carries. */
export function refineChecksumPayload(
  plain: number[],
  masks: number[],
): number[] {
  const columns = Array.from({ length: 4 }, (_, column) => {
    const indices = Array.from({ length: 24 }, (_, i) => column + i * 4);
    const prefix = [1n],
      suffix = Array<bigint>(25).fill(0n);
    suffix[24] = 1n;
    const extend = (bits: bigint, mask: number) =>
      allowedValues(mask).reduce((sum, d) => sum | (bits << BigInt(d)), 0n);
    indices.forEach((n) => prefix.push(extend(prefix.at(-1)!, plain[n])));
    for (let i = 23; i >= 0; i--)
      suffix[i] = extend(suffix[i + 1], plain[indices[i]]);
    const sums = Array.from({ length: 361 }, (_, i) => i).filter(
      (i) => prefix[24] & (1n << BigInt(i)),
    );
    return { indices, prefix, suffix, sums };
  });
  const forward = [1],
    backward = Array(5).fill(0);
  backward[4] = (1 << 24) - 1;
  columns.forEach(({ sums }, column) => {
    let next = 0;
    for (let carry = 0; carry < 24; carry++)
      if (forward[column] & (1 << carry))
        for (const s of sums)
          if (masks[column] & (1 << ((s + carry) & 15)))
            next |= 1 << ((s + carry) >>> 4);
    forward.push(next);
  });
  for (let column = 3; column >= 0; column--)
    for (let carry = 0; carry < 24; carry++)
      if (
        columns[column].sums.some(
          (s) =>
            masks[column] & (1 << ((s + carry) & 15)) &&
            backward[column + 1] & (1 << ((s + carry) >>> 4)),
        )
      )
        backward[column] |= 1 << carry;
  if (!(backward[0] & 1)) return plain.map(() => 0);
  const result = plain.slice();
  columns.forEach(({ indices, prefix, suffix, sums }, column) => {
    let supported = 0n;
    for (const s of sums)
      for (let carry = 0; carry < 24; carry++)
        if (
          forward[column] & (1 << carry) &&
          masks[column] & (1 << ((s + carry) & 15)) &&
          backward[column + 1] & (1 << ((s + carry) >>> 4))
        ) {
          supported |= 1n << BigInt(s);
          break;
        }
    indices.forEach((n, i) => {
      let other = 0n;
      for (let sum = 0; sum <= 360; sum++)
        if (prefix[i] & (1n << BigInt(sum)))
          other |= suffix[i + 1] << BigInt(sum);
      result[n] = allowedValues(plain[n]).reduce(
        (m, d) => ((other << BigInt(d)) & supported ? m | (1 << d) : m),
        0,
      );
    });
  });
  return result;
}

export type PixelOutcome = { index: number; value: number };
/** A candidate may support several outcomes because its checksum is unknown.
 * Count each identity once per outcome; nuisance values are never candidates.
 * Expected counts use a uniform prior on identities, then supported outcomes.
 */
export function scoreOutcomes(outcomes: PixelOutcome[][][]) {
  const groups = new Map<
    string,
    { identities: Set<number>; probability: number }
  >();
  const seen = new Map<number, Set<number>>();
  let conditionalEntropy = 0;
  outcomes.forEach((possible, i) => {
    const unique = new Map(
      possible.map((pixels) => [
        pixels.map((p) => `${p.index}:${p.value}`).join(","),
        pixels,
      ]),
    );
    if (!unique.size) return;
    conditionalEntropy += Math.log2(unique.size) / outcomes.length;
    for (const [key, pixels] of unique) {
      const group = groups.get(key) ?? {
        identities: new Set(),
        probability: 0,
      };
      group.identities.add(i);
      group.probability += 1 / (outcomes.length * unique.size);
      groups.set(key, group);
      pixels.forEach((p) => {
        const s = seen.get(p.index) ?? new Set();
        s.add(p.value);
        seen.set(p.index, s);
      });
    }
  });
  const rows = [...groups.values()];
  // Discard questions that cannot change any surviving identity set. Check
  // joint outcomes: correlated pixels may be useful only in combination.
  const patterns = [...groups.keys()].map(
    (key) =>
      new Map(
        key
          .split(",")
          .filter(Boolean)
          .map((p) => {
            const [index, value] = p.split(":").map(Number);
            return [index, value];
          }),
      ),
  );
  const targets = [...seen]
    .filter(([, values]) => values.size > 1)
    .map(([index]) => index);
  // Prefer encrypted questions when checksum columns are redundant.
  for (const index of targets.slice().sort((a, b) => a - b)) {
    const remaining = targets.filter((n) => n !== index);
    const projected = new Map<string, Set<number>>();
    const redundant = patterns.every((pattern, i) => {
      const signature = remaining.map((n) => pattern.get(n)).join(",");
      const previous = projected.get(signature),
        ids = rows[i].identities;
      if (!previous) {
        projected.set(signature, ids);
        return true;
      }
      return (
        previous.size === ids.size && [...ids].every((id) => previous.has(id))
      );
    });
    if (redundant) targets.splice(targets.indexOf(index), 1);
  }
  return {
    groups: groups.size,
    worstCase: Math.max(0, ...rows.map((g) => g.identities.size)),
    expectedRemaining: rows.reduce(
      (n, g) => n + g.probability * g.identities.size,
      0,
    ),
    informationGain: Math.max(
      0,
      rows.reduce((n, g) => n - g.probability * Math.log2(g.probability), 0) -
        conditionalEntropy,
    ),
    pixels: targets.map((index) => ({
      index,
      value: [...seen.get(index)!][0],
    })),
    checksumQuestions: targets
      .filter((n) => n >= 72 && n < 76)
      .map((index) => {
        const transparent = new Set<number>(),
          black = new Set<number>();
        patterns.forEach((pattern, i) =>
          rows[i].identities.forEach((id) =>
            (pattern.get(index) === 0 ? transparent : black).add(id),
          ),
        );
        return {
          index,
          transparentCount: transparent.size,
          blackCount: black.size,
        };
      }),
    signature: [...groups]
      .map(([pattern, g]) => `${pattern}=${[...g.identities].join(".")}`)
      .join(";"),
  };
}

export function checksumPixelOutcomes(
  values: number[],
  delta: number,
): PixelOutcome[][] {
  const patterns = new Set(
    values.map((v) => {
      const after = mod16(v + delta);
      return Array.from({ length: 4 }, (_, n) =>
        (after >>> (4 * n)) & 15 ? "1" : "0",
      ).join("");
    }),
  );
  return [...patterns].map((p) =>
    [...p].map((v, n) => ({ index: 72 + n, value: Number(v) })),
  );
}

export function rankCombinedPixels(
  encrypted: PixelOutcome[][],
  supports?: number[][],
  delta: number | null = null,
) {
  const baseline = scoreOutcomes(encrypted.map((p) => [p]));
  if (
    !supports ||
    delta === null ||
    supports.every((s) => s === supports[0]) ||
    supports.every((s) => s.length === 65536)
  )
    return { ...baseline, checksumContributes: false, checksumDelta: delta };
  const cache = new Map<number[], PixelOutcome[][]>();
  const combined = scoreOutcomes(
    encrypted.map((pixels, i) => {
      let checksum = cache.get(supports[i]);
      if (!checksum) {
        checksum = checksumPixelOutcomes(supports[i], delta);
        cache.set(supports[i], checksum);
      }
      return checksum.map((p) =>
        [...pixels, ...p].sort((a, b) => a.index - b.index),
      );
    }),
  );
  const checksumContributes =
    combined.worstCase < baseline.worstCase ||
    combined.expectedRemaining < baseline.expectedRemaining - 1e-9;
  // Nuisance outcomes must never make a useful encrypted test rank worse.
  return {
    ...(checksumContributes ? combined : baseline),
    checksumContributes,
    checksumDelta: delta,
  };
}
