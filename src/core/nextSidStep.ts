import type { KnownFacts } from "./constraints";
import { scanWildSpreads, type RngSettings, type RngSpread } from "./rng";
import {
  newSpindaSidGuide,
  spindaInfoPlaintext,
  spindaRngEvidence,
} from "./spindaSidGuide";
import {
  sidCandidateMasks,
  usefulSpindaTargets,
  spindaUsefulness,
} from "./spindaUsefulness";
import { EXPERIMENT_SECONDS } from "./evTraining";
import type { ControlledAction } from "./controlledExperiments";
import { initialWildMoves } from "./consumableEffects";

let sampleCache: { key: string; encounters: RngSpread[] } | undefined;

/** A bounded, deterministic sample of future encounters. It only estimates
 * effort: these simulated outcomes are never observations or solver filters. */
export function estimateNextSpinda(
  settings: RngSettings,
  sids: number[],
  tested: number[],
  otGender?: KnownFacts["otGender"],
) {
  if (sids.length < 2 || settings.kind === "static") return null;
  const key = JSON.stringify(settings);
  if (sampleCache?.key !== key) {
    const all: RngSpread[] = [];
    const span = settings.maxAdvance - settings.minAdvance + 1;
    for (let n = 0; n < Math.min(16, Math.ceil(span / 8)); n++) {
      const min =
        settings.minAdvance +
        Math.floor((n * span) / Math.min(16, Math.ceil(span / 8)));
      all.push(
        ...scanWildSpreads(
          {
            ...settings,
            minAdvance: min,
            maxAdvance: Math.min(settings.maxAdvance, min + 7),
          },
          { species: 308 },
          [],
        ),
      );
    }
    const unique = [
      ...new Map(all.map((e) => [`${e.pid}/${e.ivs.join(",")}`, e])).values(),
    ];
    sampleCache = {
      key,
      encounters: Array.from(
        { length: Math.min(64, unique.length) },
        (_, n) =>
          unique[Math.floor((n * unique.length) / Math.min(64, unique.length))],
      ),
    };
  }
  const sample =
    sids.length <= 256
      ? sids
      : Array.from(
          { length: 256 },
          (_, n) => sids[Math.floor((n * sids.length) / 256)],
        );
  const masks = sidCandidateMasks(sids);
  let informationGain = 0;
  for (const encounter of sampleCache.encounters) {
    const candidate = { pid: encounter.pid, encounters: [encounter] };
    const ball = spindaUsefulness(candidate, masks, tested, otGender).ball;
    const guide = {
      ...newSpindaSidGuide(encounter.pid),
      freshZeros: true,
      paddingZero: true,
    };
    const info = spindaInfoPlaintext({
      species: 308,
      metGame: 3,
      metLevel: encounter.level,
      ball,
      otGender,
      ...initialWildMoves(308, encounter.level),
      ppBonuses: 0,
    });
    const rng = spindaRngEvidence(encounter.pid, candidate, info)!;
    const targets = usefulSpindaTargets(guide, masks, tested, info, rng.masks);
    const patterns = new Map<string, number>();
    for (const sid of sample) {
      const pattern = targets
        .map((t) =>
          ((sid >>> ((4 - t.digit) * 4)) & 15) === t.candidate ? "0" : "1",
        )
        .join("");
      patterns.set(pattern, (patterns.get(pattern) ?? 0) + 1);
    }
    informationGain += [...patterns.values()].reduce((sum, count) => {
      const p = count / sample.length;
      return sum - p * Math.log2(p);
    }, 0);
  }
  if (!sampleCache.encounters.length) return null;
  return {
    informationGain: informationGain / sampleCache.encounters.length,
    seconds: EXPERIMENT_SECONDS.catch,
    samples: sampleCache.encounters.length,
  };
}

export function experimentSeconds(action?: ControlledAction) {
  if (!action) return EXPERIMENT_SECONDS.item;
  if (action.training) return action.training.seconds;
  if (["vitamin", "candy", "pp", "pokeblock"].includes(action.kind))
    return 30 + 10 * (action.cost ?? 1);
  return 30 * (action.cost ?? 1);
}

export function compareSidSteps(
  a: { informationGain: number; seconds: number; lastResort?: boolean },
  b: { informationGain: number; seconds: number; lastResort?: boolean },
) {
  // Long training remains available, but useful ordinary tests and catches win.
  return (
    Number(!!a.lastResort) - Number(!!b.lastResort) ||
    b.informationGain / b.seconds - a.informationGain / a.seconds ||
    a.seconds - b.seconds
  );
}

export function effortLabel(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${Number((seconds / 60).toFixed(1))} min`;
}
