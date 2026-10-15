import fs from "node:fs";
import { createHash } from "node:crypto";
import { storageOffset } from "../src/core/memory";
import { decodePokemon } from "../src/core/pokemon";

// Read-only original English Emerald save inspection, transcribed from
// pret save.c/save.h. Full save data is never exported in the report.
const [input, candidatePath, output] = process.argv.slice(2);
if (!input || !candidatePath || !output)
  throw Error(
    "Usage: npx tsx scripts/inspect-save-reference.ts save.sav boxed.ek3 report.json",
  );
const save = fs.readFileSync(input),
  candidate = fs.readFileSync(candidatePath);
if (save.length < 0x20000 || candidate.length !== 80)
  throw Error("Expected original Emerald flash save and 80-byte candidate");
function checksum(data: Buffer, size: number) {
  let sum = 0;
  for (let i = 0; i < size; i += 4) sum = (sum + data.readUInt32LE(i)) >>> 0;
  return ((sum >>> 16) + sum) & 65535;
}
const sizes = [
  0xf2c,
  3968,
  3968,
  3968,
  0x3d88 - 3968 * 3,
  ...Array(8).fill(3968),
  0x83d0 - 3968 * 8,
];
const copies = [0, 1].map((copy) => {
  const sectors = new Map<number, { data: Buffer; counter: number }>();
  let error: string | null = null;
  for (let i = 0; i < 14; i++) {
    const data = save.subarray(
        (copy * 14 + i) * 4096,
        (copy * 14 + i + 1) * 4096,
      ),
      id = data.readUInt16LE(4084),
      counter = data.readUInt32LE(4092);
    if (
      id > 13 ||
      data.readUInt32LE(4088) !== 0x08012025 ||
      checksum(data, sizes[id]) !== data.readUInt16LE(4086) ||
      sectors.has(id)
    ) {
      error = "Invalid signature, ID, checksum or duplicate sector";
      break;
    }
    sectors.set(id, { data, counter });
  }
  const counters = new Set([...sectors.values()].map((s) => s.counter));
  if (sectors.size !== 14 || counters.size !== 1)
    error ??= "Incomplete or inconsistent save copy";
  if (error) return { copy, valid: false as const, error };
  const storage = Buffer.concat(
    Array.from({ length: 9 }, (_, i) =>
      sectors.get(i + 5)!.data.subarray(0, sizes[i + 5]),
    ),
  );
  const records = Object.fromEntries(
    [4, 5, 6].map((slot) => {
      const offset = storageOffset(8, slot);
      return [slot, storage.subarray(offset, offset + 80)];
    }),
  ) as Record<number, Buffer>;
  return {
    copy,
    valid: true as const,
    counter: [...counters][0],
    candidateMatchesSlot5: records[5].equals(candidate),
    slot5: decodePokemon(new Uint8Array(records[5])),
    slot4Empty: records[4].every((n) => n === 0),
    slot6Empty: records[6].every((n) => n === 0),
  };
});
const valid = copies.filter((c) => c.valid);
const selected =
  valid.length === 2
    ? valid[0].counter === 0xffffffff && valid[1].counter === 0
      ? valid[1]
      : valid[1].counter === 0xffffffff && valid[0].counter === 0
        ? valid[0]
        : valid[0].counter > valid[1].counter
          ? valid[0]
          : valid[1]
    : valid[0];
const report = {
  saveSha256: createHash("sha256").update(save).digest("hex"),
  saveBytes: save.length,
  saveFileModified: fs.statSync(input).mtime.toISOString(),
  copies,
  selectedCopy: selected?.copy ?? null,
  selectedCounter: selected?.counter ?? null,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
