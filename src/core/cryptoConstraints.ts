import { allowedValues, summarizeField } from "./constraints";
import { SUBSTRUCT_POSITIONS } from "./pokemon";

// XOR is a bijection: a nonzero ciphertext nibble remains a 15-value
// plaintext domain, not an exact value. Never borrow a candidate's key.
export function xorMask(mask: number, keyNibble: number): number {
  let result = 0;
  for (const value of allowedValues(mask)) result |= 1 << (value ^ keyNibble);
  return result;
}
export function decryptConstraints(recordMasks: number[]) {
  if (recordMasks.length !== 160)
    throw Error("Expected 160 record nibble masks");
  if (recordMasks.some((m) => m === 0))
    return {
      available: false as const,
      reason: "Observations and supplied facts conflict.",
    };
  const pid = summarizeField(recordMasks, 0, 4).exact;
  const otId = summarizeField(recordMasks, 4, 4).exact;
  if (pid === null || otId === null)
    return {
      available: false as const,
      reason: "Requires an exact PID and full OT ID (both TID and SID).",
    };
  const key = (Number(pid) ^ Number(otId)) >>> 0;
  const physical = recordMasks
    .slice(64)
    .map((mask, n) => xorMask(mask, (key >>> ((n % 8) * 4)) & 15));
  const names = ["Growth", "Attacks", "EVs / contests", "Misc / IVs"];
  const blocks = SUBSTRUCT_POSITIONS[Number(pid) % 24].map((position, i) => ({
    name: names[i],
    position,
    ciphertextOffset: 32 + position * 12,
    masks: physical.slice(position * 24, (position + 1) * 24),
  }));
  return {
    available: true as const,
    key,
    blocks,
    exactNibbles: physical.filter((m) => allowedValues(m).length === 1).length,
  };
}
