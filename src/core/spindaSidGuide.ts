import type { KnownFacts, Observation } from "./constraints";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { knownPlaintext } from "./inference";
import { SPINDA_SPECIES } from "./spinda";
import type { SpindaCandidate } from "./spindaMatcher";

export type SidDigit = 1 | 2 | 3 | 4; // Most significant first, as printed.
export type SpindaSidGuideState = {
  pid: number;
  digit: SidDigit;
  enabled: boolean;
  freshZeros: boolean;
  paddingZero: boolean;
  // Physical curtain answers stay put when testing another PID/permutation.
  observations: Record<number, 0 | 1>;
  // Plaintext belongs to logical fields, independently of their permutation.
  plaintext: Record<number, number>;
};
export function newSpindaSidGuide(pid: number): SpindaSidGuideState {
  return {
    pid,
    digit: 1,
    enabled: true,
    freshZeros: false,
    paddingZero: false,
    observations: {},
    plaintext: {},
  };
}

const fields = [
  ["Held item, byte 1", "Held item, byte 2"],
  ["Experience, byte 3", "Experience, byte 4"],
  ["Growth padding, byte 1", "Growth padding, byte 2"],
  ["Move 2 ID, byte 1", "Move 2 ID, byte 2"],
  ["Move 4 ID, byte 1", "Move 4 ID, byte 2"],
  ["Move 3 PP", "Move 4 PP"],
  ["Defense EV", "Speed EV"],
  ["Cool", "Beauty"],
  ["Tough", "Sheen"],
  ["Origins, byte 1", "Origins, byte 2"],
  ["Packed IVs / flags, byte 3", "Packed IVs / flags, byte 4"],
  ["Ribbons / flags, byte 3", "Ribbons / flags, byte 4"],
];
export const SID_BLOCK_NAMES = [
  "Growth",
  "Attacks",
  "EVs / Contest",
  "Miscellaneous",
];

/** Each 12-byte block contains three repetitions of the four-byte XOR key.
 * Global curtain nibble 16 starts the main record; secure bytes start at 32.
 * Use the shared logical-to-physical order, never a second permutation table. */
export function spindaSidTargets(pid: number, digit: SidDigit) {
  const keyNibble = 8 - digit,
    side = keyNibble % 2;
  return fields.map((names, i) => {
    const logicalByte = i * 4 + (digit <= 2 ? 3 : 2),
      block = Math.floor(logicalByte / 12),
      recordByte =
        32 + SUBSTRUCT_POSITIONS[pid % 24][block] * 12 + (logicalByte % 12);
    return {
      digit,
      keyNibble,
      pidDigit: (pid >>> (keyNibble * 4)) & 15,
      logicalNibble: logicalByte * 2 + side,
      nibble: 16 + recordByte * 2 + side,
      block,
      field: names[digit <= 2 ? 1 : 0],
      half: side ? "high" : "low",
      freshZero: [6, 7, 8, 11].includes(i),
      padding: i === 2,
    };
  });
}
export type SidPixelTarget = ReturnType<typeof spindaSidTargets>[number];
/** Shared stored-data rules, in logical order. Never borrow facts from an
 * investigation explicitly describing a different Pokémon (or a blank form's
 * default move slots). These masks are derived, not saved as manual inputs. */
export function spindaInfoPlaintext(facts?: KnownFacts) {
  return facts?.species === SPINDA_SPECIES ? knownPlaintext(facts) : undefined;
}
/** Exact IV/flag words from complete encounters for this PID only. Do not
 * infer IVs from the visual ranking or take the first method's spread.
 * Entered packed-data constraints filter whole words, preserving correlation. */
export function spindaRngEvidence(
  pid: number,
  candidate?: SpindaCandidate,
  infoPlaintext?: number[],
) {
  if (!candidate || candidate.pid !== pid) return undefined;
  const words = new Map<number, number[]>();
  for (const encounter of candidate.encounters) {
    if (encounter.pid !== pid) continue;
    const word =
      (encounter.ivs.reduce((v, iv, i) => v | (iv << (i * 5)), 0) |
        (encounter.abilitySlot << 31)) >>>
      0; // Wild encounters are not Eggs.
    const plain = Array<number>(96).fill(0xffff);
    for (let n = 0; n < 8; n++) plain[80 + n] = 1 << ((word >>> (n * 4)) & 15);
    if (plain.some((m, n) => !(m & (infoPlaintext?.[n] ?? 0xffff)))) continue;
    words.set(word, plain);
  }
  const plaintexts = [...words.values()];
  return {
    plaintexts,
    masks: Array.from({ length: 96 }, (_, n) =>
      plaintexts.reduce((m, p) => m | p[n], 0),
    ),
    ivs: [...words.keys()].map((word) =>
      Array.from({ length: 6 }, (_, i) => (word >>> (i * 5)) & 31),
    ),
  };
}

export function guidePlaintextDetails(
  guide: SpindaSidGuideState,
  target: SidPixelTarget,
  infoPlaintext?: number[],
  rngPlaintext?: number[],
): {
  value: number | undefined;
  source: "manual" | "info" | "rng" | "preset" | "unknown";
} {
  if (target.logicalNibble in guide.plaintext) {
    const value = guide.plaintext[target.logicalNibble];
    return { value: value === -1 ? undefined : value, source: "manual" };
  }
  const infoMask = infoPlaintext?.[target.logicalNibble] ?? 0xffff,
    mask = infoMask & (rngPlaintext?.[target.logicalNibble] ?? 0xffff);
  if (mask && !(mask & (mask - 1)))
    return {
      value: 31 - Math.clz32(mask),
      source: infoMask === mask ? "info" : "rng",
    };
  // A partially known packed nibble is not an exact value. A zero preset can
  // fill it only if it does not contradict the entered bits.
  if (
    mask & 1 &&
    ((guide.freshZeros && target.freshZero) ||
      (guide.paddingZero && target.padding))
  )
    return { value: 0, source: "preset" };
  return { value: undefined, source: "unknown" };
}
export function guidePlaintext(
  guide: SpindaSidGuideState,
  target: SidPixelTarget,
  infoPlaintext?: number[],
) {
  return guidePlaintextDetails(guide, target, infoPlaintext).value;
}
/** A black pixel excludes one digit; an unknown pixel excludes nothing. */
export function sidDigitMask(
  pidDigit: number,
  plaintext: number | undefined,
  observed: Observation,
): number {
  if (plaintext === undefined || observed === -1) return 0xffff;
  const bit = 1 << (pidDigit ^ plaintext);
  return observed === 0 ? bit : 0xffff ^ bit;
}
/** A set-valued plaintext must not turn a black answer into an exclusion
 * for every alternative. Union the per-word solutions after checking all four
 * digits, so incompatible IV spreads cannot be mixed between guide answers. */
export function guidePlaintextMask(
  guide: SpindaSidGuideState,
  target: SidPixelTarget,
  infoPlaintext?: number[],
  rngPlaintext?: number[],
) {
  const value = guidePlaintextDetails(
    guide,
    target,
    infoPlaintext,
    rngPlaintext,
  ).value;
  if (value !== undefined) return 1 << value;
  if (target.logicalNibble in guide.plaintext || !rngPlaintext) return 0xffff;
  return (
    (infoPlaintext?.[target.logicalNibble] ?? 0xffff) &
    rngPlaintext[target.logicalNibble]
  );
}
export function sidDigitMaskForPlaintext(
  pidDigit: number,
  plaintextMask: number,
  observed: Observation,
) {
  if (observed === -1) return 0xffff;
  let mask = 0;
  for (let p = 0; p < 16; p++)
    if (plaintextMask & (1 << p)) mask |= sidDigitMask(pidDigit, p, observed);
  return mask;
}
export function spindaSidMasks(
  guide: SpindaSidGuideState,
  infoPlaintext?: number[],
  rngPlaintexts?: number[][],
  sidDigitFilters?: number[],
) {
  const union = [0, 0, 0, 0];
  for (const plain of rngPlaintexts ?? [undefined]) {
    const masks = ([1, 2, 3, 4] as const).map((digit) =>
      spindaSidTargets(guide.pid, digit).reduce(
        (mask, target) =>
          mask &
          sidDigitMaskForPlaintext(
            target.pidDigit,
            guidePlaintextMask(guide, target, infoPlaintext, plain),
            guide.observations[target.nibble] ?? -1,
          ),
        sidDigitFilters?.[4 - digit] ?? 0xffff,
      ),
    );
    if (!rngPlaintexts || masks.every(Boolean))
      masks.forEach((m, i) => (union[i] |= m));
  }
  return union;
}
export function spindaBlockOrder(pid: number) {
  const order = Array<string>(4);
  SUBSTRUCT_POSITIONS[pid % 24].forEach((position, logical) => {
    order[position] = SID_BLOCK_NAMES[logical];
  });
  return order;
}
export function validateSpindaSidGuide(value: unknown): SpindaSidGuideState {
  if (!value || typeof value !== "object")
    throw Error("Invalid Spinda SID guide");
  const v = value as SpindaSidGuideState;
  if (
    !Number.isInteger(v.pid) ||
    v.pid < 0 ||
    v.pid > 0xffffffff ||
    ![1, 2, 3, 4].includes(v.digit) ||
    typeof v.enabled !== "boolean" ||
    typeof v.freshZeros !== "boolean" ||
    typeof v.paddingZero !== "boolean"
  )
    throw Error("Invalid Spinda SID guide settings");
  const validMap = (map: unknown, physical: boolean) => {
    if (!map || typeof map !== "object" || Array.isArray(map)) return false;
    return Object.entries(map).every(([k, n]) => {
      const key = Number(k);
      return (
        String(key) === k &&
        Number.isInteger(key) &&
        (physical ? key >= 80 && key < 176 : key >= 0 && key < 96) &&
        key % 8 >= 4 &&
        Number.isInteger(n) &&
        (physical ? n === 0 || n === 1 : n >= -1 && n <= 15)
      );
    });
  };
  if (!validMap(v.observations, true) || !validMap(v.plaintext, false))
    throw Error("Invalid Spinda SID guide pixels");
  return {
    pid: v.pid,
    digit: v.digit,
    enabled: v.enabled,
    freshZeros: v.freshZeros,
    paddingZero: v.paddingZero,
    observations: { ...v.observations },
    plaintext: { ...v.plaintext },
  };
}
