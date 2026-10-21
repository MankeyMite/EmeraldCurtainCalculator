import {
  checksumDifference,
  checksumValues,
  checksumMasks,
  mod16,
} from "./checksum";
import type { Snapshot } from "./investigation";

/** Propagate linked modular sums before a concrete key is known. Plaintext
 * digit domains are an outer approximation, so this can reject contradictions
 * but never chooses a baseline checksum or removes a real identity. */
export function constrainLinkedChecksums(
  snapshots: Snapshot[],
  headers: number[][],
  plains: number[][],
): boolean {
  const links = snapshots.flatMap((target, j) => {
    const i = snapshots.findIndex((s) => s.id === target.itemTest?.sourceId);
    if (i < 0) return [];
    const delta = experimentChecksumDelta(snapshots[i], target);
    return delta === null ? [] : [{ i, j, delta }];
  });
  const done = new Set<number>();
  for (const edge of links) {
    if (done.has(edge.i)) continue;
    const offsets = new Map<number, number>([[edge.i, 0]]),
      queue = [edge.i];
    for (const i of queue)
      for (const link of links) {
        const j = link.i === i ? link.j : link.j === i ? link.i : -1;
        if (j < 0) continue;
        const offset = mod16(
          offsets.get(i)! + (link.i === i ? link.delta : -link.delta),
        );
        if (offsets.has(j)) {
          if (offsets.get(j) !== offset) return false;
        } else {
          offsets.set(j, offset);
          queue.push(j);
        }
      }
    const supports = queue.map((i) => {
      const values = checksumValues(plains[i], headers[i].slice(56, 60));
      const membership = new Uint8Array(65536);
      values.forEach((v) => (membership[v] = 1));
      return { i, values, membership, offset: offsets.get(i)! };
    });
    const smallest = supports.reduce((a, b) =>
      a.values.length <= b.values.length ? a : b,
    );
    const roots = smallest.values
      .map((v) => mod16(v - smallest.offset))
      .filter((root) =>
        supports.every((s) => s.membership[mod16(root + s.offset)]),
      );
    if (!roots.length) return false;
    for (const s of supports) {
      const masks = checksumMasks(roots.map((root) => mod16(root + s.offset)));
      masks.forEach((m, n) => (headers[s.i][56 + n] &= m));
      done.add(s.i);
    }
  }
  return true;
}

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
  } else if (kind === "candy" || kind === "learn") {
    changed =
      kind === "candy" ? Array.from({ length: 8 }, (_, i) => 8 + i) : [];
    // Learning, followed by a legal rearrangement, changes complete move
    // words, the corresponding PP bytes and possibly packed PP Up counters.
    for (let i = 0; i < 4; i++) {
      if (source.knownFacts.moves?.[i] !== target.knownFacts.moves?.[i])
        changed.push(...Array.from({ length: 4 }, (_, n) => 24 + i * 4 + n));
      if (source.knownFacts.pp?.[i] !== target.knownFacts.pp?.[i])
        changed.push(40 + i * 2, 41 + i * 2);
    }
    if (
      /-swap-[0-3]-[0-3]$/.test(test.actionId ?? "") &&
      (source.knownFacts.ppBonuses === undefined ||
        target.knownFacts.ppBonuses === undefined)
    )
      return null;
    if (source.knownFacts.ppBonuses !== target.knownFacts.ppBonuses)
      changed.push(16, 17);
  } else if (kind === "pokeblock")
    changed = Array.from({ length: 12 }, (_, i) => 60 + i);
  else if (kind === "pp") {
    const id = /^pp-(up|max)-([0-3])$/.exec(test.actionId ?? "");
    if (!id) return null;
    changed = [16, 17, 40 + Number(id[2]) * 2, 41 + Number(id[2]) * 2];
    for (let i = 0; i < 4; i++)
      if (
        i !== Number(id[2]) &&
        source.knownFacts.pp?.[i] !== target.knownFacts.pp?.[i]
      )
        return null;
  } else {
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
    kind === "pp" ||
    kind === "learn" ||
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
          ? ["experience", "moves", "pp", "ppBonuses"]
          : kind === "learn"
            ? ["moves", "pp", "ppBonuses"]
            : kind === "pokeblock"
              ? ["contest"]
              : kind === "pp"
                ? ["ppBonuses", "pp"]
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
