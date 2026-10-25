import {
  scanWildSpreads,
  validateRngSettings,
  WILD_AREAS,
  WILD_METHODS,
  type RngSettings,
  type RngSpread,
} from "./rng";
import {
  SPINDA_SPECIES,
  spindaPattern,
  tolerantMask,
  SPINDA_REGION_INDICES,
} from "./spinda";
import {
  validateSpindaSidGuide,
  type SpindaSidGuideState,
} from "./spindaSidGuide";
import type { KnownFacts } from "./constraints";
import type { SpindaSidProgress } from "./spindaUsefulness";

/** Called only after explicit transfer confirmation. Never relabel another species. */
export function spindaEstimatedFacts(
  facts: KnownFacts,
  pid: number,
): KnownFacts | undefined {
  if (
    !Number.isInteger(pid) ||
    pid < 0 ||
    pid > 0xffffffff ||
    (facts.species !== undefined && facts.species !== SPINDA_SPECIES)
  )
    return undefined;
  return { ...facts, species: SPINDA_SPECIES, pid };
}

export const SPINDA_AREAS = WILD_AREAS.filter((a) =>
  a.slots.some((s) => s.species === SPINDA_SPECIES),
);
export type SpindaMatcherState = {
  pid: number;
  settings: RngSettings;
  level?: number;
  nature?: number;
  gender?: "male" | "female";
  shortlist: number[]; // Advisory only, never solver evidence.
  appliedPid?: number; // PID confirmed by the player.
  guide?: SpindaSidGuideState; // Current catch; completed SID evidence is carried in sidProgress.
  sidProgress?: SpindaSidProgress;
};
export function defaultSpindaMatcher(): SpindaMatcherState {
  return {
    pid: 0x88888888,
    settings: {
      kind: "wild",
      seed: 0,
      minAdvance: 0,
      maxAdvance: 3000,
      methods: [...WILD_METHODS],
      areaId: SPINDA_AREAS.find(
        (a) => a.id.includes("ROUTE113") && a.kind === "land",
      )!.id,
      lead: "none",
      synchronizeNature: 0,
    },
    shortlist: [],
  };
}
export function validateSpindaMatcher(value: unknown): SpindaMatcherState {
  if (!value || typeof value !== "object")
    throw Error("Invalid Spinda matcher");
  const v = value as SpindaMatcherState;
  const pid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (
    !pid(v.pid) ||
    !Array.isArray(v.shortlist) ||
    v.shortlist.length > 5000 ||
    !v.shortlist.every(pid) ||
    (v.appliedPid !== undefined && !pid(v.appliedPid))
  )
    throw Error("Invalid Spinda PID list");
  const settings = validateRngSettings(v.settings);
  if (
    settings.kind === "static" ||
    !SPINDA_AREAS.some((a) => a.id === settings.areaId)
  )
    throw Error("Choose a wild Spinda encounter area");
  if (
    v.level !== undefined &&
    (!Number.isInteger(v.level) || v.level < 1 || v.level > 100)
  )
    throw Error("Encounter level must be 1–100 or blank");
  if (
    v.nature !== undefined &&
    (!Number.isInteger(v.nature) || v.nature < 0 || v.nature > 24)
  )
    throw Error("Invalid Spinda nature");
  if (v.gender !== undefined && !["male", "female"].includes(v.gender))
    throw Error("Invalid Spinda gender");
  if (
    v.sidProgress &&
    (!Array.isArray(v.sidProgress.tested) ||
      v.sidProgress.tested.length !== 4 ||
      v.sidProgress.tested.some(
        (m) => !Number.isInteger(m) || m < 0 || m > 65535,
      ) ||
      (v.sidProgress.remainingSids !== undefined &&
        (!Array.isArray(v.sidProgress.remainingSids) ||
          v.sidProgress.remainingSids.length > 65536 ||
          v.sidProgress.remainingSids.some(
            (s) => !Number.isInteger(s) || s < 0 || s > 65535,
          ))))
  )
    throw Error("Invalid Spinda SID progress");
  return {
    pid: v.pid,
    settings,
    shortlist: [...new Set(v.shortlist)],
    ...(v.level === undefined ? {} : { level: v.level }),
    ...(v.nature === undefined ? {} : { nature: v.nature }),
    ...(v.gender === undefined ? {} : { gender: v.gender }),
    ...(v.appliedPid === undefined ? {} : { appliedPid: v.appliedPid }),
    ...(v.guide === undefined
      ? {}
      : { guide: validateSpindaSidGuide(v.guide) }),
    ...(v.sidProgress
      ? {
          sidProgress: {
            tested: v.sidProgress.tested.slice(),
            ...(v.sidProgress.remainingSids
              ? { remainingSids: [...new Set(v.sidProgress.remainingSids)] }
              : {}),
          },
        }
      : {}),
  };
}
export type SpindaCandidate = { pid: number; encounters: RngSpread[] };

/** Same wild generator, empty snapshots and no trainer/IV/caught-data input.
 * The optional occurrence sink records exact advance/method/slot/level links
 * before the established spread deduplication discards that information. */
export function generateSpindaCandidates(
  state: SpindaMatcherState,
  progress?: (done: number, total: number) => void,
) {
  const v = validateSpindaMatcher(state),
    found = new Map<number, SpindaCandidate>();
  scanWildSpreads(
    v.settings,
    {
      species: SPINDA_SPECIES,
      ...(v.level === undefined ? {} : { metLevel: v.level }),
      ...(v.nature === undefined ? {} : { nature: v.nature }),
      ...(v.gender === undefined ? {} : { gender: v.gender }),
    },
    [],
    progress,
    (spread) => {
      const candidate = found.get(spread.pid) ?? {
        pid: spread.pid,
        encounters: [],
      };
      candidate.encounters.push(spread);
      found.set(spread.pid, candidate);
    },
  );
  return [...found.values()];
}
export type PreparedSpinda = {
  candidate: SpindaCandidate;
  pattern: Uint8Array;
  near: Uint8Array;
  size: number;
  signature: string;
};
export function prepareSpindaCandidates(
  candidates: SpindaCandidate[],
): PreparedSpinda[] {
  return candidates.map((candidate) => {
    const pattern = spindaPattern(candidate.pid);
    return {
      candidate,
      pattern,
      near: tolerantMask(pattern),
      size: pattern.reduce((a, b) => a + b, 0),
      signature: SPINDA_REGION_INDICES.filter((n) => pattern[n]).join(","),
    };
  });
}
export function rankSpindaCandidates(
  prepared: PreparedSpinda[],
  target: ArrayLike<number>,
) {
  const near = tolerantMask(target),
    indices = SPINDA_REGION_INDICES.filter((n) => target[n]),
    identical = new Map<string, number>();
  for (const p of prepared)
    identical.set(p.signature, (identical.get(p.signature) ?? 0) + 1);
  return prepared
    .map((p) => {
      let exact = 0,
        nearA = 0,
        nearB = 0;
      for (const n of indices) {
        if (p.pattern[n]) exact++;
        if (p.near[n]) nearA++;
      }
      for (const n of SPINDA_REGION_INDICES)
        if (p.pattern[n] && near[n]) nearB++;
      const sum = indices.length + p.size;
      return {
        ...p.candidate,
        score: sum
          ? (100 * (0.65 * 2 * exact + 0.35 * (nearA + nearB))) / sum
          : 100,
        identicalPatterns: identical.get(p.signature)!,
      };
    })
    .sort((a, b) => b.score - a.score || a.pid - b.pid);
}
export type SpindaMatch = ReturnType<typeof rankSpindaCandidates>[number];
