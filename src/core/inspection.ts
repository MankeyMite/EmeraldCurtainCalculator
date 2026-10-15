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
const blocks = ["Growth", "Attacks", "EVs / condition", "Miscellaneous"];
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

// Field names follow include/pokemon.h. An encrypted field's position is
// established only when the active model (or rendered record) has an exact PID.
export function describeByte(offset: number, pid?: number) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= 80)
    throw Error("Record byte out of range");
  if (
    pid !== undefined &&
    (!Number.isInteger(pid) || pid < 0 || pid > 0xffffffff)
  )
    throw Error("Invalid PID");
  const encrypted = offset >= 32;
  if (encrypted && pid === undefined)
    return {
      name: "Encrypted data",
      block: `Physical block ${Math.floor((offset - 32) / 12) + 1}`,
      encrypted,
      byteInField: (offset - 32) % 12,
      fieldSize: 12,
      detail: "An exact PID is needed to identify the field in this block.",
    };
  const logical = encrypted
    ? SUBSTRUCT_POSITIONS[pid! % 24].indexOf(Math.floor((offset - 32) / 12))
    : -1;
  const local = encrypted ? (offset - 32) % 12 : offset;
  const [start, size, name] = (encrypted ? secure[logical] : header).find(
    ([start, size]) => local >= start && local < start + size,
  )!;
  return {
    name,
    block: encrypted ? blocks[logical] : "Unencrypted header",
    encrypted,
    byteInField: local - start,
    fieldSize: size,
    detail: encrypted
      ? "This pixel constrains ciphertext; it does not directly reveal the decrypted field value."
      : "This field is stored without XOR encryption.",
  };
}
