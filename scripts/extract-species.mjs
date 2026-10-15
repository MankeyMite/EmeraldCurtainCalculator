import fs from "node:fs";
const constants = fs.readFileSync(
  "research/pret/include/constants/species.h",
  "utf8",
);
const names = fs.readFileSync(
  "research/pret/src/data/text/species_names.h",
  "utf8",
);
const ids = new Map(
  [...constants.matchAll(/^#define (SPECIES_\w+) (\d+)$/gm)].map((m) => [
    m[1],
    Number(m[2]),
  ]),
);
const info = fs.readFileSync(
  "research/pret/src/data/pokemon/species_info.h",
  "utf8",
);
const abilityIds = new Map(
  [
    ...fs
      .readFileSync("research/pret/include/constants/abilities.h", "utf8")
      .matchAll(/^#define (ABILITY_\w+) (\d+)$/gm),
  ].map((m) => [m[1], Number(m[2])]),
);
const deoxysStats = fs
  .readFileSync("research/pret/src/pokemon.c", "utf8")
  .match(/sDeoxysBaseStats\[\]\s*=\s*\{([\s\S]*?)\}/)?.[1];
const emeraldDeoxys = ["HP", "ATK", "DEF", "SPEED", "SPATK", "SPDEF"].map(
  (stat) => {
    const value = deoxysStats?.match(
      new RegExp(`\\[STAT_${stat}\\]\\s*=\\s*(\\d+)`),
    );
    if (!value) throw Error("Missing Emerald Deoxys stats");
    return Number(value[1]);
  },
);
const abilityNames = new Map(
  [
    ...fs
      .readFileSync("research/pret/src/data/text/abilities.h", "utf8")
      .matchAll(/\[(ABILITY_\w+)\]\s*=\s*_\("([^"\n]+)"\)/g),
  ].map((m) => [m[1], m[2]]),
);
const traits = new Map(
  [...info.matchAll(/\[(SPECIES_\w+)\]\s*=\s*\{\r?\n([\s\S]*?)\n    \}/g)].map(
    (m) => {
      const gender = m[2].match(
        /\.genderRatio\s*=\s*(PERCENT_FEMALE\(([\d.]+)\)|MON_MALE|MON_FEMALE|MON_GENDERLESS)/,
      );
      const abilities = m[2].match(
        /\.abilities\s*=\s*\{\s*(ABILITY_\w+),\s*(ABILITY_\w+)\s*\}/,
      );
      if (!gender || !abilities) return [m[1], null];
      const genderRatio = gender[2]
        ? Math.min(254, Math.floor((Number(gender[2]) * 255) / 100))
        : { MON_MALE: 0, MON_FEMALE: 254, MON_GENDERLESS: 255 }[gender[1]];
      return [
        m[1],
        {
          genderRatio,
          baseStats: [
            "HP",
            "Attack",
            "Defense",
            "Speed",
            "SpAttack",
            "SpDefense",
          ].map((stat) => {
            const value = m[2].match(
              new RegExp(`\\.base${stat}\\s*=\\s*(\\d+)`),
            );
            if (!value) throw Error(`Missing base ${stat}: ${m[1]}`);
            return Number(value[1]);
          }),
          abilities: abilities.slice(1).map((symbol) => {
            if (!abilityIds.has(symbol) || !abilityNames.has(symbol))
              throw Error(`Missing ability ${symbol}`);
            return {
              id: abilityIds.get(symbol),
              name: abilityNames
                .get(symbol)
                .toLowerCase()
                .replace(/(^| )\w/g, (s) => s.toUpperCase()),
            };
          }),
        },
      ];
    },
  ),
);
const species = [...names.matchAll(/\[(SPECIES_\w+)\]\s*=\s*_\("([^"\n]+)"\)/g)]
  .filter(
    (m) =>
      ids.has(m[1]) &&
      !m[1].includes("OLD_UNOWN") &&
      ids.get(m[1]) !== 0 &&
      ids.get(m[1]) !== 412,
  )
  .map((m) => ({
    id: ids.get(m[1]),
    name: m[2].toLowerCase().replace(/(^|[ .'-])\w/g, (s) => s.toUpperCase()),
    ...traits.get(m[1]),
    summaryBaseStats:
      m[1] === "SPECIES_DEOXYS" ? emeraldDeoxys : traits.get(m[1]).baseStats,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
if (species.length !== 386)
  throw Error(`Expected 386 species, got ${species.length}`);
if (
  species.some(
    (s) => !Number.isInteger(s.genderRatio) || s.abilities?.length !== 2,
  )
)
  throw Error(
    `Incomplete gender/ability source data: ${species
      .filter(
        (s) => !Number.isInteger(s.genderRatio) || s.abilities?.length !== 2,
      )
      .map((s) => s.name)
      .join(", ")}`,
  );
fs.writeFileSync(
  "src/data/species.json",
  JSON.stringify(species, null, 2) + "\n",
);
console.log(
  `Extracted ${species.length} English species names with original internal IDs`,
);
