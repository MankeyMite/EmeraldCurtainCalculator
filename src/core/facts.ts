import type { KnownFacts } from "./constraints";
import { validateFacts } from "./session";
import captureDefaults from "../data/capture-defaults.json";
import species from "../data/species.json";
import { maxPp, ppUpStages, ppUpChange } from "./pp";

export const speciesNickname = (id: number | undefined) =>
  species.find((s) => s.id === id)?.name.toUpperCase();

/** A selected slot is explicit; never promote the other three assumed-zero
 * counters into verified facts by editing their shared byte. */
export function ppUpDraftChange(
  facts: KnownFacts,
  index: number,
  stage: number,
): Record<string, string> {
  const assumedPacked = facts.assumed?.includes("ppBonuses"),
    next = ppUpChange(
      facts.moves?.[index] ?? undefined,
      index,
      stage,
      assumedPacked ? undefined : facts.ppBonuses,
    );
  return {
    [`pp_${index}`]: String(next.pp),
    ...(assumedPacked
      ? { ppBonuses: "" }
      : next.ppBonuses === undefined
        ? {}
        : { ppBonuses: String(next.ppBonuses) }),
  };
}

/** Editable starting assumptions for a new investigation, never injected into imports. */
export function newPokemonFacts(): KnownFacts {
  return {
    metGame: 3,
    language: 2,
    headerFlags: 2,
    isEgg: 0,
    ppBonuses: 0,
    moves: [0, 0, 0, 0],
    pp: [0, 0, 0, 0],
    assumed: [
      "headerFlags",
      "isEgg",
      "ppBonuses",
      ...Array.from({ length: 4 }, (_, i) => `move_${i}`),
      ...Array.from({ length: 4 }, (_, i) => `pp_${i}`),
    ],
  };
}

/** Source-initialized zero fields for an ordinary, unmodified Emerald wild catch. */
export function wildStoragePreset(facts: KnownFacts): KnownFacts {
  const next = { ...facts },
    assumed = new Set(facts.assumed);
  for (const key of ["headerPadding", "growthPadding", "ribbonTail"] as const)
    if (next[key] === undefined) {
      next[key] = 0;
      assumed.add(key);
    }
  if (next.headerFlags === undefined) {
    next.headerFlags = next.isEgg ? 6 : 2;
    assumed.add("headerFlags");
  }
  next.assumed = [...assumed];
  return validateFacts(next);
}

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
  moves: "move",
  pp: "pp",
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
export function freshCapturePreset(facts: KnownFacts): KnownFacts {
  const fresh = freshCatchFacts();
  const next = {
    ...facts,
    ...fresh,
    assumed: [...new Set([...(facts.assumed ?? []), ...fresh.assumed!])],
  };
  const assumed = next.assumed!;
  if (facts.friendship === undefined) {
    const value = (captureDefaults.friendship as Record<string, number>)[
      String(facts.species)
    ];
    if (value !== undefined) {
      next.friendship = value;
      assumed.push("friendship");
    }
  }
  if (facts.heldItem === undefined) {
    next.heldItem = 0;
    assumed.push("heldItem");
  }
  next.pp = Array.from({ length: 4 }, (_, i) => {
    if (facts.pp?.[i] != null && !facts.assumed?.includes(`pp_${i}`))
      return facts.pp[i];
    const move = facts.moves?.[i];
    const pp =
      move === undefined || move === null
        ? undefined
        : (captureDefaults.pp as Record<string, number>)[move];
    if (pp !== undefined && !assumed.includes(`pp_${i}`))
      assumed.push(`pp_${i}`);
    return pp ?? null;
  });
  return refreshCaptureDefaults(next, "isEgg");
}
export function moveMaxPp(
  move: number | undefined,
  ups = 0,
): number | undefined {
  return maxPp(move, ups);
}
export function refreshCaptureDefaults(
  facts: KnownFacts,
  edited: string,
): KnownFacts {
  const next = structuredClone(facts),
    assumed = new Set(next.assumed);
  if (
    (edited === "species" || edited === "language") &&
    (next.nickname === undefined || assumed.has("nickname"))
  ) {
    const nickname =
      next.language === undefined || next.language === 2
        ? speciesNickname(next.species)
        : undefined;
    if (nickname) {
      next.nickname = nickname;
      assumed.add("nickname");
    } else {
      delete next.nickname;
      assumed.delete("nickname");
    }
  }
  if (
    edited === "isEgg" &&
    assumed.has("headerFlags") &&
    next.isEgg !== undefined
  )
    next.headerFlags = ((next.headerFlags ?? 2) & ~4) | (next.isEgg << 2);
  if (
    edited === "species" &&
    (assumed.has("friendship") ||
      (next.friendship === undefined &&
        facts.assumed?.some((key) => key.startsWith("ev_"))))
  ) {
    const friendship = (captureDefaults.friendship as Record<string, number>)[
      String(facts.species)
    ];
    if (friendship === undefined) {
      delete next.friendship;
      assumed.delete("friendship");
    } else {
      next.friendship = friendship;
      assumed.add("friendship");
    }
  }
  for (let i = 0; i < 4; i++)
    if (
      (edited === `move_${i}` || edited === "ppBonuses") &&
      (assumed.has(`pp_${i}`) || next.pp?.[i] == null)
    ) {
      const pp = moveMaxPp(
        next.moves?.[i] ?? undefined,
        ((next.ppBonuses ?? 0) >>> (i * 2)) & 3,
      );
      next.pp ??= Array(4).fill(null);
      next.pp[i] = pp ?? null;
      if (pp === undefined) assumed.delete(`pp_${i}`);
      else assumed.add(`pp_${i}`);
    }
  if (/^pp_[0-3]$/.test(edited) && assumed.has("ppBonuses")) {
    const i = Number(edited.at(-1));
    const stages = ppUpStages(next.moves?.[i] ?? undefined, next.pp?.[i]);
    if (
      stages.length &&
      !stages.includes(((next.ppBonuses ?? 0) >>> (i * 2)) & 3)
    ) {
      delete next.ppBonuses;
      assumed.delete("ppBonuses");
    }
  }
  if (
    /^pp_[0-3]$/.test(edited) &&
    next.ppBonuses !== undefined &&
    !assumed.has("ppBonuses")
  ) {
    const i = Number(edited.at(-1)),
      move = next.moves?.[i] ?? undefined,
      stages = ppUpStages(move, next.pp?.[i]);
    if (stages.length === 1)
      next.ppBonuses = ppUpChange(move, i, stages[0], next.ppBonuses).ppBonuses;
  }
  next.assumed = [...assumed];
  return next;
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
    if (key === "otName" || key === "nickname") {
      if (value !== "") next[key] = value;
      continue;
    }
    if (!value.trim() || /^(ev|iv|contest|move|pp)_/.test(key)) continue;
    if (key === "shiny") {
      if (value !== "true" && value !== "false")
        throw Error("Invalid shiny status");
      next.shiny = value === "true";
      continue;
    }
    next[key] =
      key === "gender" || key === "otGender" || key === "notes"
        ? value
        : number(value);
  }
  for (const [key, prefix] of Object.entries(FACT_ARRAYS)) {
    const values = Array.from(
      { length: key === "moves" || key === "pp" ? 4 : 6 },
      (_, i) =>
        draft[`${prefix}_${i}`]?.trim()
          ? number(draft[`${prefix}_${i}`])
          : null,
    );
    if (values.some((v) => v !== null)) next[key] = values;
  }
  if (assumed.length)
    next.assumed = assumed.filter((key) => !!draft[key]?.trim());
  return validateFacts(next);
}
