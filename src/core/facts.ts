import type { KnownFacts } from "./constraints";
import { validateFacts } from "./session";

export const STAT_NAMES = [
  "HP",
  "Attack",
  "Defense",
  "Speed",
  "Sp. Attack",
  "Sp. Defense",
];
export const CONTEST_NAMES = [
  "Cool",
  "Beauty",
  "Cute",
  "Smart",
  "Tough",
  "Sheen",
];
export const FACT_ARRAYS = {
  evs: "ev",
  ivs: "iv",
  contest: "contest",
} as const;
export function freshCatchFacts(): KnownFacts {
  return {
    evs: [0, 0, 0, 0, 0, 0],
    contest: [0, 0, 0, 0, 0, 0],
    pokerus: 0,
    markings: 0,
    isEgg: 0,
    ppBonuses: 0,
    ribbons: 0,
    assumed: [
      ...Array.from({ length: 6 }, (_, i) => `ev_${i}`),
      ...Array.from({ length: 6 }, (_, i) => `contest_${i}`),
      "pokerus",
      "markings",
      "isEgg",
      "ppBonuses",
      "ribbons",
    ],
  };
}
export function factsToDraft(facts: KnownFacts): Record<string, string> {
  return Object.fromEntries(
    Object.entries(facts).flatMap(([key, value]) => {
      if (key === "assumed") return [];
      if (key in FACT_ARRAYS)
        return (value as (number | null)[]).map((v, i) => [
          `${FACT_ARRAYS[key as keyof typeof FACT_ARRAYS]}_${i}`,
          v === null ? "" : String(v),
        ]);
      return [[key, String(value)]];
    }),
  );
}
export function draftToFacts(
  draft: Record<string, string>,
  assumed: string[] = [],
): KnownFacts {
  const number = (value: string) =>
    /^(?:0x[\da-f]+|\d+)$/i.test(value.trim()) ? Number(value) : NaN;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (key === "otName") {
      if (value !== "") next.otName = value;
      continue;
    }
    if (!value.trim() || /^(ev|iv|contest)_/.test(key)) continue;
    next[key] =
      key === "gender" || key === "otGender" || key === "notes"
        ? value
        : number(value);
  }
  for (const [key, prefix] of Object.entries(FACT_ARRAYS)) {
    const values = Array.from({ length: 6 }, (_, i) =>
      draft[`${prefix}_${i}`]?.trim() ? number(draft[`${prefix}_${i}`]) : null,
    );
    if (values.some((v) => v !== null)) next[key] = values;
  }
  if (assumed.length)
    next.assumed = assumed.filter((key) => draft[key]?.trim() === "0");
  return validateFacts(next);
}
