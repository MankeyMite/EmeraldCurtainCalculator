export const RECORD_SIZE = 80;
export const hex = (n: number, width = 2) =>
  n.toString(16).toUpperCase().padStart(width, "0");
export function parseRecord(input: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length !== RECORD_SIZE)
    throw new Error(
      `Expected exactly 80 encrypted bytes; received ${bytes.length}.`,
    );
  return bytes.slice();
}
export function parseHex(input: string): Uint8Array {
  const clean = input.replace(/\s/g, "");
  if (!/^[0-9a-fA-F]*$/.test(clean))
    throw new Error(
      "Use hexadecimal digits and whitespace only (no 0x prefixes or offsets).",
    );
  if (clean.length !== 160)
    throw new Error(
      `Expected 160 hex digits (80 bytes); received ${clean.length}.`,
    );
  return Uint8Array.from(clean.match(/../g)!, (s) => parseInt(s, 16));
}
export const recordHex = (bytes: Uint8Array) =>
  Array.from(bytes, (n) => hex(n)).join(" ");
// Logical G/A/E/M substructure -> physical index, transcribed from pret GetSubstruct.
export const SUBSTRUCT_POSITIONS = [
  [0, 1, 2, 3],
  [0, 1, 3, 2],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
  [0, 2, 3, 1],
  [0, 3, 2, 1],
  [1, 0, 2, 3],
  [1, 0, 3, 2],
  [2, 0, 1, 3],
  [3, 0, 1, 2],
  [2, 0, 3, 1],
  [3, 0, 2, 1],
  [1, 2, 0, 3],
  [1, 3, 0, 2],
  [2, 1, 0, 3],
  [3, 1, 0, 2],
  [2, 3, 0, 1],
  [3, 2, 0, 1],
  [1, 2, 3, 0],
  [1, 3, 2, 0],
  [2, 1, 3, 0],
  [3, 1, 2, 0],
  [2, 3, 1, 0],
  [3, 2, 1, 0],
];
export const NATURES = [
  "Hardy",
  "Lonely",
  "Brave",
  "Adamant",
  "Naughty",
  "Bold",
  "Docile",
  "Relaxed",
  "Impish",
  "Lax",
  "Timid",
  "Hasty",
  "Serious",
  "Jolly",
  "Naive",
  "Modest",
  "Mild",
  "Quiet",
  "Bashful",
  "Rash",
  "Calm",
  "Gentle",
  "Sassy",
  "Careful",
  "Quirky",
];
export function fieldAt(offset: number, record?: Uint8Array): string {
  if (offset < 4) return "PID / personality";
  if (offset < 8) return offset < 6 ? "OT ID: public TID" : "OT ID: secret SID";
  if (offset < 0x12) return "Nickname (Gen 3 character encoding)";
  if (offset === 0x12) return "Language";
  if (offset === 0x13) return "Flags: bad egg / species / egg / Box RS";
  if (offset < 0x1b) return "OT name (Gen 3 character encoding)";
  if (offset === 0x1b) return "Markings";
  if (offset < 0x1e) return "Checksum (unencrypted)";
  if (offset < 0x20) return "Unknown / padding";
  const physical = Math.floor((offset - 32) / 12);
  const logical = record
    ? SUBSTRUCT_POSITIONS[
        new DataView(record.buffer, record.byteOffset, 80).getUint32(0, true) %
          24
      ].indexOf(physical)
    : -1;
  return `Encrypted substructure ${physical} (${logical < 0 ? "order requires PID" : ["Growth", "Attacks", "EVs / contests", "Misc / IVs"][logical]}); ciphertext, not a direct field value`;
}
export function decodePokemon(input: Uint8Array) {
  const bytes = parseRecord(input),
    view = new DataView(bytes.buffer);
  const pid = view.getUint32(0, true),
    otId = view.getUint32(4, true),
    key = (pid ^ otId) >>> 0;
  const decrypted = bytes.slice(32),
    secure = new DataView(decrypted.buffer);
  for (let i = 0; i < 48; i += 4)
    secure.setUint32(i, secure.getUint32(i, true) ^ key, true);
  let sum = 0;
  for (let i = 0; i < 48; i += 2)
    sum = (sum + secure.getUint16(i, true)) & 0xffff;
  const positions = SUBSTRUCT_POSITIONS[pid % 24],
    g = positions[0] * 12,
    a = positions[1] * 12,
    e = positions[2] * 12,
    m = positions[3] * 12;
  const iv = secure.getUint32(m + 4, true);
  return {
    pid,
    otId,
    tid: otId & 0xffff,
    sid: otId >>> 16,
    key,
    nature: pid % 25,
    checksum: view.getUint16(28, true),
    computedChecksum: sum,
    checksumValid: sum === view.getUint16(28, true),
    species: secure.getUint16(g, true),
    heldItem: secure.getUint16(g + 2, true),
    friendship: decrypted[g + 9],
    experience: secure.getUint32(g + 4, true),
    moves: Array.from({ length: 4 }, (_, i) =>
      secure.getUint16(a + i * 2, true),
    ),
    evs: Array.from(decrypted.slice(e, e + 6)),
    contest: Array.from(decrypted.slice(e + 6, e + 12)),
    pokerus: decrypted[m],
    markings: bytes[27],
    ppBonuses: decrypted[g + 8],
    ribbons: secure.getUint32(m + 8, true) & 0x07ffffff,
    ivs: Array.from({ length: 6 }, (_, i) => (iv >>> (i * 5)) & 31),
    isEgg: !!(iv & 0x40000000),
    ability: iv >>> 31,
    otGender: decrypted[m + 3] & 0x80 ? "female" : "male",
  };
}
export function exampleRecord(
  kind: "pattern" | "pokemon" = "pokemon",
  pid = 0x12345678,
): Uint8Array {
  const b = new Uint8Array(80);
  if (kind === "pattern")
    return Uint8Array.from(
      { length: 80 },
      (_, i) => [0x00, 0xff, 0x01, 0x10, 0xa0, 0x0a][i % 6],
    );
  const v = new DataView(b.buffer);
  v.setUint32(0, pid, true);
  v.setUint32(4, 0xabcd1234, true);
  b.fill(0xff, 8, 18);
  b.set([0xbe, 0xbf, 0xc7, 0xc9], 8);
  b[18] = 2;
  b[19] = 2;
  b.fill(0xff, 20, 27);
  b.set([0xc6, 0xbb, 0xbc], 20);
  const p = SUBSTRUCT_POSITIONS[pid % 24].map((n) => 32 + n * 12);
  v.setUint16(p[0], 25, true);
  v.setUint32(p[0] + 4, 1000, true);
  b[p[0] + 9] = 70;
  v.setUint16(p[1], 33, true);
  b[p[1] + 8] = 35;
  b.set([1, 2, 3, 4, 5, 6], p[2]);
  v.setUint32(p[3] + 4, 0x1fffffff, true);
  let sum = 0;
  for (let i = 32; i < 80; i += 2) sum = (sum + v.getUint16(i, true)) & 65535;
  v.setUint16(28, sum, true);
  for (let i = 32; i < 80; i += 4)
    v.setUint32(i, v.getUint32(i, true) ^ pid ^ v.getUint32(4, true), true);
  return b; // Synthetic checksum-valid example, not a legality claim.
}
