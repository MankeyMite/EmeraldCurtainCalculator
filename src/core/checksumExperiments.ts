import { checksumDifference } from "./checksum";
import type { Snapshot } from "./investigation";

/** Recompute from current facts, never trust a stale imported numeric delta.
 * Item/move protocols require no other changes. Consumables need the resulting
 * friendship explicitly established; an unknown side effect is not held fixed. */
export function experimentChecksumDelta(
  source: Snapshot,
  target: Snapshot,
): number | null {
  const test = target.itemTest;
  if (!test || test.sourceId !== source.id) return null;
  const kind = test.action?.kind;
  let changed: number[];
  if (!kind) changed = [4, 5, 6, 7];
  else if (kind === "moves") {
    const swap = /^moves-(\d)-(\d)$/.exec(test.actionId ?? "");
    if (!swap) return null;
    const a = Number(swap[1]),
      b = Number(swap[2]);
    // Move IDs are whole words and their sum cancels even if unknown. PP in
    // slots of the same parity also cancels. Packed counters need exact values.
    changed = [16, 17];
    if (a % 2 !== b % 2)
      changed.push(40 + a * 2, 41 + a * 2, 40 + b * 2, 41 + b * 2);
    if (
      !source.knownFacts.moves ||
      !target.knownFacts.moves ||
      source.knownFacts.moves.some(
        (v, i) =>
          target.knownFacts.moves?.[i] !==
          source.knownFacts.moves?.[i === a ? b : i === b ? a : i],
      )
    )
      return null;
    for (let i = 0; i < 4; i++) {
      const previous = source.knownFacts.pp?.[i === a ? b : i === b ? a : i],
        next = target.knownFacts.pp?.[i];
      if (previous != null && next != null && previous !== next) return null;
    }
    const bonuses = source.knownFacts.ppBonuses;
    if (bonuses !== undefined) {
      const expected =
        (bonuses & ~(3 << (a * 2)) & ~(3 << (b * 2))) |
        (((bonuses >>> (a * 2)) & 3) << (b * 2)) |
        (((bonuses >>> (b * 2)) & 3) << (a * 2));
      if (target.knownFacts.ppBonuses !== expected) return null;
    }
  } else if (kind === "candy")
    changed = Array.from({ length: 8 }, (_, i) => 8 + i);
  else {
    const id = /^vitamin-([0-5])$/.exec(test.actionId ?? "");
    if (!id) return null;
    changed = [48 + Number(id[1]) * 2, 49 + Number(id[1]) * 2];
    if (
      source.knownFacts.evs?.some(
        (v, i) =>
          i !== Number(id[1]) &&
          v !== null &&
          target.knownFacts.evs?.[i] != null &&
          v !== target.knownFacts.evs[i],
      )
    )
      return null;
  }
  if (
    kind === "candy" ||
    kind === "vitamin" ||
    (target.knownFacts.friendship !== undefined &&
      target.knownFacts.friendship !== source.knownFacts.friendship)
  ) {
    if (
      source.knownFacts.friendship === undefined ||
      target.knownFacts.friendship === undefined
    )
      return null;
    changed.push(18, 19);
  }
  // An edit to another known secure field invalidates the original protocol.
  const allowed = new Set(
    !kind
      ? ["heldItem"]
      : kind === "moves"
        ? ["moves", "pp", "ppBonuses"]
        : kind === "candy"
          ? ["experience"]
          : ["evs"],
  );
  for (const [key, value] of Object.entries(target.knownFacts)) {
    if (
      ["assumed", "notes", "checksum", "friendship"].includes(key) ||
      allowed.has(key)
    )
      continue;
    const previous = source.knownFacts[key as keyof typeof source.knownFacts];
    if (JSON.stringify(previous) !== JSON.stringify(value)) return null;
  }
  return checksumDifference(source.knownFacts, target.knownFacts, changed);
}
