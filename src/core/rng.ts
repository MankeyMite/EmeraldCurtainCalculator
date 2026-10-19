import tables from "../data/wild-encounters.json";
import { applyFacts, recordMasks, type KnownFacts } from "./constraints";
import type { Snapshot } from "./investigation";
import { genderForPid, speciesTraits } from "./traits";
import { calculateStat } from "./stats";

export const WILD_AREAS = tables;
export const WILD_METHODS = ["H1", "H2", "H4"] as const;
export type WildMethod = (typeof WILD_METHODS)[number];
export type WildLead =
  "none" | "synchronize" | "cuteCharmM" | "cuteCharmF" | "pressure";
export type RngSettings = {
  seed: number;
  minAdvance: number;
  maxAdvance: number;
  methods: WildMethod[];
  areaId: string;
  lead: WildLead;
  synchronizeNature: number;
};
export type RngSpread = {
  pid: number;
  ivs: number[]; // HP, Atk, Def, Speed, SpA, SpD, same order as stored facts.
  abilitySlot: number;
  advance: number;
  lastAdvance: number;
  methods: WildMethod[];
  slot: number;
  level: number;
};
export const MAX_RNG_RANGE = 1_000_000;
export const MAX_RNG_SPREADS = 5000;
export function validateRngSettings(value: unknown): RngSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid RNG search settings");
  const v = value as RngSettings;
  if (
    ![v.seed, v.minAdvance, v.maxAdvance].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
    )
  )
    throw Error(
      "Seed and advances must be whole numbers from 0 to 4,294,967,295",
    );
  if (
    v.maxAdvance < v.minAdvance ||
    v.maxAdvance - v.minAdvance + 1 > MAX_RNG_RANGE
  )
    throw Error(
      "Use an inclusive range of at most 1,000,000 advances, with minimum ≤ maximum",
    );
  if (
    !Array.isArray(v.methods) ||
    !v.methods.length ||
    v.methods.some((m) => !WILD_METHODS.includes(m))
  )
    throw Error("Select H1, H2 or H4");
  if (!WILD_AREAS.some((a) => a.id === v.areaId))
    throw Error("Choose a supported Emerald encounter area");
  if (
    !["none", "synchronize", "cuteCharmM", "cuteCharmF", "pressure"].includes(
      v.lead,
    ) ||
    !Number.isInteger(v.synchronizeNature) ||
    v.synchronizeNature < 0 ||
    v.synchronizeNature > 24
  )
    throw Error("Invalid lead ability or Synchronize nature");
  return {
    seed: v.seed,
    minAdvance: v.minAdvance,
    maxAdvance: v.maxAdvance,
    methods: [...new Set(v.methods)],
    areaId: v.areaId,
    lead: v.lead,
    synchronizeNature: v.synchronizeNature,
  };
}
export function parseRngNumber(text: string): number {
  const value = text.trim();
  if (!/^(?:\d+|0x[0-9a-f]+)$/i.test(value))
    throw Error("Use a whole decimal number or hex with 0x");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff)
    throw Error("Value must be between 0 and 4,294,967,295");
  return n;
}
export const nextSeed = (seed: number) =>
  (Math.imul(seed, 0x41c64e6d) + 0x6073) >>> 0;
// Affine exponentiation permits high starting advances without a linear warmup.
export function advanceSeed(seed: number, advances: number): number {
  let multiplier = 0x41c64e6d,
    increment = 0x6073;
  for (let n = advances; n > 0; n = Math.floor(n / 2)) {
    if (n % 2) seed = (Math.imul(seed, multiplier) + increment) >>> 0;
    increment = Math.imul(increment, multiplier + 1) >>> 0;
    multiplier = Math.imul(multiplier, multiplier) >>> 0;
  }
  return seed >>> 0;
}
function ivsFromWords(first: number, second: number) {
  return [
    first & 31,
    (first >>> 5) & 31,
    (first >>> 10) & 31,
    second & 31,
    (second >>> 5) & 31,
    (second >>> 10) & 31,
  ];
}
export function matchingAreas(facts: KnownFacts) {
  return WILD_AREAS.filter(
    (a) =>
      (facts.metLocation === undefined || a.location === facts.metLocation) &&
      a.slots.some(
        (s) =>
          (facts.species === undefined || s.species === facts.species) &&
          (facts.metLevel === undefined ||
            (s.min <= facts.metLevel && s.max >= facts.metLevel)),
      ),
  );
}
export function scanWildSpreads(
  input: RngSettings,
  identity: KnownFacts,
  snapshots: Snapshot[],
  progress?: (done: number, total: number) => void,
): RngSpread[] {
  const settings = validateRngSettings(input);
  const area = WILD_AREAS.find((a) => a.id === settings.areaId)!;
  if (identity.metGame !== undefined && identity.metGame !== 3)
    throw Error(
      "This encounter search models Emerald origins. Check the origin game.",
    );
  if (
    identity.metLocation !== undefined &&
    area.location !== identity.metLocation
  )
    throw Error("The encounter area conflicts with the known met location");
  const header = Array<number>(8).fill(0xffff);
  for (const snapshot of snapshots) {
    const masks = applyFacts(recordMasks(snapshot.observations, 5), identity);
    for (let n = 0; n < 8; n++) header[n] &= masks[n];
  }
  const found = new Map<string, RngSpread>();
  let seed = advanceSeed(settings.seed, settings.minAdvance);
  const total = settings.maxAdvance - settings.minAdvance + 1;
  for (
    let advance = settings.minAdvance;
    advance <= settings.maxAdvance;
    advance++, seed = nextSeed(seed)
  ) {
    if ((advance - settings.minAdvance) % 4096 === 0)
      progress?.(advance - settings.minAdvance, total);
    let state = seed;
    const next = () => {
      state = nextSeed(state);
      return state >>> 16;
    };
    if (area.kind === "rock" && next() % 2880 >= area.rate * 16) continue;
    const roll = next() % 100;
    let sum = 0,
      slot = 0;
    for (; slot < area.slots.length - 1; slot++) {
      sum += area.slots[slot].weight;
      if (roll < sum) break;
    }
    const encounter = area.slots[slot];
    let level = encounter.min + (next() % (encounter.max - encounter.min + 1));
    if (settings.lead === "pressure") {
      if (next() % 2 === 0) level = encounter.max;
      else if (level > encounter.min) level--;
    }
    if (
      identity.species !== undefined &&
      identity.species !== encounter.species
    )
      continue;
    if (identity.metLevel !== undefined && identity.metLevel !== level)
      continue;
    const species = speciesTraits(encounter.species)!;
    const variableGender = ![0, 254, 255].includes(species.genderRatio);
    const charm =
      (settings.lead === "cuteCharmM" || settings.lead === "cuteCharmF") &&
      variableGender &&
      next() % 3 !== 0;
    const nature =
      settings.lead === "synchronize" && next() % 2 === 0
        ? settings.synchronizeNature
        : next() % 25;
    if (identity.nature !== undefined && identity.nature !== nature) continue;
    let pid: number;
    do {
      const low = next(),
        high = next();
      pid = ((high << 16) | low) >>> 0;
    } while (
      pid % 25 !== nature ||
      (charm &&
        genderForPid(encounter.species, pid) !==
          (settings.lead === "cuteCharmM" ? "female" : "male"))
    );
    if (identity.pid !== undefined && identity.pid !== pid) continue;
    if (header.some((m, n) => !(m & (1 << ((pid >>> (n * 4)) & 15))))) continue;
    if (
      identity.gender !== undefined &&
      genderForPid(encounter.species, pid) !== identity.gender
    )
      continue;
    // CreateBoxMon leaves abilityNum at zero for single-ability species.
    const abilitySlot = species.abilities[1].id === 0 ? 0 : pid & 1;
    if (
      identity.ability !== undefined &&
      species.abilities[abilitySlot].id !== identity.ability
    )
      continue;
    const a = next(),
      b = next(),
      c = next();
    for (const method of settings.methods) {
      const ivs =
        method === "H1"
          ? ivsFromWords(a, b)
          : method === "H2"
            ? ivsFromWords(b, c)
            : ivsFromWords(a, c);
      if (identity.ivs?.some((v, i) => v !== null && v !== ivs[i])) continue;
      if (
        snapshots.some((snapshot) => {
          const summary = snapshot.summaryStats;
          if (!summary?.level) return false;
          return summary.stats.some((stat, i) => {
            if (stat === null) return false;
            const ev = snapshot.knownFacts.evs?.[i];
            const base = species.summaryBaseStats[i];
            if (ev !== null && ev !== undefined)
              return (
                calculateStat(
                  base,
                  ivs[i],
                  ev,
                  summary.level!,
                  i,
                  nature,
                  species.name === "Shedinja",
                ) !== stat
              );
            // Unknown EVs remain free. A monotone interval is a conservative filter.
            return (
              stat <
                calculateStat(
                  base,
                  ivs[i],
                  0,
                  summary.level!,
                  i,
                  nature,
                  species.name === "Shedinja",
                ) ||
              stat >
                calculateStat(
                  base,
                  ivs[i],
                  255,
                  summary.level!,
                  i,
                  nature,
                  species.name === "Shedinja",
                )
            );
          });
        })
      )
        continue;
      const key = `${pid}/${ivs.join(",")}/${abilitySlot}`;
      const old = found.get(key);
      if (old) {
        old.lastAdvance = advance;
        if (!old.methods.includes(method)) old.methods.push(method);
      } else
        found.set(key, {
          pid,
          ivs,
          abilitySlot,
          advance,
          lastAdvance: advance,
          methods: [method],
          slot,
          level,
        });
      if (found.size > MAX_RNG_SPREADS)
        throw Error(
          "More than 5,000 distinct spreads match. Narrow the advance range or add known traits/pixels; no partial result has been applied.",
        );
    }
  }
  progress?.(total, total);
  return [...found.values()];
}
