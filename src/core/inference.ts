import { applyFacts, summarizeField, type KnownFacts } from "./constraints";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { validateFacts } from "./session";
import { genderPidCases, speciesTraits } from "./traits";

// Exact inference under pixels + explicit facts. No candidates, legality,
// checksum guesses, or enumeration of 2^32 PIDs enter this module.
// For each order, known plaintext restricts eight repeating XOR-key nibbles.
// Digit DP enforces PID%24 and optionally PID%25, with OT choices as weights.
type Rows = number[]; // low nibble -> bitset of allowed high nibbles (one byte).
const blankRows = (): Rows => Array(16).fill(0);
const domainCache = new Map<number, number[]>(),
  xorCache = new Map<number, number>();
function allowedValues(mask: number): number[] {
  const found = domainCache.get(mask);
  if (found) return found;
  const result: number[] = [];
  for (let i = 0; i < 16; i++) if (mask & (1 << i)) result.push(i);
  if (domainCache.size > 4096) domainCache.clear();
  domainCache.set(mask, result);
  return result;
}
function xorMask(mask: number, key: number): number {
  const index = mask * 16 + key,
    found = xorCache.get(index);
  if (found !== undefined) return found;
  let result = 0;
  for (const n of allowedValues(mask)) result |= 1 << (n ^ key);
  if (xorCache.size > 8192) xorCache.clear();
  xorCache.set(index, result);
  return result;
}
const mergeRows = (a: Rows, b: Rows) => b.forEach((m, i) => (a[i] |= m));
export function valuesFromRows(rows: Rows): number[] {
  return Array.from({ length: 256 }, (_, b) => b).filter(
    (b) => !!(rows[b & 15] & (1 << (b >>> 4))),
  );
}
function rowMasks(rows: Rows): [number, number] {
  let lo = 0,
    hi = 0;
  rows.forEach((m, i) => {
    if (m) {
      lo |= 1 << i;
      hi |= m;
    }
  });
  return [lo, hi];
}
function cartesian(lo: number, hi: number): Rows {
  return Array.from({ length: 16 }, (_, i) => (lo & (1 << i) ? hi : 0));
}
function xorDomains(a: number, b: number): number {
  if (!a || !b) return 0;
  if (a === 0xffff || b === 0xffff) return 0xffff;
  const av = allowedValues(a),
    bv = allowedValues(b);
  if (av.length === 1) return xorMask(b, av[0]);
  if (bv.length === 1) return xorMask(a, bv[0]);
  if (a === 0xfffe || b === 0xfffe) return 0xffff;
  let result = 0;
  for (const v of bv) result |= xorMask(a, v);
  return result;
}
function residues(
  choices: number[][],
  weights: number[],
  modulus: number,
  omit: number[] = [],
): Set<number> {
  let set = new Set([0]);
  for (let i = 0; i < 8; i++) {
    if (omit.includes(i)) continue;
    const next = new Set<number>();
    for (const r of set)
      for (const p of choices[i]) next.add((r + p * weights[i]) % modulus);
    set = next;
  }
  return set;
}
function advance(
  previous: bigint[],
  choices: number[],
  weight: number,
  modulus: number,
  multipliers: number[],
): bigint[] {
  const next = Array<bigint>(modulus).fill(0n);
  previous.forEach((count, r) => {
    if (!count) return;
    for (const p of choices)
      next[(r + p * weight) % modulus] += count * BigInt(multipliers[p]);
  });
  return next;
}
function knownPlaintext(facts: KnownFacts): number[] {
  const plain = Array<number>(96).fill(0xffff);
  const bits = (start: number, count: number, value: number | undefined) => {
    if (value === undefined) return;
    for (let bit = 0; bit < count; bit++) {
      const at = start + bit,
        nibble = Math.floor(at / 4),
        shift = at % 4;
      const mask = Array.from({ length: 16 }, (_, n) => n).reduce(
        (mask, n) =>
          ((n >>> shift) & 1) === ((value >>> bit) & 1)
            ? mask | (1 << n)
            : mask,
        0,
      );
      plain[nibble] &= mask;
    }
  };
  bits(0, 16, facts.species);
  bits(16, 16, facts.heldItem);
  bits(32, 32, facts.experience);
  bits(72, 8, facts.friendship);
  bits(64, 8, facts.ppBonuses);
  bits(352, 27, facts.ribbons);
  facts.evs?.forEach((v, i) => {
    if (v !== null) bits(192 + i * 8, 8, v);
  });
  facts.contest?.forEach((v, i) => {
    if (v !== null) bits(240 + i * 8, 8, v);
  });
  bits(288, 8, facts.pokerus);
  if (facts.otGender !== undefined)
    bits(319, 1, facts.otGender === "female" ? 1 : 0);
  facts.ivs?.forEach((v, i) => {
    if (v !== null) bits(320 + i * 5, 5, v);
  });
  bits(350, 1, facts.isEgg);
  if (facts.ability !== undefined) {
    const abilities = speciesTraits(facts.species)!.abilities;
    let mask = 0;
    for (let slot = 0; slot < 2; slot++)
      if (abilities[slot].id === facts.ability)
        for (let n = 0; n < 16; n++) if (n >>> 3 === slot) mask |= 1 << n;
    plain[87] &= mask; // Misc byte 7, bit 7. No PID-parity assumption.
  }
  return plain;
}

export function analyzeConstraints(input: number[], supplied: KnownFacts = {}) {
  if (
    input.length !== 160 ||
    input.some((m) => !Number.isInteger(m) || m < 0 || m > 65535)
  )
    throw Error("Expected 160 valid nibble masks");
  const facts = validateFacts(supplied),
    plain = knownPlaintext(facts);
  const baseHeader = applyFacts(input, facts);
  const bytes = Array.from({ length: 80 }, blankRows),
    plaintext = Array.from({ length: 48 }, blankRows);
  const keyMasks = Array<number>(8).fill(0),
    orders: number[] = [],
    natures = new Set<number>();
  let pidCount = 0n,
    headerPairCount = 0n;
  const models: {
    choices: number[][];
    weights: number[];
    target: number;
    modulus: number;
  }[] = [];
  const modulus = facts.nature === undefined ? 24 : 600;
  const weights = Array.from({ length: 8 }, (_, i) => 16 ** i % modulus);
  const weights600 = Array.from({ length: 8 }, (_, i) => 16 ** i % 600);
  // Gender restrictions couple the two nibbles of the lowest PID byte.
  // Each disjoint rectangle can use the same exact digit-DP without widening it.
  for (const [genderLo, genderHi] of genderPidCases(
    facts.species,
    facts.gender,
  )) {
    const header = baseHeader.slice();
    header[0] &= genderLo;
    header[1] &= genderHi;
    for (let order = 0; order < 24; order++) {
      if (header.some((m) => m === 0)) break;
      const positions = SUBSTRUCT_POSITIONS[order],
        key = Array<number>(8).fill(0xffff);
      for (let logical = 0; logical < 96; logical++) {
        const value = plain[logical];
        if (value === 0xffff) continue;
        const physical =
          positions[Math.floor(logical / 24)] * 24 + (logical % 24);
        key[physical % 8] &= xorDomains(header[64 + physical], value);
      }
      if (key.some((m) => m === 0)) continue;
      const qs = Array.from({ length: 8 }, (_, i) =>
        Array.from(
          { length: 16 },
          (_, p) => header[8 + i] & xorMask(key[i], p),
        ),
      );
      const choices = Array.from({ length: 8 }, (_, i) =>
        allowedValues(header[i]).filter(
          (p) => qs[i][p] !== 0 && (i !== 0 || p % 8 === order % 8),
        ),
      );
      if (choices.some((p) => p.length === 0)) continue;
      const multiplicities = qs.map((row) =>
        row.map((m) => allowedValues(m).length),
      );
      const target =
        facts.nature === undefined
          ? order
          : order + 24 * ((order - facts.nature + 25) % 25);
      const forward: bigint[][] = [Array<bigint>(modulus).fill(0n)];
      forward[0][0] = 1n;
      let distinct = forward[0];
      for (let i = 0; i < 8; i++) {
        forward.push(
          advance(
            forward[i],
            choices[i],
            weights[i],
            modulus,
            multiplicities[i],
          ),
        );
        distinct = advance(
          distinct,
          choices[i],
          weights[i],
          modulus,
          Array(16).fill(1),
        );
      }
      if (forward[8][target] === 0n) continue;
      if (!orders.includes(order)) orders.push(order);
      models.push({ choices, weights, target, modulus });
      pidCount += distinct[target];
      headerPairCount += forward[8][target];
      if (facts.nature !== undefined) natures.add(facts.nature);
      else
        for (const r of residues(choices, weights600, 600))
          if (r % 24 === order) natures.add(r % 25);

      // Exact two-digit projections. The remaining six PID digits contribute
      // residue supports; each feasible pair permits independent local OT choices.
      const keyRows: Rows[] = [];
      for (let pair = 0; pair < 4; pair++) {
        const lo = pair * 2,
          hi = lo + 1,
          rest = residues(choices, weights, modulus, [lo, hi]);
        const pr = blankRows(),
          qr = blankRows(),
          kr = blankRows();
        for (const pLo of choices[lo])
          for (const pHi of choices[hi]) {
            const needed =
              (((target - pLo * weights[lo] - pHi * weights[hi]) % modulus) +
                modulus) %
              modulus;
            if (!rest.has(needed)) continue;
            pr[pLo] |= 1 << pHi;
            for (const qLo of allowedValues(qs[lo][pLo])) {
              qr[qLo] |= qs[hi][pHi];
              kr[pLo ^ qLo] |= xorMask(qs[hi][pHi], pHi);
            }
          }
        mergeRows(bytes[pair], pr);
        mergeRows(bytes[4 + pair], qr);
        keyRows.push(kr);
        const km = rowMasks(kr);
        keyMasks[lo] |= km[0];
        keyMasks[hi] |= km[1];
      }
      for (let byte = 8; byte < 32; byte++)
        mergeRows(
          bytes[byte],
          cartesian(header[byte * 2], header[byte * 2 + 1]),
        );
      for (let logicalByte = 0; logicalByte < 48; logicalByte++) {
        const physicalByte =
          positions[Math.floor(logicalByte / 12)] * 12 + (logicalByte % 12);
        const cLo = header[64 + physicalByte * 2],
          cHi = header[65 + physicalByte * 2];
        const pLo = plain[logicalByte * 2],
          pHi = plain[logicalByte * 2 + 1];
        const cr = blankRows(),
          dr = blankRows(),
          kr = keyRows[physicalByte % 4];
        kr.forEach((keyHi, keyLo) => {
          if (!keyHi) return;
          const decryptedLo = xorMask(cLo, keyLo) & pLo;
          const decryptedHi = xorDomains(cHi, keyHi) & pHi;
          for (const lo of allowedValues(decryptedLo)) dr[lo] |= decryptedHi;
          const cipherLo = cLo & xorMask(pLo, keyLo);
          const cipherHi = cHi & xorDomains(keyHi, pHi);
          for (const lo of allowedValues(cipherLo)) cr[lo] |= cipherHi;
        });
        mergeRows(plaintext[logicalByte], dr);
        mergeRows(bytes[32 + physicalByte], cr);
      }
    }
  }
  orders.sort((a, b) => a - b);
  const masks = bytes.flatMap(rowMasks),
    plaintextMasks = plaintext.flatMap(rowMasks);
  const plaintextByteValues = plaintext.map(valuesFromRows),
    byteValues = bytes.map(valuesFromRows);
  const exactKey = keyMasks.every((m) => allowedValues(m).length === 1);
  const secureCountsExact =
    headerPairCount > 0n && exactKey && orders.length === 1;
  // List only small proven sets, pruning with suffix residues. No large PID
  // space is enumerated and no complete candidate Pokémon is invented.
  let pidValues: number[] | null = null;
  if (pidCount <= 256n) {
    const found = new Set<number>();
    for (const model of models) {
      const suffix: Set<number>[] = Array.from(
        { length: 9 },
        () => new Set<number>(),
      );
      suffix[8].add(0);
      for (let i = 7; i >= 0; i--)
        for (const r of suffix[i + 1])
          for (const p of model.choices[i])
            suffix[i].add((r + p * model.weights[i]) % model.modulus);
      const visit = (i: number, residue: number, value: number) => {
        if (i === 8) {
          found.add(value);
          return;
        }
        for (const p of model.choices[i]) {
          const next = (residue + p * model.weights[i]) % model.modulus;
          if (
            suffix[i + 1].has(
              (model.target - next + model.modulus) % model.modulus,
            )
          )
            visit(i + 1, next, value + p * 16 ** i);
        }
      };
      visit(0, 0, 0);
    }
    pidValues = [...found].sort((a, b) => a - b);
  }
  return {
    consistent: headerPairCount > 0n,
    masks,
    byteValues,
    plaintextMasks,
    plaintextByteValues,
    keyMasks,
    orders,
    natures: [...natures].sort((a, b) => a - b),
    pidCount,
    pidValues,
    headerPairCount,
    secureCountsExact,
    cryptoFacts: plain.some((v) => v !== 0xffff),
    reason:
      headerPairCount > 0n
        ? null
        : "No PID / trainer-ID pair and block order satisfies the pixels and supplied facts. Check painting, gender, ability, stats and trainer information.",
  };
}
export type Inference = ReturnType<typeof analyzeConstraints>;
export function fieldPossibilities(
  masks: number[],
  bytes: number[][],
  offset: number,
  size: number,
  independent = false,
) {
  const f = summarizeField(masks, offset, size);
  const count = bytes
    .slice(offset, offset + size)
    .reduce((n, b) => n * BigInt(b.length), 1n);
  return { ...f, count, countExact: independent || size === 1 || count <= 1n };
}
// IVs cross nibble/byte boundaries. These projections deliberately expose an
// upper bound unless singleton; checksum/legality/cross-field searches are absent.
export function ivPossibilities(result: Inference, index: number): number[] {
  if (!Number.isInteger(index) || index < 0 || index > 5)
    throw Error("Invalid IV index");
  const start = index * 5,
    masks = result.plaintextMasks.slice(80, 96);
  return Array.from({ length: 32 }, (_, v) => v).filter((value) => {
    const first = Math.floor(start / 4),
      last = Math.floor((start + 4) / 4);
    for (let nibble = first; nibble <= last; nibble++) {
      if (
        !allowedValues(masks[nibble]).some((n) => {
          for (let bit = 0; bit < 4; bit++) {
            const at = nibble * 4 + bit - start;
            if (at >= 0 && at < 5 && ((n >>> bit) & 1) !== ((value >>> at) & 1))
              return false;
          }
          return true;
        })
      )
        return false;
    }
    return true;
  });
}
