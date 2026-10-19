// Data only, from the same pinned pret checkout as the species catalog.
import fs from "node:fs";
const root = process.argv[2] || "research/pret";
const read = (file) => fs.readFileSync(`${root}/${file}`, "utf8");
const sections = JSON.parse(
  read("src/data/region_map/region_map_sections.json"),
).map_sections;
const ids = new Map(
  [
    ...read("include/constants/species.h").matchAll(
      /^#define (SPECIES_\w+) (\d+)$/gm,
    ),
  ].map((m) => [m[1], Number(m[2])]),
);
const groups = JSON.parse(
  read("src/data/wild_encounters.json"),
).wild_encounter_groups;
const maps = new Map(
  fs
    .readdirSync(`${root}/data/maps`, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const path = `${root}/data/maps/${d.name}/map.json`;
      if (!fs.existsSync(path)) return [];
      const map = JSON.parse(fs.readFileSync(path, "utf8"));
      return [
        [
          map.id,
          {
            name: d.name
              .replaceAll("_", " ")
              .replace(/([a-z])(\d|[A-Z])/g, "$1 $2"),
            location: sections.findIndex(
              (s) => s.id === map.region_map_section,
            ),
          },
        ],
      ];
    }),
);
const areas = [];
const speciesNames = new Map(
  JSON.parse(fs.readFileSync("src/data/species.json", "utf8")).map((s) => [
    s.id,
    s.name,
  ]),
);
for (const encounter of groups.find((g) => g.for_maps).encounters) {
  const map = maps.get(encounter.map);
  // Safari Pokéblocks and Route 119 Feebas tiles need additional state.
  if (!map || map.location < 0 || encounter.map.includes("SAFARI")) continue;
  for (const [field, kind, start, end, rates] of [
    ["land_mons", "land", 0, 12, [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1]],
    ["water_mons", "surf", 0, 5, [60, 30, 5, 4, 1]],
    ["rock_smash_mons", "rock", 0, 5, [60, 30, 5, 4, 1]],
    ["fishing_mons", "oldRod", 0, 2, [70, 30]],
    ["fishing_mons", "goodRod", 2, 5, [60, 20, 20]],
    ["fishing_mons", "superRod", 5, 10, [40, 40, 15, 4, 1]],
  ]) {
    const table = encounter[field];
    if (
      !table ||
      (field === "fishing_mons" && encounter.map === "MAP_ROUTE119")
    )
      continue;
    const slots = table.mons.slice(start, end).map((mon, i) => ({
      species: ids.get(mon.species),
      min: mon.min_level,
      max: mon.max_level,
      weight: rates[i],
    }));
    if (
      slots.some((s) => s.species === undefined) ||
      slots.length !== rates.length
    )
      throw Error("Incomplete encounter table");
    areas.push({
      id: `${encounter.map}:${kind}${encounter.map === "MAP_ALTERING_CAVE" ? `:${encounter.base_label}` : ""}`,
      name:
        encounter.map === "MAP_ALTERING_CAVE"
          ? `${map.name} · ${[...new Set(slots.map((s) => speciesNames.get(s.species)))].join(" / ")}`
          : map.name,
      location: map.location,
      kind,
      rate: table.encounter_rate,
      slots,
    });
  }
}
if (new Set(areas.map((a) => a.id)).size !== areas.length)
  throw Error("Duplicate encounter area IDs");
fs.writeFileSync("src/data/wild-encounters.json", JSON.stringify(areas) + "\n");
console.log(`Extracted ${areas.length} Emerald encounter tables`);
