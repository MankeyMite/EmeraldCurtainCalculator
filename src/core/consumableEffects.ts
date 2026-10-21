import learnsets from "../data/level-up-learnsets.json";
export { maxPp as moveMaxPp } from "./pp";

// Extracted from pret/pokeemerald's level_up_learnsets and pointer tables.
export function levelMoves(
  species: number,
  level: number,
): number[] | undefined {
  return (learnsets as Record<string, number[][]>)[species]
    ?.filter(([at]) => at === level)
    .map(([, move]) => move);
}
/** Flavor order: spicy, dry, sweet, bitter, sour, then Feel.
 * Emerald modifies only the favored flavor when net gain is positive, or
 * only the disliked flavor when negative. A tie modifies neither. */
export function pokeblockConditions(
  before: (number | null)[],
  block: number[],
  nature: number,
): number[] | null {
  if (
    before.length !== 6 ||
    before.some((n) => n === null) ||
    before[5] === 255 ||
    block.length !== 6 ||
    block.some((n) => !Number.isInteger(n) || n < 0 || n > 255) ||
    !Number.isInteger(nature) ||
    nature < 0 ||
    nature > 24
  )
    return null;
  const flavors = [0, 4, 2, 1, 3]; // Attack, Defense, Speed, Sp. Attack, Sp. Defense
  const liked = flavors[Math.floor(nature / 5)],
    disliked = flavors[nature % 5];
  const direction =
    liked === disliked ? 0 : Math.sign(block[liked] - block[disliked]);
  return before.map((n, i) => {
    const relation = i === liked ? 1 : i === disliked ? -1 : 0;
    const gain =
      block[i] +
      (i < 5 && direction !== 0 && relation === direction
        ? relation * Math.floor((block[i] + 5) / 10)
        : 0);
    return Math.min(255, n! + gain);
  });
}
