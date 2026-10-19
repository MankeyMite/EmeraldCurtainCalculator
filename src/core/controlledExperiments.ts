import growthRates from "../data/growth-rates.json";
import { allowedValues, type KnownFacts } from "./constraints";
import { knownPlaintext } from "./inference";
import type { Snapshot } from "./investigation";
import { newSnapshot } from "./investigation";
import { isRecorded } from "./itemTests";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import type { Hypothesis } from "./sid";

export type ActionDescription = {
  kind: "moves" | "candy" | "vitamin";
  name: string;
  instructions: string;
  restore: string;
};
export type ControlledAction = ActionDescription & {
  id: string;
  changes: KnownFacts;
  logical: number[];
  level?: number;
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
): ControlledAction[] {
  const f = source.knownFacts,
    actions: ControlledAction[] = [];
  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++) {
      if (!f.moves?.[a] || !f.moves[b] || f.moves[a] === f.moves[b]) continue;
      const moves = f.moves.slice(),
        pp = f.pp?.slice();
      [moves[a], moves[b]] = [moves[b], moves[a]];
      if (pp) [pp[a], pp[b]] = [pp[b], pp[a]];
      let bonuses = f.ppBonuses;
      if (bonuses !== undefined) {
        const x = (bonuses >>> (a * 2)) & 3,
          y = (bonuses >>> (b * 2)) & 3;
        bonuses =
          (bonuses & ~(3 << (a * 2)) & ~(3 << (b * 2))) |
          (x << (b * 2)) |
          (y << (a * 2));
      }
      actions.push({
        id: `moves-${a}-${b}`,
        kind: "moves",
        name: `Swap moves ${a + 1} and ${b + 1}`,
        instructions: `In the summary, swap move slots ${a + 1} and ${b + 1}. Do not use either move or change anything else. Current PP and PP Ups follow their moves.`,
        restore: `Swap moves ${a + 1} and ${b + 1} back before starting the next test. Restore the original held item too.`,
        changes: {
          moves,
          ...(pp ? { pp } : {}),
          ...(bonuses === undefined ? {} : { ppBonuses: bonuses }),
        },
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
  // Empty slots can learn a move automatically, without an option to decline.
  if (
    species !== undefined &&
    (growthRates as Record<string, string>)[species] &&
    level !== undefined &&
    level < 100 &&
    f.moves?.length === 4 &&
    f.moves.every((move) => !!move)
  ) {
    const experience = levelExperience(species, level + 1);
    if (f.experience === undefined || f.experience < experience)
      actions.push({
        id: "rare-candy",
        kind: "candy",
        name: `Rare Candy to level ${level + 1}`,
        instructions: `Save the original state first. Use one Rare Candy to reach level ${level + 1} (${experience} EXP). Decline new moves and cancel evolution. No battles, walking training or other changes. If these conditions cannot be met, cancel this test.`,
        restore: reload,
        changes: { experience },
        logical: digits(4, 4),
        level: level + 1,
      });
  }
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
) {
  if (!candidates.length) return [];
  return controlledActions(source, species)
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
      const groups = new Map<string, number>();
      const seen = reference.map(() => new Set<number>());
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
        pixels.forEach((p, n) => seen[n].add(p.value));
        const key = pixels.map((p) => p.value).join("");
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      const sizes = [...groups.values()],
        total = candidates.length;
      return [
        {
          action,
          groups: groups.size,
          worstCase: Math.max(...sizes),
          expectedRemaining: sizes.reduce((sum, n) => sum + (n * n) / total, 0),
          informationGain: sizes.reduce(
            (sum, n) => sum - (n / total) * Math.log2(n / total),
            0,
          ),
          pixels: reference.filter((_, n) => seen[n].size > 1),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.worstCase - b.worstCase || b.informationGain - a.informationGain,
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
  delete facts.friendship;
  delete facts.checksum;
  // Derived changes still depend on the baseline assumptions. PP labels follow
  // their moves, just like their values; EV assumptions remain conditional.
  if (facts.assumed)
    facts.assumed = facts.assumed
      .filter((key) => !["friendship", "checksum"].includes(key))
      .map((key) => {
        const swap = /^moves-(\d)-(\d)$/.exec(action.id);
        if (!swap) return key;
        return key === `pp_${swap[1]}`
          ? `pp_${swap[2]}`
          : key === `pp_${swap[2]}`
            ? `pp_${swap[1]}`
            : key;
      });
  return {
    ...newSnapshot(id, action.name, facts),
    observations: source.observations.slice(),
    targets: targets.slice(),
    ...(action.kind === "moves"
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
    },
  };
}
