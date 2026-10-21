import { applyFacts, recordMasks, type KnownFacts } from "./constraints";
import { xorMask } from "./cryptoConstraints";
import { analyzeConstraints, knownPlaintext } from "./inference";
import type { Snapshot } from "./investigation";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { isEvidence } from "./itemTests";
import { constrainLinkedChecksums } from "./checksumExperiments";

/** Shared identity header and eight repeated key digits, kept separately for
 * every order. Mutable ciphertext and checksum headers are never intersected. */
export function analyzeObservations(
  identity: KnownFacts,
  all: Snapshot[],
  active: Snapshot,
  sidMasks?: number[],
) {
  const snapshots = all.filter(isEvidence);
  const headers = snapshots.map((s) =>
    applyFacts(recordMasks(s.observations, 5), {
      ...s.knownFacts,
      ...identity,
    }),
  );
  const plains = snapshots.map((s) =>
    knownPlaintext({ ...s.knownFacts, ...identity }),
  );
  const checksumConsistent = constrainLinkedChecksums(
    snapshots,
    headers,
    plains,
  );
  const input = recordMasks(active.observations, 5);
  const activeIndex = snapshots.findIndex((s) => s.id === active.id);
  if (activeIndex >= 0)
    for (let n = 56; n < 60; n++) input[n] &= headers[activeIndex][n];
  for (let n = 0; n < 16; n++)
    for (const header of headers) input[n] &= header[n];
  sidMasks?.forEach((mask, n) => (input[12 + n] &= mask));
  const keys = SUBSTRUCT_POSITIONS.map((order) => {
    const key = Array(8).fill(65535);
    snapshots.forEach((_, index) =>
      plains[index].forEach((p, n) => {
        const physical = order[Math.floor(n / 24)] * 24 + (n % 24);
        let support = 0;
        for (let k = 0; k < 16; k++)
          if (xorMask(headers[index][64 + physical], k) & p) support |= 1 << k;
        key[physical % 8] &= support;
      }),
    );
    if (!checksumConsistent || headers.some((header) => header.some((m) => !m)))
      key.fill(0);
    return key;
  });
  const result = analyzeConstraints(
    input,
    { ...active.knownFacts, ...identity },
    keys,
  );
  return checksumConsistent
    ? result
    : {
        ...result,
        reason:
          "Recorded experiment checksum pixels contradict the linked modulo-65536 checksum differences.",
      };
}
