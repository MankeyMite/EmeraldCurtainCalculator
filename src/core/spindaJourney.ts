import { initialWildMoves } from "./consumableEffects";
import type { ControlledAction } from "./controlledExperiments";
import { experimentSeconds } from "./nextSidStep";
import type { SpindaCandidate, SpindaMatch } from "./spindaMatcher";
import { newSpindaSidGuide, spindaInfoPlaintext } from "./spindaSidGuide";
import {
  sidCandidateMasks,
  usefulSpindaTargets,
  spindaTrainerFacts,
} from "./spindaUsefulness";
import type { KnownFacts } from "./constraints";
import {
  freshCapturePreset,
  wildStoragePreset,
  newPokemonFacts,
} from "./facts";
import { isActiveAssumption, validateFacts } from "./session";

export const SPINDA_JOURNEY_STEPS = [
  "prepare",
  "draw",
  "match",
  "catch",
  "stats",
  "information",
  "moves",
  "details",
  "pixels",
  "plan",
  "experiment",
  "restore",
] as const;
export type SpindaJourneyStep = (typeof SPINDA_JOURNEY_STEPS)[number];
export type SpindaJourneyState = {
  step: SpindaJourneyStep;
  language?: number;
  ball: number;
  patternDrawn?: boolean;
  matchedPid?: number;
  caught?: boolean;
  informationComplete?: boolean;
  iron: number;
  carbos: number;
  shoppingSeconds: number;
  restore?: string;
  ballChosen?: boolean;
};
export const newSpindaJourney = (): SpindaJourneyState => ({
  step: "prepare",
  language: 2,
  ball: 4,
  iron: 0,
  carbos: 0,
  shoppingSeconds: 180,
  patternDrawn: false,
  caught: false,
});
export function validateSpindaJourney(
  v: SpindaJourneyState,
): SpindaJourneyState {
  if (v && (v.step as string) === "encounter")
    v = { ...v, step: "draw", patternDrawn: false, caught: false };
  if (
    !v ||
    !SPINDA_JOURNEY_STEPS.includes(v.step) ||
    (v.language !== undefined && ![1, 2, 3, 4, 5, 7].includes(v.language)) ||
    !Number.isInteger(v.ball) ||
    v.ball < 1 ||
    v.ball > 12 ||
    [v.iron, v.carbos].some((n) => !Number.isInteger(n) || n < 0 || n > 99) ||
    !Number.isFinite(v.shoppingSeconds) ||
    v.shoppingSeconds < 0 ||
    v.shoppingSeconds > 3600 ||
    (v.patternDrawn !== undefined && typeof v.patternDrawn !== "boolean") ||
    (v.caught !== undefined && typeof v.caught !== "boolean") ||
    (v.informationComplete !== undefined &&
      typeof v.informationComplete !== "boolean") ||
    (v.matchedPid !== undefined &&
      (!Number.isInteger(v.matchedPid) ||
        v.matchedPid < 0 ||
        v.matchedPid > 0xffffffff)) ||
    (v.restore !== undefined &&
      (typeof v.restore !== "string" || v.restore.length > 4000)) ||
    (v.ballChosen !== undefined && typeof v.ballChosen !== "boolean")
  )
    throw Error("Invalid Spinda guide progress");
  const { elapsed: _elapsed, ...saved } = v as SpindaJourneyState & {
    elapsed?: number;
  };
  const caught = saved.caught ?? false;
  return {
    ...saved,
    caught,
    ...(saved.step === "catch" && saved.matchedPid === undefined && !caught
      ? { step: "draw" as const, patternDrawn: false }
      : {}),
  };
}

/** A PID or pixel-guide object is not evidence that setup pages were completed. */
export function spindaSetupPage(
  journey: SpindaJourneyState,
): SpindaJourneyStep {
  if (!journey.patternDrawn) return "draw";
  if (journey.matchedPid === undefined) return "match";
  if (!journey.caught) return "catch";
  if (!journey.informationComplete) return "information";
  return "pixels";
}

/** Repair skipped setup on old saves without discarding their facts or answers. */
export function spindaJourneyPage(
  journey: SpindaJourneyState,
): SpindaJourneyStep {
  if (["pixels", "plan", "experiment", "restore"].includes(journey.step)) {
    const setup = spindaSetupPage(journey);
    if (setup !== "pixels") return setup;
  }
  if (journey.step === "match" && !journey.patternDrawn) return "draw";
  if (journey.step === "catch") {
    if (!journey.patternDrawn) return "draw";
    if (journey.matchedPid === undefined) return "match";
  }
  return journey.step;
}

export function confirmedSpindaPidJourney(
  journey: SpindaJourneyState,
  pid: number,
  confirmCatch = false,
): SpindaJourneyState {
  const next = {
    ...journey,
    matchedPid: pid,
    caught: journey.caught === true || confirmCatch,
  };
  return { ...next, step: spindaSetupPage(next) };
}

/** Viewing location follows the selected game language. */
export function spindaStoragePlacement(language = 2) {
  return language === 1
    ? { box: 7, slot: 27, priorSlots: "1–26" }
    : { box: 8, slot: 5, priorSlots: "1–4" };
}

/** Emerald's GiveMonInitialMoveset retains the last four distinct learned moves. */
export function spindaCatchMoves(level: number) {
  return initialWildMoves(308, level);
}

export function newSpindaCaptureFacts(
  trainer: KnownFacts,
  ball: number,
  level: number,
  language = 2,
  pid?: number,
): KnownFacts {
  const defaults = freshCapturePreset(
    wildStoragePreset({
      ...newPokemonFacts(),
      species: 308,
      metGame: 3,
      isEgg: 0,
      language,
      ...(language === 2 ? { nickname: "SPINDA" } : {}),
      shiny: false,
    }),
  );
  const capture: KnownFacts = {
    ...defaults,
    ...spindaTrainerFacts(trainer),
    ...spindaCatchMoves(level),
    species: 308,
    ball,
    metLevel: level,
    assumed: [
      ...new Set([
        ...(defaults.assumed ?? []),
        ...(language === 2 ? ["nickname"] : []),
      ]),
    ],
    ...(pid === undefined ? {} : { pid }),
  };
  // The learnset replaces the empty-move defaults; their old zero labels no
  // longer describe this catch and would block subsequent form validation.
  capture.assumed = capture.assumed?.filter((key) =>
    isActiveAssumption(capture, key),
  );
  return validateFacts(capture);
}

/** These are observed traits, rather than traits inferred from the old PID. */
export function spindaObservedTraits(facts: KnownFacts) {
  return {
    nature: facts.nature,
    gender:
      facts.gender === "male" || facts.gender === "female"
        ? facts.gender
        : undefined,
    level:
      facts.metLevel !== undefined &&
      facts.metLevel >= 1 &&
      facts.metLevel <= 100
        ? facts.metLevel
        : undefined,
  };
}

/** The worker has ranked these against the player's painted spots. */
export function paintedSpindaShortlist(candidates: SpindaMatch[]) {
  return candidates.slice(0, 4);
}
export function spindaSpreadCount(candidate?: SpindaCandidate) {
  return new Set(
    candidate?.encounters.map((e) => `${e.ivs.join()}/${e.abilitySlot}`),
  ).size;
}

export type JourneyExperiment = {
  id: string;
  name: string;
  informationGain: number;
  seconds: number;
  action?: ControlledAction;
  item?: number;
};
export type VitaminRoute = {
  actions: JourneyExperiment[];
  iron: number;
  carbos: number;
  buyIron: number;
  buyCarbos: number;
  informationGain: number;
  seconds: number;
  digits: number[];
  unresolvedGroups: number;
};
const entropy = (groups: number[], total: number) =>
  groups.reduce((sum, count) => {
    const p = count / total;
    return sum - p * Math.log2(p);
  }, 0);

/** Price the whole useful vitamin portfolio, including a shopping trip. Outcomes
 * are exact SID-digit equality tests, not an arbitrary "N known digits" cutoff.
 * Reloading the baseline lets the same stock serve every checkpoint. */
export function planSpindaVitamins(
  pid: number,
  sids: number[],
  facts: KnownFacts,
  experiments: JourneyExperiment[],
  stock: Pick<SpindaJourneyState, "iron" | "carbos" | "shoppingSeconds">,
): VitaminRoute | undefined {
  if (sids.length < 2) return;
  const guide = newSpindaSidGuide(pid),
    masks = sidCandidateMasks(sids);
  const options = experiments.flatMap((e) => {
    const a = e.action;
    if (
      !a ||
      (a.kind !== "vitamin" && !(a.training?.vitamins && !a.training.battles))
    )
      return [];
    if (!a.changes.evs || !facts.evs) return [];
    const changed = a.changes.evs.flatMap((v, i) =>
      v !== facts.evs![i] ? [i] : [],
    );
    if (changed.length !== 1 || ![2, 3].includes(changed[0])) return [];
    const targets = usefulSpindaTargets(
      guide,
      masks,
      [0, 0, 0, 0],
      spindaInfoPlaintext({ ...facts, ...a.changes, species: 308 }),
    );
    const relevant = targets.filter(
      (t) => t.field === (changed[0] === 2 ? "Defense EV" : "Speed EV"),
    );
    return relevant.length
      ? [
          {
            e,
            stat: changed[0],
            dose: a.training?.vitamins ?? 1,
            targets: relevant,
          },
        ]
      : [];
  });
  let partitions = [sids],
    gain = 0;
  const selected: typeof options = [];
  const remaining = options.slice();
  let bestRoute: VitaminRoute | undefined;
  while (remaining.length) {
    const rank = remaining
      .map((o) => {
        const split = partitions.flatMap((group) => {
          const buckets = new Map<string, number[]>();
          for (const sid of group) {
            const key = o.targets
              .map((t) =>
                Number(((sid >>> ((4 - t.digit) * 4)) & 15) === t.candidate),
              )
              .join("");
            const bucket = buckets.get(key) ?? [];
            bucket.push(sid);
            buckets.set(key, bucket);
          }
          return [...buckets.values()];
        });
        const bits =
          entropy(
            split.map((p) => p.length),
            sids.length,
          ) - gain;
        return { o, split, bits };
      })
      .filter((r) => r.bits > 1e-9);
    // Compare directly to avoid a tie depending on catalogue order.
    rank.sort(
      (a, b) =>
        b.bits / b.o.e.seconds - a.bits / a.o.e.seconds || a.o.dose - b.o.dose,
    );
    if (!rank.length) break;
    const best = rank[0];
    selected.push(best.o);
    partitions = best.split;
    gain += best.bits;
    remaining.splice(remaining.indexOf(best.o), 1);
    // A costly final checkpoint must not hide a faster useful prefix.
    const iron = Math.max(
      0,
      ...selected.filter((o) => o.stat === 2).map((o) => o.dose),
    );
    const carbos = Math.max(
      0,
      ...selected.filter((o) => o.stat === 3).map((o) => o.dose),
    );
    const buyIron = Math.max(0, iron - stock.iron),
      buyCarbos = Math.max(0, carbos - stock.carbos);
    const route: VitaminRoute = {
      actions: selected.map((o) => o.e),
      iron,
      carbos,
      buyIron,
      buyCarbos,
      informationGain: gain,
      seconds:
        selected.reduce((n, o) => n + experimentSeconds(o.e.action), 0) +
        (buyIron || buyCarbos ? stock.shoppingSeconds : 0),
      digits: [
        ...new Set(selected.flatMap((o) => o.targets.map((t) => t.digit))),
      ].sort(),
      unresolvedGroups: partitions.filter((p) => p.length > 1).length,
    };
    if (
      !bestRoute ||
      route.informationGain / Math.max(1, route.seconds) >
        bestRoute.informationGain / Math.max(1, bestRoute.seconds)
    )
      bestRoute = route;
  }
  return bestRoute;
}

export function chooseSpindaRoute(
  experiments: JourneyExperiment[],
  vitamins: VitaminRoute | undefined,
  nextCatch?: { informationGain: number; seconds: number } | null,
) {
  const options = experiments
    .filter(
      (e) =>
        e.informationGain > 0 &&
        !e.action?.training?.lastResort &&
        e.action?.kind !== "vitamin" &&
        !e.action?.training?.vitamins,
    )
    .map((e) => ({
      kind: "experiment" as const,
      experiment: e,
      informationGain: e.informationGain,
      seconds: e.seconds,
    }));
  const choices = [
    ...options,
    ...(vitamins
      ? [
          {
            kind: "vitamins" as const,
            informationGain: vitamins.informationGain,
            seconds: vitamins.seconds,
          },
        ]
      : []),
    ...(nextCatch && nextCatch.informationGain > 0
      ? [{ kind: "catch" as const, ...nextCatch }]
      : []),
  ];
  return choices.sort(
    (a, b) =>
      b.informationGain / Math.max(1, b.seconds) -
      a.informationGain / Math.max(1, a.seconds),
  )[0];
}

export function vitaminShoppingBreakEven(
  route: VitaminRoute,
  nextCatch: { informationGain: number; seconds: number },
  shoppingSeconds: number,
) {
  if (nextCatch.informationGain <= 0) return Infinity;
  const testingSeconds =
    route.seconds - (route.buyIron || route.buyCarbos ? shoppingSeconds : 0);
  return (
    (route.informationGain * nextCatch.seconds) / nextCatch.informationGain -
    testingSeconds
  );
}
