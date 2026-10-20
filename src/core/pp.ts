import defaults from "../data/capture-defaults.json";
export function maxPp(move: number | undefined, ups = 3): number | undefined {
  if (move === undefined) return undefined;
  const base = (defaults.pp as Record<string, number>)[move];
  return base === undefined ? undefined : base + Math.floor(base / 5) * ups;
}
/** PC storage restores PP. Match an exact maximum at each PP Up stage. */
export function ppUpStages(
  move: number | undefined,
  pp: number | null | undefined,
): number[] {
  if (pp == null || move === undefined || maxPp(move) === undefined)
    return [0, 1, 2, 3];
  return [0, 1, 2, 3].filter(
    (stage) => pp >= 0 && Number.isInteger(pp) && pp === maxPp(move, stage)!,
  );
}
export function ppInputError(move: number | undefined, text: string): string {
  if (!text.trim()) return "";
  if (!/^\d+$/.test(text))
    return "Current PP must be a nonnegative whole number.";
  const cap = maxPp(move);
  if (cap === undefined && Number(text) > 255)
    return "Current PP must fit the stored 0–255 range. Select the move to check its PP Up maximum.";
  return cap !== undefined && !ppUpStages(move, Number(text)).length
    ? `PC storage restores PP. Enter one of ${[...new Set([0, 1, 2, 3].map((n) => maxPp(move, n)))].join(", ")} PP (0–3 PP Ups); partly used PP is not a valid curtain checkpoint.`
    : "";
}
