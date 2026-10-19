import {
  type KnownFacts,
  type Observations,
  emptyObservations,
} from "./constraints";
import { loadSession, validateFacts } from "./session";
import { PROFILE } from "./memory";
import { validateSummaryStats, type SummaryStats } from "./stats";
import { validateRngSettings, type RngSettings } from "./rng";
import { validateSidRng, type SidRngSettings } from "./sidRng";
import type { ActionDescription } from "./controlledExperiments";

export const ORIGINS = [
  ["unknown", "Unknown / other origin"],
  ["wild", "Wild encounter"],
  ["static", "Static encounter"],
  ["starter", "Starter Pokémon"],
  ["gift", "Gift Pokémon"],
  ["egg", "Egg / hatched Pokémon"],
  ["trade", "In-game trade"],
  ["event", "Event / Mystery Gift"],
  ["transferred", "Received from another Gen 3 game"],
] as const;
export type Origin = (typeof ORIGINS)[number][0];
export type Snapshot = {
  id: string;
  name: string;
  notes: string;
  observations: Observations;
  knownFacts: KnownFacts;
  summaryStats?: SummaryStats;
  targets?: number[];
  itemTest?: {
    sourceId: string;
    phase: "question" | "editing" | "recorded";
    changed?: boolean;
    candidatesBefore?: number;
    action?: ActionDescription;
  };
};
export type Investigation = {
  format: "emerald-curtain-investigation";
  schemaVersion: 1;
  mappingVersion: typeof PROFILE.id;
  origin: Origin;
  identity: KnownFacts;
  snapshots: Snapshot[];
  activeId: string;
  ownedItems: number[];
  rng?: RngSettings;
  sidRng?: SidRngSettings;
};
export const IDENTITY_KEYS = new Set([
  "pid",
  "tid",
  "sid",
  "otName",
  "otGender",
  "species",
  "nature",
  "gender",
  "ability",
  "ivs",
  "metLocation",
  "metLevel",
  "metGame",
  "ball",
  "language",
]);
export function splitFacts(facts: KnownFacts) {
  const identity: KnownFacts = {},
    mutable: KnownFacts = {};
  for (const [key, value] of Object.entries(facts))
    Object.assign(IDENTITY_KEYS.has(key) ? identity : mutable, {
      [key]: value,
    });
  return { identity, mutable };
}
export function newSnapshot(
  id: string,
  name: string,
  facts: KnownFacts = {},
): Snapshot {
  return {
    id,
    name,
    notes: "",
    observations: emptyObservations(),
    knownFacts: splitFacts(facts).mutable,
  };
}
export function loadInvestigation(text: string): Investigation {
  const value = JSON.parse(text);
  if (value?.format === "emerald-curtain-observations") {
    const old = loadSession(text),
      { identity, mutable } = splitFacts(old.knownFacts);
    return {
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "unknown",
      identity,
      activeId: "imported",
      ownedItems: [],
      snapshots: [
        {
          id: "imported",
          name: "Imported drawing",
          notes: "",
          observations: old.observations,
          knownFacts: mutable,
          ...(old.summaryStats ? { summaryStats: old.summaryStats } : {}),
        },
      ],
    };
  }
  if (
    value?.format !== "emerald-curtain-investigation" ||
    value.schemaVersion !== 1 ||
    value.mappingVersion !== PROFILE.id ||
    !ORIGINS.some(([id]) => id === value.origin)
  )
    throw Error("Unsupported investigation format or mapping version");
  const identity = validateFacts(value.identity);
  if (Object.keys(identity).some((k) => !IDENTITY_KEYS.has(k)))
    throw Error("Mutable field in shared identity");
  if (
    !Array.isArray(value.snapshots) ||
    !value.snapshots.length ||
    value.snapshots.length > 100
  )
    throw Error("Expected 1–100 observations");
  const ids = new Set<string>();
  const snapshots: Snapshot[] = value.snapshots.map((s: Snapshot) => {
    if (
      typeof s.id !== "string" ||
      !s.id ||
      s.id.length > 100 ||
      ids.has(s.id) ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      s.name.length > 100 ||
      typeof s.notes !== "string" ||
      s.notes.length > 10000
    )
      throw Error("Invalid observation name, ID or notes");
    ids.add(s.id);
    if (
      !Array.isArray(s.observations) ||
      s.observations.length !== 192 ||
      !s.observations.every((n) => [-1, 0, 1].includes(n))
    )
      throw Error("Expected 192 observations");
    const knownFacts = validateFacts(s.knownFacts, false);
    if (Object.keys(knownFacts).some((k) => IDENTITY_KEYS.has(k)))
      throw Error("Identity field in mutable snapshot");
    validateFacts({ ...identity, ...knownFacts });
    if (
      s.targets !== undefined &&
      (!Array.isArray(s.targets) ||
        !s.targets.every((n) => Number.isInteger(n) && n >= 16 && n < 176))
    )
      throw Error("Invalid target pixels");
    if (s.itemTest !== undefined) {
      const test = s.itemTest;
      if (
        !test ||
        typeof test.sourceId !== "string" ||
        test.sourceId === s.id ||
        !["question", "editing", "recorded"].includes(test.phase) ||
        (test.changed !== undefined && typeof test.changed !== "boolean") ||
        (test.candidatesBefore !== undefined &&
          (!Number.isSafeInteger(test.candidatesBefore) ||
            test.candidatesBefore < 0)) ||
        (test.phase === "question" && test.changed !== undefined) ||
        (test.phase === "editing" && test.changed !== true) ||
        (test.phase === "recorded" && test.changed === undefined)
      )
        throw Error("Invalid item test");
      if (
        test.action !== undefined &&
        (!test.action ||
          !["moves", "candy", "vitamin"].includes(test.action.kind) ||
          [
            test.action.name,
            test.action.instructions,
            test.action.restore,
          ].some((s) => typeof s !== "string" || !s.trim() || s.length > 2000))
      )
        throw Error("Invalid experiment action");
    }
    return {
      id: s.id,
      name: s.name,
      notes: s.notes,
      observations: s.observations.slice(),
      knownFacts,
      ...(s.summaryStats === undefined
        ? {}
        : { summaryStats: validateSummaryStats(s.summaryStats) }),
      ...(s.targets === undefined ? {} : { targets: [...new Set(s.targets)] }),
      ...(s.itemTest === undefined ? {} : { itemTest: { ...s.itemTest } }),
    };
  });
  if (!ids.has(value.activeId)) throw Error("Unknown active observation");
  for (const snapshot of snapshots) {
    if (snapshot.itemTest && !ids.has(snapshot.itemTest.sourceId))
      throw Error("Missing previous observation for item test");
    const source =
      snapshot.itemTest &&
      snapshots.find((s) => s.id === snapshot.itemTest!.sourceId);
    if (source?.itemTest && source.itemTest.phase !== "recorded")
      throw Error("An item test must start from a recorded observation");
  }
  if (!snapshots.some((s) => !s.itemTest))
    throw Error("An investigation needs an original observation");
  if (
    !Array.isArray(value.ownedItems) ||
    !value.ownedItems.every(
      (n: number) => Number.isInteger(n) && n >= 0 && n <= 65535,
    )
  )
    throw Error("Invalid owned item list");
  return {
    format: "emerald-curtain-investigation",
    schemaVersion: 1,
    mappingVersion: PROFILE.id,
    origin: value.origin,
    identity,
    snapshots,
    activeId: value.activeId,
    ownedItems: [...new Set<number>(value.ownedItems)],
    ...(value.rng === undefined ? {} : { rng: validateRngSettings(value.rng) }),
    ...(value.sidRng === undefined
      ? {}
      : { sidRng: validateSidRng(value.sidRng) }),
  };
}
export function saveInvestigation(value: Investigation): string {
  const text = JSON.stringify(value, null, 2);
  loadInvestigation(text);
  return text;
}
