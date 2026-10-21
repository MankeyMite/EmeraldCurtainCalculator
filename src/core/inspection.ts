import { SUBSTRUCT_POSITIONS } from "./pokemon";

type Field = [start: number, size: number, name: string];
const header: Field[] = [
  [0, 4, "PID / personality"],
  [4, 2, "Original trainer ID (TID)"],
  [6, 2, "Secret trainer ID (SID)"],
  [8, 10, "Nickname"],
  [18, 1, "Language"],
  [19, 1, "Egg / species flags"],
  [20, 7, "Original trainer name"],
  [27, 1, "Markings"],
  [28, 2, "Checksum"],
  [30, 2, "Padding / unknown"],
];
export const BLOCK_NAMES = [
  "Growth",
  "Attacks",
  "EVs / condition",
  "Miscellaneous",
];
export const BLOCK_CODES = ["G", "A", "E", "M"];

/** Physical storage order. Name a position only if every remaining order
 * assigns it the same logical block. An empty model establishes no names. */
export function blockOrder(orders: number[]): (number | null)[] {
  return Array.from({ length: 4 }, (_, physical) => {
    const logical = orders.map((order) =>
      SUBSTRUCT_POSITIONS[order].indexOf(physical),
    );
    return logical.length && logical.every((n) => n === logical[0])
      ? logical[0]
      : null;
  });
}
const secure: Field[][] = [
  [
    [0, 2, "Species"],
    [2, 2, "Held item"],
    [4, 4, "Experience"],
    [8, 1, "PP bonuses"],
    [9, 1, "Friendship"],
    [10, 2, "Padding"],
  ],
  [
    ...Array.from({ length: 4 }, (_, i): Field => [i * 2, 2, `Move ${i + 1}`]),
    ...Array.from({ length: 4 }, (_, i): Field => [
      8 + i,
      1,
      `Move ${i + 1} PP`,
    ]),
  ],
  [
    "HP EV",
    "Attack EV",
    "Defense EV",
    "Speed EV",
    "Special Attack EV",
    "Special Defense EV",
    "Cool condition",
    "Beauty condition",
    "Cute condition",
    "Smart condition",
    "Tough condition",
    "Sheen",
  ].map((name, i): Field => [i, 1, name]),
  [
    [0, 1, "Pokérus"],
    [1, 1, "Met location"],
    [2, 2, "Origins: met level, game, ball, OT gender"],
    [4, 4, "IVs, egg and ability flags"],
    [8, 4, "Ribbons and encounter flags"],
  ],
];

// Preserve the exact-PID interface used by record inspection and legacy views.
export function describeByte(offset: number, pid?: number) {
  if (
    pid !== undefined &&
    (!Number.isInteger(pid) || pid < 0 || pid > 0xffffffff)
  )
    throw Error("Invalid PID");
  return describeByteWithOrders(offset, pid === undefined ? [] : [pid % 24]);
}

// The full PID is unnecessary: agreement on this physical block is sufficient.
export function describeByteWithOrders(offset: number, orders: number[]) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= 80)
    throw Error("Record byte out of range");
  const encrypted = offset >= 32;
  const logical = encrypted
    ? blockOrder(orders)[Math.floor((offset - 32) / 12)]
    : null;
  if (encrypted && logical === null)
    return {
      name: "Encrypted data",
      block: `Physical block ${Math.floor((offset - 32) / 12) + 1}`,
      encrypted,
      byteInField: (offset - 32) % 12,
      fieldSize: 12,
      detail:
        "The remaining permutations do not establish this block's field yet.",
    };
  const local = encrypted ? (offset - 32) % 12 : offset;
  const [start, size, name] = (encrypted ? secure[logical!] : header).find(
    ([start, size]) => local >= start && local < start + size,
  )!;
  return {
    name,
    block: encrypted ? BLOCK_NAMES[logical!] : "Unencrypted header",
    encrypted,
    byteInField: local - start,
    fieldSize: size,
    detail: encrypted
      ? "This pixel constrains ciphertext; it does not directly reveal the decrypted field value."
      : "This field is stored without XOR encryption.",
  };
}
