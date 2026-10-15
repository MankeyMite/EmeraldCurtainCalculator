import type { KnownFacts } from "./constraints";
import { analyzeConstraints } from "./inference";
import { hex } from "./pokemon";
import { validateFacts } from "./session";

const numericFields = [
  "pid",
  "tid",
  "sid",
  "species",
  "nature",
  "ability",
  "pokerus",
  "markings",
  "isEgg",
  "heldItem",
  "friendship",
  "experience",
  "ppBonuses",
  "ribbons",
] as const;
const fields = [...numericFields, "gender"] as const;
const labels = {
  pid: "PID",
  tid: "TID",
  sid: "SID",
  species: "Species",
  nature: "Nature",
  ability: "Ability",
  pokerus: "Pokérus byte",
  markings: "Markings",
  isEgg: "Egg flag",
  heldItem: "Held item",
  friendship: "Friendship",
  experience: "Experience",
  gender: "Gender",
  ppBonuses: "PP Ups byte",
  ribbons: "Ribbon bits",
};
const evNames = [
  "HP",
  "Attack",
  "Defense",
  "Speed",
  "Sp. Attack",
  "Sp. Defense",
];

export type HypothesisDraft = Record<string, string>;
export type HypothesisResult = {
  status: "empty" | "invalid" | "baseline-conflict" | "possible" | "impossible";
  reasons: string[];
  pidCount?: bigint;
  headerPairCount?: bigint;
};

/** Strict whole-input parsing: decimal or explicit 0x hexadecimal, never partial parseInt. */
export function parseHypothesis(draft: HypothesisDraft): KnownFacts {
  const read = (key: string, label: string) => {
    const text = (draft[key] ?? "").trim();
    if (!text) return undefined;
    if (!/^(?:\d+|0x[0-9a-f]+)$/i.test(text))
      throw Error(`${label}: enter a whole decimal number or 0x hexadecimal.`);
    return Number(text);
  };
  const facts: KnownFacts = {};
  for (const key of numericFields) {
    const value = read(key, labels[key]);
    if (value !== undefined) facts[key] = value;
  }
  if (draft.gender?.trim()) facts.gender = draft.gender as KnownFacts["gender"];
  for (const [key, prefix] of [
    ["evs", "ev"],
    ["ivs", "iv"],
    ["contest", "contest"],
  ] as const) {
    const values = evNames.map(
      (_, i) => read(`${prefix}_${i}`, `${prefix} ${i + 1}`) ?? null,
    );
    if (values.some((v) => v !== null)) facts[key] = values;
  }
  return validateFacts(facts, false);
}

/** Existential compatibility under the supported model, not proof of legality or RNG reachability.
 * Trials are additional constraints. Existing facts must never be overwritten by a guess.
 * Re-run the joint model, rather than checking marginal byte/nibble domains separately.
 */
export function testHypothesis(
  input: number[],
  known: KnownFacts,
  trial: KnownFacts,
): HypothesisResult {
  let base: KnownFacts, guess: KnownFacts;
  try {
    base = validateFacts(known);
    guess = validateFacts(trial, false);
  } catch (error) {
    return { status: "invalid", reasons: [(error as Error).message] };
  }
  const baseline = analyzeConstraints(input, base);
  if (!baseline.consistent)
    return {
      status: "baseline-conflict",
      reasons: [
        "The drawing and known information already conflict. Resolve them before testing a hypothesis.",
      ],
    };
  if (
    !fields.some((key) => guess[key] !== undefined) &&
    ![guess.evs, guess.ivs, guess.contest].some((values) =>
      values?.some((v) => v !== null),
    )
  )
    return { status: "empty", reasons: ["Enter at least one trial value."] };

  const reasons: string[] = [];
  const merged: KnownFacts = { ...base };
  for (const key of fields) {
    if (guess[key] === undefined) continue;
    if (base[key] !== undefined && base[key] !== guess[key])
      reasons.push(
        `${labels[key]} conflicts with the value in known information.`,
      );
    else Object.assign(merged, { [key]: guess[key] });
  }
  for (const array of ["evs", "ivs", "contest"] as const) {
    if (guess[array]) {
      merged[array] = (base[array] ?? Array<null>(6).fill(null)).slice();
      guess[array]!.forEach((value, i) => {
        if (value === null) return;
        if (merged[array]![i] !== null && merged[array]![i] !== value)
          reasons.push(
            `${evNames[i]} ${array === "evs" ? "EV" : array === "ivs" ? "IV" : "condition"} conflicts with the value in known information.`,
          );
        else merged[array]![i] = value;
      });
    }
  }
  for (const [key, offset, size] of [
    ["pid", 0, 4],
    ["tid", 4, 2],
    ["sid", 6, 2],
  ] as const) {
    const value = guess[key];
    if (value === undefined) continue;
    for (let n = 0; n < size * 2; n++) {
      const digit = Math.floor(value / 16 ** n) % 16;
      if (!(input[offset * 2 + n] & (1 << digit)))
        reasons.push(
          `${labels[key]} byte 0x${hex(offset + Math.floor(n / 2), 2)}, ${n % 2 ? "high" : "low"} nibble: ${hex(digit, 1)} is excluded by the drawing.`,
        );
    }
  }
  if (reasons.length) return { status: "impossible", reasons };
  if (
    merged.pid !== undefined &&
    merged.nature !== undefined &&
    merged.pid % 25 !== merged.nature
  )
    return {
      status: "impossible",
      reasons: ["The PID does not have the supplied nature (PID % 25)."],
    };

  let result;
  try {
    result = analyzeConstraints(input, merged);
  } catch (error) {
    return { status: "invalid", reasons: [(error as Error).message] };
  }
  return {
    status: result.consistent ? "possible" : "impossible",
    reasons: [
      result.consistent
        ? "At least one PID / trainer-ID pair satisfies the drawing, known information and these trial values."
        : "No PID / trainer-ID pair satisfies this combination of pixels, supplied traits/stats, XOR key and block order.",
    ],
    pidCount: result.pidCount,
    headerPairCount: result.headerPairCount,
  };
}
