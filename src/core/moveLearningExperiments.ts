import machines from "../data/machine-learnsets.json";
import names from "../data/named-facts.json";
import { maxPp } from "./pp";
import type { KnownFacts } from "./constraints";
import type { Snapshot } from "./investigation";
import type { ControlledAction } from "./controlledExperiments";

const moveNames = new Map(names.moves.map((m) => [m.id, m.name]));
export const moveName = (id: number) => moveNames.get(id) ?? `move ${id}`;
const digits = (byte: number, length: number) =>
  Array.from({ length: length * 2 }, (_, n) => byte * 2 + n);

export function swapMoveFacts(f: KnownFacts, a: number, b: number): KnownFacts {
  const moves = f.moves!.slice(),
    pp = f.pp?.slice();
  [moves[a], moves[b]] = [moves[b], moves[a]];
  if (pp) [pp[a], pp[b]] = [pp[b], pp[a]];
  let bonuses = f.ppBonuses;
  if (bonuses !== undefined)
    bonuses =
      (bonuses & ~(3 << (a * 2)) & ~(3 << (b * 2))) |
      (((f.ppBonuses! >>> (a * 2)) & 3) << (b * 2)) |
      (((f.ppBonuses! >>> (b * 2)) & 3) << (a * 2));
  return {
    moves,
    ...(pp ? { pp } : {}),
    ...(bonuses === undefined ? {} : { ppBonuses: bonuses }),
  };
}

/** One legal swap after filling an empty slot. Empty slots cannot themselves
 * be selected for rearrangement in Emerald's summary screen. */
export function learningSwapVariants(
  source: Snapshot,
  action: ControlledAction,
): ControlledAction[] {
  const result = [action],
    after = { ...source.knownFacts, ...action.changes };
  for (let filled = 0; filled < 4; filled++) {
    if (source.knownFacts.moves?.[filled] !== 0 || !after.moves?.[filled])
      continue;
    for (let other = 0; other < 4; other++) {
      if (!source.knownFacts.moves?.[other]) continue;
      result.push({
        ...action,
        id: `${action.id}-swap-${filled}-${other}`,
        name: `${action.name}; swap slots ${filled + 1} and ${other + 1}`,
        instructions: `${action.instructions} Then, while boxed, swap move slots ${filled + 1} and ${other + 1} in the PC summary. PP and PP Ups follow their moves.`,
        changes: { ...action.changes, ...swapMoveFacts(after, filled, other) },
        logical: [
          ...new Set([
            ...action.logical,
            ...digits(8, 1),
            ...digits(12 + filled * 2, 2),
            ...digits(12 + other * 2, 2),
            ...digits(20 + filled, 1),
            ...digits(20 + other, 1),
          ]),
        ],
        cost: (action.cost ?? 1) + 1,
      });
    }
  }
  return result;
}

/** Compatibility comes from Emerald's TM/HM bitfields. No arbitrary filler
 * move or PP stage is assumed; unknown empty-slot counters leave PP unknown. */
export function moveLearningActions(
  source: Snapshot,
  species?: number,
): ControlledAction[] {
  const f = source.knownFacts;
  if (
    species === undefined ||
    f.moves?.length !== 4 ||
    f.moves.some((m) => m === null)
  )
    return [];
  const slot = f.moves.indexOf(0);
  if (slot < 0) return [];
  const compatible =
    (machines.compatibility as Record<string, number[]>)[species] ?? [];
  return machines.machines.flatMap(({ move, machine }) => {
    if (!compatible.includes(move) || f.moves!.includes(move)) return [];
    const moves = f.moves!.slice(),
      pp = f.pp?.slice() ?? Array<number | null>(4).fill(null);
    moves[slot] = move;
    pp[slot] =
      f.ppBonuses === undefined
        ? null
        : (maxPp(move, (f.ppBonuses >>> (slot * 2)) & 3) ?? null);
    const action: ControlledAction = {
      id: `teach-${move}`,
      kind: "learn",
      cost: machine.startsWith("HM") ? 1 : 2,
      name: `Teach ${moveName(move)} (${machine}) into slot ${slot + 1}`,
      instructions: `Save the original state first. Use ${machine} to teach ${moveName(move)}; let it fill empty slot ${slot + 1}. Box the Pokémon to restore PP. Avoid walking training, battles or other changes. Friendship changes remain unknown unless already 255.`,
      restore:
        "Reload the save made before this test to restore the original Pokémon and any consumed TM. Do not save over that baseline.",
      changes: {
        moves,
        pp,
        ...(f.friendship === 255 ? { friendship: 255 } : {}),
      },
      logical: [...digits(12 + slot * 2, 2), ...digits(20 + slot, 1)],
    };
    return learningSwapVariants(source, action);
  });
}
