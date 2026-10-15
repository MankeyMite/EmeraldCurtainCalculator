import { parseRecord } from "./pokemon";
export type Slot = 4 | 5 | 6;
export type Records = Partial<Record<Slot, Uint8Array>>;
export type Memory = (number | null)[];
export const PROFILE = {
  // Legacy observation format ID retained: canonical nibble mapping unchanged.
  id: "pret-school-v1-zero-aslr",
  // Historical zero-relocation live-storage addresses, not upload provenance.
  start: 0x0202dae4,
  end: 0x0202db43,
  vramStart: 0x060062e0,
  vramEnd: 0x0600633f,
  capturedHeapStart: 0x02008f90,
  storageBase: 0x02029808,
  box: 8,
} as const;
export function storageOffset(box: number, slot: number): number {
  if (
    !Number.isInteger(box) ||
    box < 1 ||
    box > 14 ||
    !Number.isInteger(slot) ||
    slot < 1 ||
    slot > 30
  )
    throw Error("Box or slot out of range");
  return 4 + ((box - 1) * 30 + slot - 1) * 80;
}
export function sourceAt(memoryByte: number): { slot: Slot; offset: number } {
  if (!Number.isInteger(memoryByte) || memoryByte < 0 || memoryByte >= 96)
    throw Error("Memory byte out of range");
  return memoryByte < 8
    ? { slot: 4, offset: 72 + memoryByte }
    : memoryByte < 88
      ? { slot: 5, offset: memoryByte - 8 }
      : { slot: 6, offset: memoryByte - 88 };
}
export function assembleMemory(records: Records): Memory {
  for (const b of Object.values(records)) if (b) parseRecord(b);
  return Array.from({ length: 96 }, (_, i) => {
    const s = sourceAt(i);
    return records[s.slot]?.[s.offset] ?? null;
  });
}
