import fs from "node:fs";
const root = process.argv[2] || "research/pret";
const read = (f) => fs.readFileSync(`${root}/${f}`, "utf8");
const species = new Map(
  [
    ...read("include/constants/species.h").matchAll(
      /^#define (SPECIES_\w+) (\d+)$/gm,
    ),
  ].map((m) => [m[1], Number(m[2])]),
);
const moves = new Map(
  [
    ...read("include/constants/moves.h").matchAll(
      /^#define (MOVE_\w+)\s+(\d+)$/gm,
    ),
  ].map((m) => [m[1], Number(m[2])]),
);
const standard = Number(
  read("include/constants/pokemon.h").match(
    /^#define STANDARD_FRIENDSHIP\s+(\d+)/m,
  )[1],
);
const friendship = {};
for (const m of read("src/data/pokemon/species_info.h").matchAll(
  /\[(SPECIES_\w+)\]\s*=\s*\{\r?\n([\s\S]*?)\n    \}/g,
)) {
  const f = m[2].match(/\.friendship\s*=\s*(\d+|STANDARD_FRIENDSHIP)/);
  if (f && species.has(m[1]))
    friendship[species.get(m[1])] =
      f[1] === "STANDARD_FRIENDSHIP" ? standard : Number(f[1]);
}
if (Object.keys(friendship).length !== 386)
  throw Error("Incomplete species friendship");
const pp = { 0: 0 };
for (const m of read("src/data/battle_moves.h").matchAll(
  /\[(MOVE_\w+)\]\s*=\s*\{([\s\S]*?)\n    \}/g,
)) {
  const p = m[2].match(/\.pp\s*=\s*(\d+)/);
  if (p && moves.has(m[1])) pp[moves.get(m[1])] = Number(p[1]);
}
if (Object.keys(pp).length < 350) throw Error("Incomplete move PP");
fs.writeFileSync(
  "src/data/capture-defaults.json",
  JSON.stringify({ friendship, pp }) + "\n",
);
