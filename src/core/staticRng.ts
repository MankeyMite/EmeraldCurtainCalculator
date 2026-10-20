import { applyFacts, recordMasks, type KnownFacts } from "./constraints";
import type { Snapshot } from "./investigation";
import { genderForPid, speciesTraits } from "./traits";
import { fitsShiny } from "./shiny";
import {
  advanceSeed,
  nextSeed,
  validateRngSettings,
  summaryMatchesSpread,
  MAX_RNG_SPREADS,
  type RngSettings,
  type RngSpread,
} from "./rng";

/** Ordinary Emerald CreateBoxMon: two PID calls followed by two IV words.
 * Method 4 permits a call between IV words. No wild slot/nature rejection,
 * lead rolls, special gift PID rules or roamer generation are introduced. */
export function scanStaticSpreads(
  input: RngSettings,
  identity: KnownFacts,
  snapshots: Snapshot[],
  progress?: (done: number, total: number) => void,
): RngSpread[] {
  const settings = validateRngSettings(input);
  if (settings.kind !== "static") throw Error("Select the static RNG model");
  const species = speciesTraits(identity.species);
  if (!species) throw Error("Choose the species for the static search");
  if (identity.metGame !== undefined && identity.metGame !== 3)
    throw Error(
      "This static search models Emerald origins. Check the origin game.",
    );
  const header = Array<number>(8).fill(0xffff);
  for (const snapshot of snapshots) {
    const masks = applyFacts(recordMasks(snapshot.observations, 5), identity);
    header.forEach((_, n) => (header[n] &= masks[n]));
  }
  const found = new Map<string, RngSpread>();
  const total = settings.maxAdvance - settings.minAdvance + 1;
  let seed = advanceSeed(settings.seed, settings.minAdvance);
  for (
    let advance = settings.minAdvance;
    advance <= settings.maxAdvance;
    advance++, seed = nextSeed(seed)
  ) {
    if ((advance - settings.minAdvance) % 4096 === 0)
      progress?.(advance - settings.minAdvance, total);
    const low = nextSeed(seed),
      high = nextSeed(low),
      pid = (((high >>> 16) << 16) | (low >>> 16)) >>> 0;
    if (identity.pid !== undefined && identity.pid !== pid) continue;
    if (identity.nature !== undefined && pid % 25 !== identity.nature) continue;
    if (header.some((mask, n) => !(mask & (1 << ((pid >>> (n * 4)) & 15)))))
      continue;
    if (
      identity.gender !== undefined &&
      genderForPid(identity.species!, pid) !== identity.gender
    )
      continue;
    const abilitySlot = species.abilities[1].id === 0 ? 0 : pid & 1;
    if (
      identity.ability !== undefined &&
      species.abilities[abilitySlot].id !== identity.ability
    )
      continue;
    if (
      identity.tid !== undefined &&
      identity.sid !== undefined &&
      !fitsShiny(identity, pid ^ ((identity.sid << 16) | identity.tid))
    )
      continue;
    const first = nextSeed(high),
      second = nextSeed(first),
      third = nextSeed(second);
    for (const method of settings.methods) {
      const a = first >>> 16,
        b = (method === "Method1" ? second : third) >>> 16;
      const ivs = [
        a & 31,
        (a >>> 5) & 31,
        (a >>> 10) & 31,
        b & 31,
        (b >>> 5) & 31,
        (b >>> 10) & 31,
      ];
      if (identity.ivs?.some((v, i) => v != null && v !== ivs[i])) continue;
      if (!summaryMatchesSpread(identity.species!, pid, ivs, snapshots))
        continue;
      const key = `${pid}/${ivs.join(",")}/${abilitySlot}`,
        old = found.get(key);
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
          slot: -1,
          level: identity.metLevel ?? 0,
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
