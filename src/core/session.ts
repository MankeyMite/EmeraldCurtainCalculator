import {
  type KnownFacts,
  type Observations,
  type Observation,
} from "./constraints";
import { PROFILE } from "./memory";
import { speciesTraits } from "./traits";
import { validateSummaryStats, type SummaryStats } from "./stats";
import { encodeOtName } from "./names";
export type Session = {
  format: "emerald-curtain-observations";
  schemaVersion: 1;
  mappingVersion: typeof PROFILE.id;
  observations: Observations;
  knownFacts: KnownFacts;
  summaryStats?: SummaryStats;
};
export function validateFacts(
  input: unknown,
  requireSpecies = true,
): KnownFacts {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw Error("Invalid known facts");
  const f = input as Record<string, unknown>,
    out: KnownFacts = {};
  const bounds = {
    pid: 0xffffffff,
    tid: 65535,
    sid: 65535,
    species: 65535,
    nature: 24,
    experience: 0xffffffff,
    ability: 77,
    pokerus: 255,
    markings: 255,
    isEgg: 1,
    heldItem: 65535,
    friendship: 255,
    ppBonuses: 255,
    ribbons: 0x07ffffff,
  };
  for (const k of Object.keys(f)) {
    if (k === "assumed") {
      if (
        !Array.isArray(f[k]) ||
        !f[k].every(
          (v) =>
            typeof v === "string" &&
            /^(ev_[0-5]|contest_[0-5]|pokerus|markings|isEgg|ppBonuses|ribbons)$/.test(
              v,
            ),
        )
      )
        throw Error("Invalid default assumption metadata");
      out.assumed = [...new Set(f[k] as string[])];
      continue;
    }
    if (k === "otName") {
      if (typeof f[k] !== "string") throw Error("Invalid OT name");
      const name = (f[k] as string).normalize("NFC");
      encodeOtName(name);
      out.otName = name;
      continue;
    }
    if (k === "otGender") {
      if (f[k] !== "male" && f[k] !== "female")
        throw Error("Invalid OT gender");
      out.otGender = f[k] as "male" | "female";
      continue;
    }
    if (k === "gender") {
      if (!["male", "female", "genderless"].includes(f[k] as string))
        throw Error("Invalid gender");
      out.gender = f[k] as KnownFacts["gender"];
      continue;
    }
    if (k === "evs" || k === "ivs" || k === "contest") {
      const evs = f[k];
      if (
        !Array.isArray(evs) ||
        evs.length !== 6 ||
        !evs.every(
          (v) =>
            v === null ||
            (typeof v === "number" &&
              Number.isInteger(v) &&
              v >= 0 &&
              v <= (k === "ivs" ? 31 : 255)),
        )
      )
        throw Error(
          `${k} require six entries: 0–${k === "ivs" ? 31 : 255} or null for unknown`,
        );
      out[k] = evs.slice();
      continue;
    }
    if (k === "notes") {
      if (typeof f[k] !== "string" || f[k].length > 10000)
        throw Error("Invalid notes");
      out.notes = f[k];
      continue;
    }
    if (!Object.hasOwn(bounds, k)) throw Error(`Unsupported fact: ${k}`);
    const n = f[k];
    if (
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < 0 ||
      n > bounds[k as keyof typeof bounds]
    )
      throw Error(`Invalid ${k}`);
    out[k as keyof typeof bounds] = n;
  }
  if (
    requireSpecies &&
    (out.gender !== undefined || out.ability !== undefined) &&
    !speciesTraits(out.species)
  )
    throw Error("Gender and ability require a supported known species");
  for (const key of out.assumed ?? []) {
    const match = /^(ev|contest)_([0-5])$/.exec(key);
    const value = match
      ? out[match[1] === "ev" ? "evs" : "contest"]?.[Number(match[2])]
      : out[key as "pokerus" | "markings" | "isEgg" | "ppBonuses" | "ribbons"];
    if (value !== 0)
      throw Error(
        "Default assumption metadata must reference an active zero value",
      );
  }
  return out;
}
export function saveSession(
  observations: Observations,
  knownFacts: KnownFacts,
  summaryStats?: SummaryStats,
): string {
  return JSON.stringify(
    {
      format: "emerald-curtain-observations",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      observations,
      knownFacts,
      ...(summaryStats
        ? { summaryStats: validateSummaryStats(summaryStats) }
        : {}),
    },
    null,
    2,
  );
}
export function loadSession(text: string): Session {
  const s = JSON.parse(text);
  if (
    s?.format !== "emerald-curtain-observations" ||
    s.schemaVersion !== 1 ||
    s.mappingVersion !== PROFILE.id
  )
    throw Error("Unsupported session format or mapping version.");
  if (
    !Array.isArray(s.observations) ||
    s.observations.length !== 192 ||
    !s.observations.every((n: unknown) => [-1, 0, 1].includes(n as number))
  )
    throw Error("Expected 192 observations, each -1, 0, or 1.");
  return {
    ...s,
    observations: s.observations.map((n: Observation) => n),
    knownFacts: validateFacts(s.knownFacts),
    ...(s.summaryStats === undefined
      ? {}
      : { summaryStats: validateSummaryStats(s.summaryStats) }),
  };
}
