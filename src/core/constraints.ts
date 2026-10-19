import { type Memory, type Records, assembleMemory } from "./memory";
import { decodePokemon, NATURES, hex } from "./pokemon";
import { nibbleValue } from "./tiles";
import { genderForPid, speciesTraits, type Gender } from "./traits";
import { encodeOtName, encodeNickname, matchesOtName } from "./names";
export type Observation = -1 | 0 | 1; // unknown, transparent, black
export type Observations = Observation[];
export type KnownFacts = {
  pid?: number;
  tid?: number;
  sid?: number;
  otGender?: "male" | "female"; // Stored original-trainer gender bit.
  otName?: string; // Exact visible name; trailing bytes after EOS stay unknown.
  nickname?: string; // Exact visible nickname; bytes after EOS stay unknown.
  species?: number;
  nature?: number;
  experience?: number;
  evs?: (number | null)[]; // HP, Atk, Def, Speed, SpA, SpD; null is unknown.
  ivs?: (number | null)[];
  contest?: (number | null)[]; // Cool, Beauty, Cute, Smart, Tough, Sheen.
  gender?: Gender;
  ability?: number; // Ability ID, NOT PID parity or ability-slot number.
  pokerus?: number; // Original stored byte, including strain/duration.
  markings?: number;
  isEgg?: number; // 0 or 1, stored flag.
  heldItem?: number;
  friendship?: number;
  ppBonuses?: number; // Four packed 2-bit PP Up counters.
  ribbons?: number; // Low 27 ribbon bits; excludes unused/fateful flags.
  moves?: (number | null)[];
  pp?: (number | null)[];
  metLocation?: number;
  metLevel?: number;
  metGame?: number;
  ball?: number;
  language?: number;
  headerFlags?: number;
  checksum?: number;
  headerPadding?: number;
  growthPadding?: number;
  ribbonTail?: number; // Upper five bits; optional normal-wild preset assumes zero.
  assumed?: string[]; // Draft field keys filled by an explicitly labeled preset.
  notes?: string;
};
export const emptyObservations = (): Observations =>
  Array<Observation>(192).fill(-1);
// Call only after the user explicitly declares a displayed pattern complete.
// Default scope excludes the 16 neighboring bytes, preserving missing data.
export function completeObservations(
  obs: Observations,
  includeNeighbors = false,
): Observations {
  if (obs.length !== 192 || obs.some((v) => ![-1, 0, 1].includes(v)))
    throw Error("Invalid observations");
  return obs.map((value, n) =>
    value === -1 && (includeNeighbors || (n >= 16 && n < 176)) ? 0 : value,
  );
}
export const allowedMask = (o: Observation) =>
  o === 0 ? 1 : o === 1 ? 0xfffe : 0xffff;
export const allowedValues = (mask: number) =>
  Array.from({ length: 16 }, (_, i) => i).filter((i) => !!(mask & (1 << i)));
export function recordMasks(obs: Observations, slot: 4 | 5 | 6): number[] {
  const masks = Array<number>(160).fill(0xffff);
  for (let n = 0; n < 192; n++) {
    const byte = Math.floor(n / 2),
      s = byte < 8 ? 4 : byte < 88 ? 5 : 6;
    if (s !== slot) continue;
    const offset = byte < 8 ? 72 + byte : byte < 88 ? byte - 8 : byte - 88;
    masks[offset * 2 + (n % 2)] = allowedMask(obs[n]);
  }
  return masks;
}
export function applyFacts(masks: number[], facts: KnownFacts) {
  const result = masks.slice();
  const set = (offset: number, size: number, value: number) => {
    for (let i = 0; i < size; i++) {
      const b = (value >>> (8 * i)) & 255;
      result[(offset + i) * 2] &= 1 << (b & 15);
      result[(offset + i) * 2 + 1] &= 1 << (b >> 4);
    }
  };
  if (facts.pid !== undefined) set(0, 4, facts.pid);
  if (facts.tid !== undefined) set(4, 2, facts.tid);
  if (facts.sid !== undefined) set(6, 2, facts.sid);
  if (facts.otName !== undefined) {
    encodeOtName(facts.otName).forEach((value, i) => set(20 + i, 1, value));
  }
  if (facts.nickname !== undefined)
    encodeNickname(facts.nickname).forEach((value, i) => set(8 + i, 1, value));
  if (facts.markings !== undefined) set(27, 1, facts.markings);
  if (facts.language !== undefined) set(18, 1, facts.language);
  if (facts.headerFlags !== undefined) set(19, 1, facts.headerFlags);
  if (facts.isEgg !== undefined) {
    // SetMonData keeps the unencrypted sanity Egg bit and secure Egg bit in sync.
    result[38] &= facts.isEgg ? 0xf0f0 : 0x0f0f;
  }
  if (facts.checksum !== undefined) set(28, 2, facts.checksum);
  if (facts.headerPadding !== undefined) set(30, 2, facts.headerPadding);
  return result;
}
export const maskSymbol = (mask: number) =>
  mask === 0
    ? "!"
    : allowedValues(mask).length === 1
      ? hex(allowedValues(mask)[0], 1)
      : mask === 0xfffe
        ? "+"
        : "?";
export function constraintHex(masks: number[]) {
  return Array.from(
    { length: 80 },
    (_, b) => maskSymbol(masks[b * 2 + 1]) + maskSymbol(masks[b * 2]),
  ).join(" ");
}
export function summarizeField(masks: number[], offset: number, size: number) {
  let count = 1n,
    min = 0n,
    max = 0n;
  for (let n = 0; n < size * 2; n++) {
    const values = allowedValues(masks[offset * 2 + n]);
    count *= BigInt(values.length);
    if (values.length) {
      min += BigInt(values[0]) << (BigInt(n) * 4n);
      max += BigInt(values.at(-1)!) << (BigInt(n) * 4n);
    }
  }
  return {
    count,
    min,
    max,
    exact: count === 1n ? min : null,
    hex: Array.from(
      { length: size },
      (_, b) =>
        maskSymbol(masks[(offset + b) * 2 + 1]) +
        maskSymbol(masks[(offset + b) * 2]),
    )
      .reverse()
      .join(""),
  };
}
// Bounded residue propagation; no enumeration over PIDs or Pokémon records.
export function possibleResidues(masks: number[], modulus: number): number[] {
  let residues = new Set([0]),
    weight = 1;
  for (let n = 0; n < 8; n++) {
    const next = new Set<number>();
    for (const r of residues)
      for (const v of allowedValues(masks[n]))
        next.add((r + v * weight) % modulus);
    residues = next;
    weight = (weight * 16) % modulus;
  }
  return Array.from(residues).sort((a, b) => a - b);
}
export function compareCandidate(
  obs: Observations,
  records: Records,
  facts: KnownFacts = {},
) {
  const memory = assembleMemory(records),
    contradictions: number[] = [],
    matches: number[] = [],
    unresolved: number[] = [];
  obs.forEach((o, i) => {
    if (o === -1) return;
    const v = nibbleValue(memory, i);
    if (v === null) unresolved.push(i);
    else if ((v === 0 ? 0 : 1) === o) matches.push(i);
    else contradictions.push(i);
  });
  const factContradictions: string[] = [];
  if (records[5]) {
    const p = decodePokemon(records[5]);
    if (
      facts.nickname !== undefined &&
      !encodeNickname(facts.nickname).every(
        (value, i) => records[5]![8 + i] === value,
      )
    )
      factContradictions.push("Nickname differs from supplied information");
    if (
      facts.isEgg !== undefined &&
      ((p.headerFlags >>> 2) & 1) !== facts.isEgg
    )
      factContradictions.push(
        "Header Egg flag differs from supplied information",
      );
    if (facts.otGender !== undefined && facts.otGender !== p.otGender)
      factContradictions.push("OT gender differs from supplied information");
    if (facts.otName !== undefined && !matchesOtName(records[5], facts.otName))
      factContradictions.push("OT name differs from supplied information");
    for (const field of ["pid", "tid", "sid", "nature", "species"] as const)
      if (facts[field] !== undefined && facts[field] !== p[field])
        factContradictions.push(
          `${field}: candidate ${field === "nature" ? NATURES[p.nature] : p[field]}, supplied ${field === "nature" ? NATURES[facts[field]!] : facts[field]}`,
        );
    facts.evs?.forEach((value, i) => {
      if (value !== null && value !== p.evs[i])
        factContradictions.push(
          `EV ${["HP", "Atk", "Def", "Speed", "SpA", "SpD"][i]}: candidate ${p.evs[i]}, supplied ${value}`,
        );
    });
    for (const field of ["ivs", "contest", "moves", "pp"] as const)
      facts[field]?.forEach((value, i) => {
        if (value !== null && value !== p[field][i])
          factContradictions.push(
            `${field} ${i + 1}: candidate ${p[field][i]}, supplied ${value}`,
          );
      });
    for (const field of [
      "pokerus",
      "markings",
      "heldItem",
      "friendship",
      "experience",
      "ppBonuses",
      "ribbons",
      "metLocation",
      "metLevel",
      "metGame",
      "ball",
      "language",
      "headerFlags",
      "checksum",
      "headerPadding",
      "growthPadding",
      "ribbonTail",
    ] as const)
      if (facts[field] !== undefined && facts[field] !== p[field])
        factContradictions.push(
          `${field}: candidate ${p[field]}, supplied ${facts[field]}`,
        );
    if (facts.isEgg !== undefined && facts.isEgg !== Number(p.isEgg))
      factContradictions.push("Egg flag differs from supplied information");
    if (
      facts.gender !== undefined &&
      genderForPid(p.species, p.pid) !== facts.gender
    )
      factContradictions.push("Gender differs from supplied information");
    if (
      facts.ability !== undefined &&
      speciesTraits(p.species)?.abilities[p.ability]?.id !== facts.ability
    )
      factContradictions.push("Ability differs from supplied information");
  }
  return {
    observed: matches.length + contradictions.length + unresolved.length,
    matches,
    contradictions,
    unresolved,
    factContradictions,
    possible: contradictions.length === 0 && factContradictions.length === 0,
  };
}
export function observeMemory(memory: Memory): Observations {
  return Array.from({ length: 192 }, (_, i) => {
    const n = nibbleValue(memory, i);
    return n === null ? -1 : n === 0 ? 0 : 1;
  });
}
