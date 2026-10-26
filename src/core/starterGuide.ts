import { scanStaticSpreads } from "./staticRng";
import { genderForPid, speciesTraits } from "./traits";
import { summaryMatchesSpread, type RngSettings, type RngSpread } from "./rng";
import { generateSidRng } from "./sidRng";
import { newSnapshot, type Snapshot } from "./investigation";
import { validateFacts } from "./session";
import type { KnownFacts } from "./constraints";
import { validateSummaryStats, type SummaryStats } from "./stats";
import {
  defaultIntroTiming,
  defaultStarterTiming,
  estimatedSidWindow,
  estimatedStarterWindow,
  validateTiming,
  type StarterTiming,
  STARTER_SEARCH_RADIUS,
  DEFAULT_STARTER_SEARCH_RADIUS,
  DEFAULT_STARTER_CALIBRATION,
} from "./starterTiming";
import yields from "../data/ev-yields.json";
import learnsets from "../data/level-up-learnsets.json";
import { STARTER_ITEM_IDS } from "./starterItems";
import catalogueRules from "../data/starter-catalogue-rules.json";
import type { StarterPidRecommendation } from "./starterRecommendation";
import {
  recordStarterChecklist,
  withStarterStorageInstructions,
} from "./starterChecklist";

export const STARTERS = [277, 280, 283];
// Each original Emerald starter has one possible ability.
export const starterAbility = (species: number) =>
  String(speciesTraits(species)!.abilities[0].id);
export const GUIDE_KEY = "emerald-starter-guide-v1";
export const GUIDE_BACKUP_LAB_KEY =
  "emerald-starter-guide-backup-investigation-v1";
export const GUIDE_LAB_KEY = "emerald-starter-guide-investigation-v1";
export type BattleEntry = {
  id: string;
  species: number;
  count: number;
  multiplier: 1 | 2 | 4;
  level?: number;
  trainer?: boolean;
};
export type StarterReading = {
  id: string;
  summary: SummaryStats;
  evs: number[];
};
/** The guide uses only the latest submitted summary and its own EV snapshot.
 * Legacy saved checks are deliberately not accumulated. */
export function currentStarterReadings(readings: StarterReading[]) {
  return readings.slice(-1);
}
export type RouteSetup = {
  itemPlanVersion?: 2;
  facts: KnownFacts;
  instructions: string[];
  train?: { species: number; count: number };
  score: { worstCase: number; expected: number; total: number };
  done: boolean[];
  items?: number[];
  actions?: {
    index: number;
    battles?: BattleEntry[];
    moves?: (number | null)[];
    beforeMoves?: (number | null)[];
    consumedItems?: number[];
    acquiredItems?: number[];
  }[];
};
export type StarterGuideState = {
  version: 1;
  starterTimingVersion?: 1 | 2 | 3 | 4 | 5;
  itemCatalogVersion?: 1 | 2;
  journeyVersion?: 1;
  usedTms?: number[];
  step: number;
  tid: string;
  playerGender?: "" | "male" | "female";
  backup?: {
    active: boolean;
    configured?: boolean;
    phase: "details" | "curtains";
    draft: Record<string, string>;
  };
  intro: StarterTiming;
  starter: StarterTiming;
  starterRecommendation?: Pick<
    StarterPidRecommendation,
    "key" | "advance" | "species"
  > &
    Partial<StarterPidRecommendation>;
  identifiedStarter?: RngSpread | null;
  species: number;
  nature: string;
  gender: string;
  ability: string;
  readingDraft: Record<string, string>;
  readings: StarterReading[];
  battles: BattleEntry[];
  evsKnown: boolean;
  protectedSave: boolean;
  routeDone: boolean;
  route: RouteSetup | null;
  completedRouteSteps?: string[];
  starterPart: "timer" | "summary";
  exp: string;
  moves: (number | null)[];
  availableItems: number[]; // Legacy saved metadata; guided availability is automatic.
  selected: RngSpread | null;
  confirmedSid: number | null;
  attemptDraft: Record<string, string>;
  attemptNature: string;
  attemptGender: string;
  attemptAbility: string;
  targetMin: number;
  targetMax: number;
};
export function newStarterGuide(): StarterGuideState {
  return {
    version: 1,
    starterTimingVersion: 5,
    itemCatalogVersion: 2,
    journeyVersion: 1,
    usedTms: [],
    step: 0,
    tid: "",
    playerGender: "",
    intro: defaultIntroTiming(),
    starter: defaultStarterTiming(),
    identifiedStarter: null,
    species: 277,
    nature: "",
    gender: "",
    ability: starterAbility(277),
    readingDraft: { level: "5" },
    readings: [],
    battles: [{ id: "birch", species: 288, count: 1, multiplier: 1 }],
    evsKnown: true,
    protectedSave: false,
    routeDone: false,
    route: null,
    completedRouteSteps: [],
    starterPart: "timer",
    exp: "",
    moves: [1, 43, 0, 0],
    availableItems: [0, ...STARTER_ITEM_IDS],
    selected: null,
    confirmedSid: null,
    attemptDraft: { level: "5" },
    attemptNature: "",
    attemptGender: "",
    attemptAbility: starterAbility(277),
    targetMin: 1200,
    targetMax: 200000,
  };
}
/** A soft reset creates a different starter. Keep the trainer and timing,
 * but never carry that previous starter's stats, EVs or curtain evidence. */
export function newStarterAttempt(s: StarterGuideState): StarterGuideState {
  const fresh = newStarterGuide();
  return {
    ...s,
    nature: "",
    gender: "",
    ability: starterAbility(s.species),
    readingDraft: fresh.readingDraft,
    identifiedStarter: null,
    backup: undefined,
    readings: [],
    battles: fresh.battles,
    evsKnown: true,
    routeDone: false,
    route: null,
    completedRouteSteps: [],
    exp: "",
    moves: creationMoves(s.species),
    usedTms: [],
    selected: null,
    confirmedSid: null,
    attemptDraft: fresh.attemptDraft,
    attemptNature: "",
    attemptGender: "",
    attemptAbility: starterAbility(s.species),
  };
}
/** Repeating a shiny attempt changes only that attempt's observations. */
export function newShinyAttempt(s: StarterGuideState): StarterGuideState {
  return {
    ...s,
    attemptDraft: { level: "5" },
    attemptNature: "",
    attemptGender: "",
    attemptAbility: starterAbility(s.species),
  };
}
export function validateStarterGuide(value: unknown): StarterGuideState {
  const s = value as StarterGuideState;
  if (
    !s ||
    s.version !== 1 ||
    (s.playerGender !== undefined &&
      !["", "male", "female"].includes(s.playerGender)) ||
    (s.starterTimingVersion !== undefined &&
      ![1, 2, 3, 4, 5].includes(s.starterTimingVersion)) ||
    (s.itemCatalogVersion !== undefined &&
      ![1, 2].includes(s.itemCatalogVersion)) ||
    (s.journeyVersion !== undefined && s.journeyVersion !== 1) ||
    (s.usedTms !== undefined &&
      (!Array.isArray(s.usedTms) || s.usedTms.some((id) => id !== 297))) ||
    !Number.isInteger(s.step) ||
    s.step < 0 ||
    s.step > 5 ||
    !STARTERS.includes(s.species) ||
    !Array.isArray(s.readings) ||
    s.readings.length > 40 ||
    !Array.isArray(s.battles) ||
    s.battles.length > 500 ||
    !Array.isArray(s.moves) ||
    s.moves.length !== 4 ||
    s.moves.some(
      (n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 354),
    ) ||
    !Array.isArray(s.availableItems) ||
    s.availableItems.some((n) => !Number.isInteger(n) || n < 0 || n > 65535) ||
    !Number.isInteger(s.targetMin) ||
    !Number.isInteger(s.targetMax) ||
    s.targetMin < 0 ||
    s.targetMax < s.targetMin ||
    s.targetMax - s.targetMin > 1000000 ||
    typeof s.tid !== "string" ||
    !/^(?:\d{1,5})?$/.test(s.tid) ||
    Number(s.tid) > 65535
  )
    throw Error("Invalid starter guide progress.");
  if (
    s.backup &&
    (typeof s.backup.active !== "boolean" ||
      (s.backup.configured !== undefined &&
        typeof s.backup.configured !== "boolean") ||
      !["details", "curtains"].includes(s.backup.phase) ||
      !s.backup.draft ||
      Object.values(s.backup.draft).some((v) => typeof v !== "string"))
  )
    throw Error("Invalid backup Pokemon progress");
  validateTiming(s.intro);
  validateTiming(s.starter);
  if (
    s.starterRecommendation &&
    (typeof s.starterRecommendation.key !== "string" ||
      s.starterRecommendation.key.length > 2000 ||
      !Number.isInteger(s.starterRecommendation.advance) ||
      s.starterRecommendation.advance < catalogueRules.minAdvance ||
      s.starterRecommendation.advance > catalogueRules.maxAdvance ||
      !STARTERS.includes(s.starterRecommendation.species))
  )
    throw Error("Invalid starter recommendation.");
  const preview = s.starterRecommendation;
  if (preview?.rows !== undefined) {
    if (
      !preview.timing ||
      !Number.isInteger(preview.fullSidCount) ||
      preview.fullSidCount! < 1 ||
      preview.fullSidCount! > 4096 ||
      !Number.isInteger(preview.priorityCount) ||
      preview.priorityCount! < 1 ||
      preview.priorityCount! > 19 ||
      !Number.isFinite(preview.drawingChance) ||
      preview.drawingChance! < 0 ||
      preview.drawingChance! > 1 ||
      !Array.isArray(preview.rows) ||
      preview.rows.length !== 11 ||
      preview.rows.some(
        (row, n) =>
          row.advance !== preview.advance - 5 + n ||
          !Number.isInteger(row.pid) ||
          row.pid < 0 ||
          row.pid > 0xffffffff ||
          !Number.isInteger(row.drawingOnly) ||
          row.drawingOnly < 0 ||
          row.drawingOnly > preview.priorityCount! ||
          !Number.isInteger(row.withoutTraining) ||
          row.withoutTraining < row.drawingOnly ||
          row.withoutTraining > preview.priorityCount! ||
          typeof row.ambiguous !== "boolean",
      )
    )
      throw Error("Invalid saved starter PID preview.");
    validateTiming(preview.timing);
  }
  if (!["timer", "summary"].includes(s.starterPart))
    throw Error("Invalid starter screen.");
  for (const r of s.readings) {
    validateSummaryStats(r.summary);
    validateFacts({ evs: r.evs });
    if (r.evs.length !== 6 || r.evs.some((n) => n === null))
      throw Error("Invalid reading EVs.");
  }
  battleEvs(s.battles);
  for (const k of [
    "nature",
    "gender",
    "ability",
    "attemptNature",
    "attemptGender",
    "attemptAbility",
    "exp",
  ] as const)
    if (typeof s[k] !== "string") throw Error("Invalid guide fields.");
  for (const k of ["protectedSave", "routeDone", "evsKnown"] as const)
    if (typeof s[k] !== "boolean") throw Error("Invalid guide checkpoint.");
  for (const d of [s.readingDraft, s.attemptDraft])
    if (!d || Object.values(d).some((v) => typeof v !== "string"))
      throw Error("Invalid stat draft.");
  if (
    s.confirmedSid !== null &&
    (!Number.isInteger(s.confirmedSid) ||
      s.confirmedSid < 0 ||
      s.confirmedSid > 65535)
  )
    throw Error("Invalid confirmed SID.");
  for (const spread of [s.selected, s.identifiedStarter]) {
    if (!spread) continue;
    if (
      !Number.isInteger(spread.pid) ||
      spread.pid < 0 ||
      spread.pid > 0xffffffff ||
      !Number.isInteger(spread.advance) ||
      spread.advance < 0 ||
      !Array.isArray(spread.methods) ||
      spread.methods.join() !== "Method1" ||
      !Array.isArray(spread.ivs) ||
      spread.ivs.length !== 6 ||
      spread.ivs.some((n) => n === null) ||
      ![0, 1].includes(spread.abilitySlot)
    )
      throw Error("Invalid selected target.");
    validateFacts({ ivs: spread.ivs });
  }
  if (s.route) {
    if (s.route.itemPlanVersion !== undefined && s.route.itemPlanVersion !== 2)
      throw Error("Invalid item plan version.");
    validateFacts(s.route.facts);
    if (s.route.actions !== undefined) {
      if (!Array.isArray(s.route.actions))
        throw Error("Invalid route actions.");
      for (const action of s.route.actions) {
        if (
          !Number.isInteger(action.index) ||
          action.index < 0 ||
          action.index >= s.route.instructions.length
        )
          throw Error("Invalid route action.");
        if (action.battles) battleEvs(action.battles);
        if (action.moves) validateFacts({ moves: action.moves });
        if (action.beforeMoves) validateFacts({ moves: action.beforeMoves });
        if (
          action.acquiredItems &&
          (!Array.isArray(action.acquiredItems) ||
            action.acquiredItems.some((id) => !STARTER_ITEM_IDS.includes(id)))
        )
          throw Error("Invalid checklist items.");
        if (
          action.consumedItems &&
          (!Array.isArray(action.consumedItems) ||
            action.consumedItems.some((id) => id !== 297))
        )
          throw Error("Invalid route TM.");
      }
    }
    if (
      !Array.isArray(s.route.instructions) ||
      s.route.instructions.some((t) => typeof t !== "string") ||
      !Array.isArray(s.route.done) ||
      s.route.done.length !== s.route.instructions.length ||
      s.route.done.some((v) => typeof v !== "boolean") ||
      (s.route.items !== undefined &&
        (!Array.isArray(s.route.items) ||
          s.route.items.some((id) => !STARTER_ITEM_IDS.includes(id)))) ||
      (s.route.train &&
        (!yields.some((r) => r.id === s.route!.train!.species) ||
          !Number.isInteger(s.route.train.count) ||
          s.route.train.count < 1 ||
          s.route.train.count > 510))
    )
      throw Error("Invalid route.");
  }
  if (
    s.completedRouteSteps !== undefined &&
    (!Array.isArray(s.completedRouteSteps) ||
      s.completedRouteSteps.some((key) => typeof key !== "string"))
  )
    throw Error("Invalid checklist progress.");
  const existingCalibration =
    (s.starterTimingVersion ?? 0) < 3 && s.starter.calibration === -254
      ? 0
      : s.starter.calibration;
  const starterCalibration =
    (s.starterTimingVersion ?? 0) < 5 &&
    existingCalibration === 0 &&
    s.starter.offset === 0
      ? existingCalibration + DEFAULT_STARTER_CALIBRATION
      : existingCalibration;
  // Older versions accumulated checks that could belong to different attempts.
  return structuredClone({
    ...s,
    ability: starterAbility(s.species),
    attemptAbility: starterAbility(s.species),
    starterTimingVersion: 5,
    itemCatalogVersion: 2,
    journeyVersion: 1,
    usedTms: s.usedTms ?? [],
    identifiedStarter: s.identifiedStarter ?? null,
    starter: {
      ...s.starter,
      // Remove the old BIOS-reset default once. Other measured corrections
      // and explicitly entered version-3 calibrations remain unchanged.
      calibration: starterCalibration,
      uncertainty:
        ((s.starterTimingVersion ?? 0) < 2 && s.starter.uncertainty === 100) ||
        ((s.starterTimingVersion ?? 0) < 4 && s.starter.uncertainty === 10)
          ? DEFAULT_STARTER_SEARCH_RADIUS
          : Math.min(s.starter.uncertainty, STARTER_SEARCH_RADIUS),
    },
    readings: currentStarterReadings(s.readings),
    route:
      s.route &&
      !(
        (s.itemCatalogVersion !== 2 || s.journeyVersion !== 1) &&
        s.step === 2 &&
        !s.route.train
      )
        ? withStarterStorageInstructions(
            {
              ...s.route,
              instructions: s.route.instructions.map((text) =>
                text
                  .replace(
                    "current level, exact EXP and all four moves",
                    "current level and all four moves",
                  )
                  .replace("current EXP and moves", "current level and moves")
                  .replace(
                    "Heal, check the new level and moves, then update EXP points below.",
                    "Heal and check the new level and moves.",
                  )
                  .replace(
                    "the current level and all four moves",
                    "all four current moves",
                  )
                  .replace("current level and moves", "current moves")
                  .replace("new level and moves", "current moves"),
              ),
            },
            !s.routeDone,
          )
        : null,
  });
}
export function battleEvs(entries: BattleEntry[]) {
  const evs = [0, 0, 0, 0, 0, 0];
  for (const entry of entries) {
    const row = yields.find((r) => r.id === entry.species);
    if (
      !row ||
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > 510 ||
      ![1, 2, 4].includes(entry.multiplier) ||
      (entry.level !== undefined &&
        (!Number.isInteger(entry.level) ||
          entry.level < 1 ||
          entry.level > 100)) ||
      (entry.trainer !== undefined && typeof entry.trainer !== "boolean")
    )
      throw Error("Enter valid defeated Pokémon and battle counts.");
    for (let battle = 0; battle < entry.count; battle++)
      row.evs.forEach((n, i) => {
        const room = 510 - evs.reduce((a, b) => a + b, 0);
        evs[i] += Math.min(n * entry.multiplier, 255 - evs[i], room);
      });
  }
  return evs;
}
/** Checklists record actual completed actions, never projected future EVs.
 * Stable battle IDs make unchecking/rechecking idempotent. */
export function checkStarterRoute(
  s: StarterGuideState,
  index: number,
  checked: boolean,
): StarterGuideState {
  const route = s.route;
  if (!route) return s;
  const action = route.actions?.find((action) => action.index === index);
  let battles = s.battles,
    moves = s.moves,
    usedTms = s.usedTms ?? [];
  if (action?.battles) {
    const ids = new Set(action.battles.map((battle) => battle.id));
    battles = checked
      ? [
          ...battles.map(
            (battle) =>
              action.battles!.find((next) => next.id === battle.id) ?? battle,
          ),
          ...action.battles.filter(
            (next) => !battles.some((battle) => battle.id === next.id),
          ),
        ]
      : battles.filter((battle) => !ids.has(battle.id));
  } else if (!route.actions && index === 0 && route.train) {
    const id = `planned-training-${route.facts.evs?.join("-")}`;
    battles = battles.filter((battle) => battle.id !== id);
    if (checked)
      battles = [
        ...battles,
        {
          id,
          species: route.train.species,
          count: route.train.count,
          multiplier: 1,
        },
      ];
  }
  if (action?.moves) {
    if (checked) moves = action.moves.slice();
    else if (JSON.stringify(moves) === JSON.stringify(action.moves))
      moves = action.beforeMoves?.slice() ?? moves;
  }
  if (action?.consumedItems && checked)
    usedTms = [...new Set([...usedTms, ...action.consumedItems])];
  return {
    ...s,
    battles,
    moves,
    usedTms,
    completedRouteSteps: recordStarterChecklist(s, index, checked),
    route: {
      ...route,
      done: route.done.map((done, i) => (i === index ? checked : done)),
    },
  };
}
export function readingSnapshots(readings: StarterReading[]): Snapshot[] {
  return currentStarterReadings(readings).map((r) => ({
    ...newSnapshot(r.id, "Earlier summary stats", { evs: r.evs }),
    summaryStats: r.summary,
  }));
}
export function starterIdentity(s: StarterGuideState): KnownFacts {
  return validateFacts({
    ...(s.identifiedStarter
      ? { pid: s.identifiedStarter.pid, ivs: s.identifiedStarter.ivs.slice() }
      : {}),
    species: s.species,
    ...(s.tid !== "" ? { tid: Number(s.tid) } : {}),
    ...(s.playerGender ? { otGender: s.playerGender } : {}),
    ...(s.nature !== "" ? { nature: Number(s.nature) } : {}),
    ...(s.gender !== "" ? { gender: s.gender as "male" | "female" } : {}),
    ability: Number(starterAbility(s.species)),
    metGame: 3,
    metLevel: 5,
    ball: 4,
    isEgg: 0,
  });
}
export function starterSettings(s: StarterGuideState): RngSettings {
  return {
    kind: "static",
    seed: 0,
    ...(s.identifiedStarter
      ? {
          minAdvance: s.identifiedStarter.advance,
          maxAdvance: s.identifiedStarter.advance,
        }
      : estimatedStarterWindow(s.starter)),
    methods: ["Method1"],
    areaId: "",
    lead: "none",
    synchronizeNature: 0,
  };
}
export function searchStarter(s: StarterGuideState) {
  if (!s.readings.length)
    throw Error("Record at least one summary-stat check.");
  return scanStaticSpreads(
    starterSettings(s),
    starterIdentity(s),
    readingSnapshots(s.readings),
  );
}
export function searchShinyStarters(s: StarterGuideState) {
  if (s.confirmedSid === null || !s.tid) throw Error("Confirm the SID first.");
  return scanStaticSpreads(
    { ...starterSettings(s), minAdvance: s.targetMin, maxAdvance: s.targetMax },
    {
      species: s.species,
      tid: Number(s.tid),
      sid: s.confirmedSid,
      shiny: true,
      metGame: 3,
      metLevel: 5,
    },
    [],
  );
}
export function nearbyStarters(s: StarterGuideState, radius = 10) {
  if (!s.selected) return [];
  return scanStaticSpreads(
    {
      ...starterSettings(s),
      minAdvance: Math.max(0, s.selected.advance - radius),
      maxAdvance: s.selected.advance + radius,
    },
    { species: s.species, metLevel: 5 },
    [],
  );
}
export function matchStarterAttempt(
  spreads: RngSpread[],
  species: number,
  facts: KnownFacts,
  summary: SummaryStats,
  evs: number[],
) {
  const data = speciesTraits(species)!;
  return spreads.filter(
    (e) =>
      (facts.nature === undefined || e.pid % 25 === facts.nature) &&
      (facts.gender === undefined ||
        genderForPid(species, e.pid) === facts.gender) &&
      (facts.ability === undefined ||
        data.abilities[e.abilitySlot].id === facts.ability) &&
      summaryMatchesSpread(species, e.pid, e.ivs, [
        {
          ...newSnapshot("attempt", "Attempt", { evs }),
          summaryStats: summary,
        },
      ]),
  );
}
export function guideSidCandidates(s: StarterGuideState) {
  return generateSidRng(Number(s.tid), estimatedSidWindow(s.intro)).map(
    (r) => r.sid,
  );
}
export function creationMoves(species: number) {
  const result: number[] = [];
  for (const [level, move] of (learnsets as Record<string, number[][]>)[
    species
  ] ?? [])
    if (level <= 5 && !result.includes(move)) {
      result.push(move);
      if (result.length > 4) result.shift();
    }
  return [...result, ...Array(4 - result.length).fill(0)];
}
