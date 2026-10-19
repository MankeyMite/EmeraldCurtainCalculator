// Read the same pinned pret checkout as extract-species.mjs. No ROM required.
import fs from "node:fs";
const root = process.argv[2] || "research/pret";
const read = (file) => fs.readFileSync(`${root}/${file}`, "utf8");
const constants = read("include/constants/items.h").replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
  "",
);
const enumText = constants.match(/enum\s*\{([\s\S]*?)\}/)[1];
const ids = new Map();
let id = 0;
for (const entry of enumText.split(",")) {
  const token = entry.trim();
  if (!token) continue;
  if (!/^ITEM_\w+$/.test(token) && token !== "ITEMS_COUNT")
    throw Error(`Unsupported enum ${token}`);
  ids.set(token, id++);
}
const machines = read("include/constants/tms_hms.h");
for (const kind of ["TM", "HM"]) {
  const names = [
    ...machines
      .match(
        new RegExp(`#define FOREACH_${kind}\\(F\\)([\\s\\S]*?)(?=\\n\\s*\\n)`),
      )[1]
      .matchAll(/F\((\w+)\)/g),
  ].map((m) => m[1]);
  names.forEach((name, i) =>
    ids.set(
      `ITEM_${kind}_${name}`,
      ids.get(`ITEM_${kind}${String(i + 1).padStart(2, "0")}`),
    ),
  );
}
const items = [];
for (const match of read("src/data/items.h").matchAll(
  /\[(ITEM_\w+)\]\s*=\s*\{([\s\S]*?)\n    \}/g,
)) {
  const [_, token, block] = match;
  const name = block.match(/\.name\s*=\s*_\("([^"]+)"\)/)?.[1];
  if (!name || name.includes("?")) continue;
  const important = /\.importance\s*=\s*[1-9]/.test(block);
  const key = /\.pocket\s*=\s*POCKET_KEY_ITEMS/.test(block);
  const mail = /_MAIL$/.test(token);
  const holdable = !important && !key && token !== "ITEM_SAFARI_BALL";
  items.push({
    id: ids.get(token),
    name,
    holdable,
    experiment: holdable && !mail,
    availability:
      "Confirm this item is in your Bag; internal existence does not establish availability.",
  });
}
if (items.some((i) => !Number.isInteger(i.id))) throw Error("Missing item IDs");
fs.writeFileSync("src/data/items.json", JSON.stringify(items, null, 2) + "\n");
const speciesIds = new Map(
  [
    ...read("include/constants/species.h").matchAll(
      /^#define (SPECIES_\w+) (\d+)$/gm,
    ),
  ].map((m) => [m[1], Number(m[2])]),
);
const growth = {};
for (const m of read("src/data/pokemon/species_info.h").matchAll(
  /\[(SPECIES_\w+)\]\s*=\s*\{\r?\n([\s\S]*?)\n    \}/g,
)) {
  const rate = m[2].match(/\.growthRate\s*=\s*GROWTH_(\w+)/)?.[1];
  if (rate && speciesIds.has(m[1]))
    growth[speciesIds.get(m[1])] = rate.toLowerCase().replaceAll("_", " ");
}
fs.writeFileSync(
  "src/data/growth-rates.json",
  JSON.stringify(growth, null, 2) + "\n",
);
console.log(
  `Extracted ${items.length} named items and ${Object.keys(growth).length} growth rates`,
);
const title = (text) =>
  text.toLowerCase().replace(/(^|[\s\-])\p{L}/gu, (s) => s.toUpperCase());
const moveIds = new Map(
  [
    ...read("include/constants/moves.h").matchAll(
      /^#define (MOVE_\w+) (\d+)$/gm,
    ),
  ].map((m) => [m[1], Number(m[2])]),
);
const moves = [
  ...read("src/data/text/move_names.h").matchAll(
    /\[(MOVE_\w+)\]\s*=\s*_\("([^"]+)"\)/g,
  ),
].map((m) => ({
  id: moveIds.get(m[1]),
  name: m[1] === "MOVE_NONE" ? "No move (empty slot)" : title(m[2]),
}));
const sections = JSON.parse(
  read("src/data/region_map/region_map_sections.json"),
).map_sections;
const metLocations = sections.map((section, id) => {
  const base = (
    section.name || section.id.replace(/^MAPSEC_/, "").replaceAll("_", " ")
  ).replaceAll("{AQUA}", "Aqua");
  const duplicates = sections.filter((s) => s.name === section.name).length > 1;
  const name = /_OLD$/.test(section.id)
    ? `${title(base)} (legacy section)`
    : duplicates
      ? `${title(base)} (${title(section.id.replace(/^MAPSEC_/, "").replaceAll("_", " "))})`
      : title(base);
  return { id, name };
});
metLocations.push(
  { id: sections.length, name: "None (map section)" },
  { id: 253, name: "Special Egg location" },
  { id: 254, name: "In-game trade" },
  { id: 255, name: "Fateful encounter" },
);
const globals = read("include/constants/global.h");
const gameNames = {
  SAPPHIRE: "Sapphire",
  RUBY: "Ruby",
  EMERALD: "Emerald",
  FIRE_RED: "FireRed",
  LEAF_GREEN: "LeafGreen",
  GAMECUBE: "Colosseum / XD",
};
const games = [...globals.matchAll(/^#define VERSION_(\w+) (\d+)$/gm)]
  .filter((m) => m[1] in gameNames)
  .map((m) => ({ id: Number(m[2]), name: gameNames[m[1]] }));
const languages = [
  ...globals.matchAll(/^#define LANGUAGE_(\w+)\s+(\d+)/gm),
].map((m) => ({
  id: Number(m[2]),
  name:
    m[1] === "KOREAN"
      ? "Unused Korean code (not a released Gen 3 language)"
      : title(m[1]),
}));
const balls = items
  .filter((item) => item.id >= 1 && item.id <= 12)
  .map((item) => ({
    id: item.id,
    name: title(item.name).replace(/Pok[eé]/i, "Poké"),
  }));
if (moves.length !== 355 || moves.some((m) => !Number.isInteger(m.id)))
  throw Error("Incomplete move catalog");
for (const catalog of [moves, metLocations, games, languages, balls]) {
  if (
    new Set(catalog.map((c) => c.id)).size !== catalog.length ||
    new Set(catalog.map((c) => c.name.toLowerCase())).size !== catalog.length
  )
    throw Error("Catalog needs unique names and IDs");
}
fs.writeFileSync(
  "src/data/named-facts.json",
  JSON.stringify({ moves, metLocations, games, languages, balls }, null, 2) +
    "\n",
);
console.log(
  `Extracted ${moves.length} moves, ${metLocations.length} locations, games, languages and stored Ball IDs`,
);
