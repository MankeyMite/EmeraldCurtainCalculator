import growthRates from "../data/growth-rates.json";
import {
  levelMoves,
  moveMaxPp,
  pokeblockConditions,
} from "./consumableEffects";
import { allowedValues, type KnownFacts } from "./constraints";
import { knownPlaintext } from "./inference";
import type { Snapshot } from "./investigation";
import { newSnapshot } from "./investigation";
import { isRecorded } from "./itemTests";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import type { Hypothesis } from "./sid";
import { compileChecksumSupport } from "./sid";
import { rankCombinedPixels } from "./checksum";
import { experimentChecksumDelta } from "./checksumExperiments";
import { isActiveAssumption } from "./session";
import {
  moveLearningActions,
  learningSwapVariants,
  swapMoveFacts,
  moveName,
} from "./moveLearningExperiments";

export type ActionDescription = {
  kind: "moves" | "candy" | "vitamin" | "pokeblock" | "pp" | "learn";
  name: string;
  instructions: string;
  restore: string;
};
// Older investigations retain generated instructions in their action metadata.
// Refresh the obsolete PP warning for display without rewriting saved evidence.
export function displayActionInstructions(action: ActionDescription): string {
  return action.instructions.replace(
    "Do not use either move or change anything else.",
    "Keep other data unchanged.",
  );
}
export type ControlledAction = ActionDescription & {
  id: string;
  changes: KnownFacts;
  logical: number[];
  level?: number;
  cost?: number; // Practical steps, used only after information ties.
};
const digits = (byte: number, length: number) =>
  Array.from({ length: length * 2 }, (_, n) => byte * 2 + n);
const reload =
  "Reload the save made before this test to restore the original Pokémon, then start the next test. Do not save over that baseline.";

// Integer arithmetic mirrors the macros in pret's experience_tables.h.
export function levelExperience(species: number, level: number): number {
  if (!Number.isInteger(level) || level < 2 || level > 100)
    throw Error("EXP checkpoints require a next level of 2–100");
  const n = level,
    cube = n ** 3,
    floor = Math.floor;
  switch ((growthRates as Record<string, string>)[species]) {
    case "fast":
      return floor((4 * cube) / 5);
    case "slow":
      return floor((5 * cube) / 4);
    case "medium fast":
      return cube;
    case "medium slow":
      return floor((6 * cube) / 5) - 15 * n * n + 100 * n - 140;
    case "erratic":
      return n <= 50
        ? floor(((100 - n) * cube) / 50)
        : n <= 68
          ? floor(((150 - n) * cube) / 100)
          : n <= 98
            ? floor((floor((1911 - 10 * n) / 3) * cube) / 500)
            : floor(((160 - n) * cube) / 100);
    case "fluctuating":
      return n <= 15
        ? floor(((floor((n + 1) / 3) + 24) * cube) / 50)
        : n <= 36
          ? floor(((n + 14) * cube) / 50)
          : floor(((floor(n / 2) + 32) * cube) / 50);
    default:
      throw Error("Unknown species growth rate");
  }
}
export function controlledActions(
  source: Snapshot,
  species?: number,
  identity: KnownFacts = {},
): ControlledAction[] {
  const f = source.knownFacts,
    actions: ControlledAction[] = [];
  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++) {
      if (!f.moves?.[a] || !f.moves[b] || f.moves[a] === f.moves[b]) continue;
      actions.push({
        id: `moves-${a}-${b}`,
        kind: "moves",
        name: `Swap moves ${a + 1} and ${b + 1}`,
        instructions: `While boxed, open the PC summary and swap move slots ${a + 1} and ${b + 1}. Keep other data unchanged. Current PP and PP Ups follow their moves.`,
        restore: `Swap moves ${a + 1} and ${b + 1} back before starting the next test. Restore the original held item too.`,
        changes: swapMoveFacts(f, a, b),
        logical: [
          ...digits(12 + a * 2, 2),
          ...digits(12 + b * 2, 2),
          ...digits(20 + a, 1),
          ...digits(20 + b, 1),
          ...digits(8, 1),
        ],
      });
    }
  const level = source.summaryStats?.level;
  const nextMoves =
    species === undefined || level === undefined
      ? undefined
      : levelMoves(species, level + 1);
  if (
    species !== undefined &&
    (growthRates as Record<string, string>)[species] &&
    level !== undefined &&
    level < 100 &&
    f.moves?.length === 4 &&
    f.moves.every((move) => move !== null) &&
    nextMoves !== undefined
  ) {
    const levels = [level + 1];
    // Look ahead to the next automatic fill, rather than stopping at an
    // uninformative single Candy. This visits learnset levels, not identities.
    if (
      f.moves.includes(0) &&
      !nextMoves.some((move) => !f.moves!.includes(move))
    )
      for (let at = level + 2; at <= 100; at++) {
        if (levelMoves(species, at)?.some((move) => !f.moves!.includes(move))) {
          levels.push(at);
          break;
        }
      }
    for (const targetLevel of levels) {
      const experience = levelExperience(species, targetLevel);
      const moves: (number | null)[] = f.moves!.slice(),
        pp = f.pp?.slice() ?? Array(4).fill(null);
      const learned: number[] = [],
        logical = digits(4, 4);
      for (let at = level + 1; at <= targetLevel; at++)
        for (const move of levelMoves(species, at)!) {
          if (moves.includes(move)) continue;
          const slot = moves.indexOf(0);
          if (slot < 0) continue; // A full set can decline the move.
          moves[slot] = move;
          pp[slot] =
            f.ppBonuses === undefined
              ? null
              : (moveMaxPp(move, (f.ppBonuses >>> (slot * 2)) & 3) ?? null);
          learned.push(move);
          logical.push(...digits(12 + slot * 2, 2), ...digits(20 + slot, 1));
        }
      if (f.experience === undefined || f.experience < experience)
        actions.push(
          ...learningSwapVariants(source, {
            id:
              targetLevel === level + 1
                ? "rare-candy"
                : `rare-candy-${targetLevel}`,
            kind: "candy",
            cost: targetLevel - level,
            name: `${targetLevel - level === 1 ? "Rare Candy" : `${targetLevel - level} Rare Candies`} to level ${targetLevel}${learned.length ? `; learn ${learned.map(moveName).join(", ")}` : ""}`,
            instructions: `Save the original state first. Use ${targetLevel - level === 1 ? "one Rare Candy" : `${targetLevel - level} Rare Candies`} to reach level ${targetLevel} (${experience} EXP). ${learned.length ? `Let the game automatically learn ${learned.map(moveName).join(", ")} in empty move slots; decline further replacements.` : "Decline any offered move replacements."} Cancel evolution at every level. Return directly to the PC without walking training or battles. Friendship changes remain unknown unless already at 255.`,
            restore: reload,
            changes: {
              experience,
              ...(learned.length ? { moves, pp } : {}),
              ...(f.friendship === 255 ? { friendship: 255 } : {}),
            },
            logical,
            level: targetLevel,
          }),
        );
    }
  }
  actions.push(...moveLearningActions(source, species));
  const evs = f.evs;
  if (evs?.length === 6 && evs.every((n) => n !== null)) {
    const total = evs.reduce<number>((sum, n) => sum + n!, 0);
    ["HP Up", "Protein", "Iron", "Carbos", "Calcium", "Zinc"].forEach(
      (name, i) => {
        const delta = Math.min(10, 100 - evs[i]!, 510 - total);
        if (delta <= 0) return;
        const next = evs.slice();
        next[i] = next[i]! + delta;
        actions.push({
          id: `vitamin-${i}`,
          kind: "vitamin",
          name: `${name}: +${delta} ${["HP", "Attack", "Defense", "Speed", "Sp. Atk", "Sp. Def"][i]} EVs`,
          instructions: `Save the original state first. Use one ${name}; the entered EVs predict ${evs[i]} → ${next[i]}. Do not battle or alter other data. Cancel if the game refuses the vitamin.`,
          restore: reload,
          changes: { evs: next },
          logical: digits(24 + i, 1),
        });
      },
    );
  }
  if (f.ppBonuses !== undefined)
    for (let slot = 0; slot < 4; slot++) {
      const move = f.moves?.[slot],
        stage = (f.ppBonuses >>> (slot * 2)) & 3;
      if (!move || stage === 3 || (moveMaxPp(move, stage) ?? 0) <= 4) continue;
      for (const max of [false, true]) {
        const next = max ? 3 : stage + 1,
          pp = f.pp?.slice() ?? Array(4).fill(null);
        pp[slot] = moveMaxPp(move, next)!;
        actions.push({
          id: `pp-${max ? "max" : "up"}-${slot}`,
          kind: "pp",
          name: `${max ? "PP Max" : "PP Up"} on move ${slot + 1}`,
          instructions: `Save first. Use one ${max ? "PP Max" : "PP Up"} on move slot ${slot + 1}, then box the Pokémon to restore PP. Its PP Up counter becomes ${next} and boxed PP becomes ${pp[slot]}. Avoid walking or other changes. Friendship changes remain unknown unless already 255.`,
          restore: reload,
          changes: {
            ppBonuses:
              (f.ppBonuses & ~(3 << (slot * 2))) | (next << (slot * 2)),
            pp,
            ...(f.friendship === 255 ? { friendship: 255 } : {}),
          },
          logical: [...digits(8, 1), ...digits(20 + slot, 1)],
        });
      }
    }
  const nature = identity.nature ?? f.nature;
  if (source.experimentPokeblock && f.contest && nature !== undefined) {
    const contest = pokeblockConditions(
      f.contest,
      source.experimentPokeblock,
      nature,
    );
    if (contest && contest.some((n, i) => n !== f.contest![i]))
      actions.push({
        id: "pokeblock",
        kind: "pokeblock",
        name: "Feed the entered Pokéblock",
        instructions: `Save first. Feed exactly one Pokéblock with spicy/dry/sweet/bitter/sour/Feel values ${source.experimentPokeblock.join("/")}. Return directly to the PC without other changes. Expected Cool/Beauty/Cute/Smart/Tough/Sheen: ${contest.join("/")}.`,
        restore: reload,
        changes: {
          contest,
          ...(f.friendship === undefined ? {} : { friendship: f.friendship }),
        },
        logical: digits(30, 6),
      });
  }
  return actions;
}
export function actionPixels(
  source: Snapshot,
  action: ControlledAction,
  h: Hypothesis,
) {
  const plain = knownPlaintext({ ...source.knownFacts, ...action.changes });
  return action.logical
    .flatMap((logical) => {
      const values = allowedValues(plain[logical]);
      if (values.length !== 1) return [];
      const physical =
        SUBSTRUCT_POSITIONS[h.pid % 24][Math.floor(logical / 24)] * 24 +
        (logical % 24);
      return [
        {
          index: 16 + 64 + physical,
          value:
            (values[0] ^ ((h.key >>> ((physical % 8) * 4)) & 15)) === 0 ? 0 : 1,
        },
      ];
    })
    .sort((a, b) => a.index - b.index);
}
export function rankControlledExperiments(
  source: Snapshot,
  species: number | undefined,
  candidates: Hypothesis[],
  identity: KnownFacts = {},
  snapshots: Snapshot[] = [source],
) {
  if (!candidates.length) return [];
  const support = compileChecksumSupport(identity, snapshots, source),
    supports = candidates.map(support);
  return controlledActions(source, species, identity)
    .flatMap((action) => {
      const plaintext = knownPlaintext({
        ...source.knownFacts,
        ...action.changes,
      });
      const templates = SUBSTRUCT_POSITIONS.map((order) =>
        action.logical
          .flatMap((logical) => {
            const values = allowedValues(plaintext[logical]);
            if (values.length !== 1) return [];
            const physical =
              order[Math.floor(logical / 24)] * 24 + (logical % 24);
            return [
              {
                index: 80 + physical,
                keyShift: (physical % 8) * 4,
                plain: values[0],
              },
            ];
          })
          .sort((a, b) => a.index - b.index),
      );
      const reference = actionPixels(source, action, candidates[0]);
      if (!reference.length) return [];
      const encrypted: { index: number; value: number }[][] = [];
      for (const h of candidates) {
        const pixels = templates[h.pid % 24].map((p) => ({
          index: p.index,
          value: (p.plain ^ ((h.key >>> p.keyShift) & 15)) === 0 ? 0 : 1,
        }));
        if (
          pixels.length !== reference.length ||
          pixels.some((p, n) => p.index !== reference[n].index)
        )
          return [];
        encrypted.push(pixels);
      }
      const target = {
        ...source,
        knownFacts: { ...source.knownFacts, ...action.changes },
        itemTest: {
          sourceId: source.id,
          phase: "question" as const,
          action,
          actionId: action.id,
        },
      };
      // Consumable side effects are unknown until independently established.
      if (action.kind !== "moves" && action.changes.friendship === undefined)
        delete target.knownFacts.friendship;
      const combined = rankCombinedPixels(
        encrypted,
        supports,
        experimentChecksumDelta(source, target),
      );
      return [
        {
          action,
          ...combined,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.worstCase - b.worstCase ||
        b.informationGain - a.informationGain ||
        (a.action.cost ?? 1) - (b.action.cost ?? 1),
    );
}
export function createControlledTest(
  source: Snapshot,
  id: string,
  action: ControlledAction,
  targets: number[],
  candidatesBefore?: number,
): Snapshot {
  if (!isRecorded(source)) throw Error("Finish the current experiment first");
  const facts = {
    ...structuredClone(source.knownFacts),
    ...structuredClone(action.changes),
  };
  if (action.kind !== "moves" && action.changes.friendship === undefined)
    delete facts.friendship;
  delete facts.checksum;
  // Derived changes still depend on the baseline assumptions. PP labels follow
  // their moves, just like their values; EV assumptions remain conditional.
  if (facts.assumed)
    facts.assumed = facts.assumed
      .filter(
        (key) =>
          key !== "checksum" &&
          (key !== "friendship" || facts.friendship !== undefined),
      )
      .map((key) => {
        const swap = /^(?:moves-(\d)-(\d))$|(?:-swap-(\d)-(\d))$/.exec(
          action.id,
        );
        if (!swap) return key;
        const a = swap[1] ?? swap[3],
          b = swap[2] ?? swap[4];
        for (const prefix of ["pp", "move"]) {
          if (key === `${prefix}_${a}`) return `${prefix}_${b}`;
          if (key === `${prefix}_${b}`) return `${prefix}_${a}`;
        }
        return key;
      })
      .filter((key) => isActiveAssumption(facts, key));
  return {
    ...newSnapshot(id, action.name, facts),
    observations: source.observations.slice(),
    targets: targets.slice(),
    ...(action.kind !== "candy" && action.kind !== "vitamin"
      ? { summaryStats: structuredClone(source.summaryStats) }
      : {
          summaryStats: {
            ...(action.level === undefined
              ? source.summaryStats?.level === undefined
                ? {}
                : { level: source.summaryStats.level }
              : { level: action.level }),
            stats: Array(6).fill(null),
          },
        }),
    notes: `${action.instructions}\n${action.restore}`,
    itemTest: {
      sourceId: source.id,
      phase: "question",
      ...(candidatesBefore === undefined ? {} : { candidatesBefore }),
      action: {
        kind: action.kind,
        name: action.name,
        instructions: action.instructions,
        restore: action.restore,
      },
      actionId: action.id,
    },
  };
}
