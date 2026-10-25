import type { BattleEntry, StarterGuideState } from "./starterGuide";
import type { KnownFacts } from "./constraints";
import learnsets from "../data/level-up-learnsets.json";
import baseExperience from "../data/starter-base-experience.json";
import { levelExperience } from "./controlledExperiments";
import { moveLearningActions, moveName } from "./moveLearningExperiments";
import { newSnapshot } from "./investigation";
import { maxPp } from "./pp";

export type JourneyStep = { text: string; battles: BattleEntry[] };
export function starterJourney(species: number): JourneyStep[] {
  const rival = species === 280 ? 283 : species === 283 ? 277 : 280;
  const entry = (
    id: string,
    species: number,
    level: number,
    count = 1,
  ): BattleEntry => ({
    id: `journey-${id}`,
    species,
    level,
    count,
    trainer: true,
    multiplier: 1,
  });
  return [
    {
      text: `Defeat the Route 103 rival's level-5 ${rival === 277 ? "Treecko (+1 Speed EV)" : rival === 280 ? "Torchic (+1 Sp. Attack EV)" : "Mudkip (+1 Attack EV)"} using only your starter.`,
      battles: [entry("rival", rival, 5)],
    },
    {
      text: "Defeat Youngster Calvin's level-5 Poochyena on Route 102 using only your starter (+1 Attack EV).",
      battles: [entry("calvin", 286, 5)],
    },
    {
      text: "Defeat the Aqua Grunt's level-9 Poochyena in Petalburg Woods using only your starter (+1 Attack EV).",
      battles: [entry("aqua", 286, 9)],
    },
    {
      text: "For this beginner route, fight Bug Catcher James in Petalburg Woods: two level-6 Nincada, using only your starter (+2 Defense EVs). He can be avoided, but this plan does not depend on slipping past him.",
      battles: [entry("james", 301, 6, 2)],
    },
  ];
}
export function projectStarterJourney(state: StarterGuideState) {
  const steps = state.routeDone
    ? []
    : starterJourney(state.species).filter(
        (step) =>
          !step.battles.every((b) =>
            state.battles.some((actual) => actual.id === b.id),
          ),
      );
  return {
    steps,
    battles: [...state.battles, ...steps.flatMap((step) => step.battles)],
  };
}

/** Emerald floors base yield * level / 7 before the trainer multiplier.
 * This forecast assumes a non-traded starter is the sole EXP recipient.
 * Untagged/manual battles keep EXP unknown rather than guessing their levels. */
export function starterBattleExperience(battles: BattleEntry[]) {
  let experience = levelExperience(277, 5);
  for (const b of battles) {
    const level =
      b.level ?? (b.id === "birch" && b.species === 288 ? 2 : undefined);
    const yieldExp = (baseExperience as Record<number, number>)[b.species];
    if (
      level === undefined ||
      yieldExp === undefined ||
      (b.id !== "birch" && b.trainer === undefined)
    )
      return undefined;
    const gain = Math.floor((yieldExp * level) / 7);
    experience += b.count * (b.trainer ? Math.floor(gain * 1.5) : gain);
  }
  return experience;
}
export function starterLevelAt(species: number, experience: number) {
  let level = 5;
  while (level < 100 && levelExperience(species, level + 1) <= experience)
    level++;
  return level;
}
export function restoredMoveFacts(moves: (number | null)[]): KnownFacts {
  return {
    moves,
    pp: moves.map((m) =>
      m === null ? null : m === 0 ? 0 : (maxPp(m, 0) ?? null),
    ),
    ppBonuses: 0,
  };
}
export type JourneyMoveOption = {
  facts: KnownFacts;
  instructions: string[];
  steps: JourneyStep[];
  consumedItems: number[];
  seconds: number;
};

/** A bounded early-route comparison, using the existing Emerald learnset and
 * machine compatibility. Level-up routes prescribe exact level-5 opponents,
 * so their HP EVs are known and Defense/Speed EVs are preserved. */
export function starterJourneyMoves(
  state: StarterGuideState,
  battles: BattleEntry[],
): JourneyMoveOption[] {
  const base: JourneyMoveOption = {
    facts: restoredMoveFacts(state.moves),
    instructions: [],
    steps: [],
    consumedItems: [],
    seconds: 0,
  };
  if (state.routeDone || state.moves.some((m) => m === null)) return [base];
  const experience = starterBattleExperience(battles);
  const currentExperience = starterBattleExperience(state.battles);
  const lastReading = state.readings.at(-1)?.summary.level;
  const currentLevel =
    currentExperience === undefined
      ? (lastReading ?? 5)
      : starterLevelAt(state.species, currentExperience);
  const natural = (level: number) => {
    const moves = state.moves.slice();
    const added: number[] = [];
    for (const [learnLevel, move] of (learnsets as Record<number, number[][]>)[
      state.species
    ] ?? []) {
      if (
        learnLevel <= Math.max(lastReading ?? 5, currentLevel) ||
        learnLevel > level ||
        moves.includes(move)
      )
        continue;
      const slot = moves.indexOf(0);
      if (slot < 0) break;
      moves[slot] = move;
      added.push(move);
    }
    return { moves, added };
  };
  const options = [base];
  if (experience !== undefined && lastReading === 5 && state.evsKnown) {
    const level = starterLevelAt(state.species, experience);
    const { moves, added } = natural(level);
    if (added.length)
      options.push({
        ...base,
        facts: restoredMoveFacts(moves),
        instructions: [
          `Keep ${added.map(moveName).join(" and ")} when learned during the listed battles.`,
        ],
      });
    const targets = [
      ...new Set(
        ((learnsets as Record<number, number[][]>)[state.species] ?? [])
          .filter(([learnLevel]) => learnLevel > level && learnLevel <= 11)
          .map(([learnLevel]) => learnLevel),
      ),
    ];
    for (const target of targets) {
      const learned = natural(target);
      if (
        !learned.added.some((move) =>
          (learnsets as Record<number, number[][]>)[state.species].some(
            ([level, candidate]) => level === target && candidate === move,
          ),
        )
      )
        continue;
      for (const [species, name, yieldExp] of [
        [290, "Wurmple", 54],
        [306, "Shroomish", 65],
      ] as const) {
        const gain = Math.floor((yieldExp * 5) / 7);
        const count = Math.ceil(
          (levelExperience(state.species, target) - experience) / gain,
        );
        if (count < 1 || count > 12) continue;
        const text = `After the listed trainer battles, defeat exactly ${count} level-5 ${name} in Petalburg Woods with only the starter, to reach level ${target} and learn ${learned.added.map(moveName).join(" and ")}. Each gives 1 HP EV and no Defense or Speed EVs. Run from other species and levels.`;
        const step: JourneyStep = {
          text,
          battles: [
            {
              id: `journey-level-${target}-${species}`,
              species,
              level: 5,
              trainer: false,
              count,
              multiplier: 1,
            },
          ],
        };
        options.push({
          ...base,
          facts: restoredMoveFacts(learned.moves),
          instructions: [text],
          steps: [step],
          seconds: count * 60,
        });
      }
    }
  }
  // Teaching fills an empty slot. No replacement of an HM or arbitrary move
  // is assumed; all occupied slots can subsequently be rearranged.
  for (const option of options.slice()) {
    const source = newSnapshot("route-teach", "Route move", option.facts);
    for (const action of moveLearningActions(source, state.species)) {
      if (!["teach-15", "teach-331"].includes(action.id)) continue;
      const tm = action.id === "teach-331";
      if (tm && state.usedTms?.includes(297)) continue;
      options.push({
        ...option,
        facts: action.changes,
        consumedItems: tm ? [297] : [],
        instructions: [
          ...option.instructions,
          tm
            ? "Get TM09 Bullet Seed from the boy south of the Route 104 Flower Shop and teach it into the first empty move slot. This uses the TM."
            : "Get HM01 Cut from Cutter's House in Rustboro and teach it into the first empty move slot. No badge is needed to learn it; do not use it on field trees.",
        ],
        seconds: option.seconds + (tm ? 60 : 45),
      });
    }
  }
  return options;
}
