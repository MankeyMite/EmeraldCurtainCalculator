import type { StarterCatalogue } from "./starterCatalogue";
import { cataloguePreparation } from "./starterCatalogue";
import { scanStarterCatalogue } from "./starterCatalogueScan";
import {
  starterAbility,
  creationMoves,
  type StarterGuideState,
  type RouteSetup,
} from "./starterGuide";
import { starterTargetFrame, type StarterTiming } from "./starterTiming";
import { genderForPid } from "./traits";
import { starterJourney } from "./starterJourney";
import { preserveStarterChecklist } from "./starterChecklist";
import { starterAcquisitionSteps } from "./starterItems";
import { moveName } from "./moveLearningExperiments";
import type { RngSpread } from "./rng";

export function starterRecommendationKey(s: StarterGuideState) {
  return JSON.stringify([
    5,
    s.tid,
    s.playerGender ?? "",
    s.intro,
    s.starter.first,
    s.starter.offset + s.starter.calibration,
    s.starter.uncertainty,
  ]);
}
export type StarterPidRecommendation = {
  key: string;
  species: number;
  advance: number;
  timing: StarterTiming;
  fullSidCount: number;
  priorityCount: number;
  drawingChance: number;
  rows: {
    advance: number;
    pid: number;
    drawingOnly: number;
    withoutTraining: number;
    ambiguous: boolean;
  }[];
};

export function canSearchOptimalPid(tid: string) {
  return /^\d{1,5}$/.test(tid) && Number(tid) <= 65535;
}

export function savedStarterRecommendation(
  state: StarterGuideState,
): StarterPidRecommendation | null {
  const saved = state.starterRecommendation;
  return saved?.key === starterRecommendationKey(state) &&
    saved.rows &&
    saved.timing &&
    saved.fullSidCount !== undefined &&
    saved.priorityCount !== undefined &&
    saved.drawingChance !== undefined
    ? (saved as StarterPidRecommendation)
    : null;
}

/** Eleven consecutive possible landings; the real PID search stays unchanged. */
export function recommendStarter(
  catalogue: StarterCatalogue,
  state: StarterGuideState,
  progress?: (done: number, total: number) => void,
): StarterPidRecommendation {
  if (!canSearchOptimalPid(state.tid))
    throw Error("Enter a public TID from 0 to 65535 before searching.");
  if (state.starter.uncertainty < 5)
    throw Error(
      "A radius of at least ±5 advances is needed to recommend 11 starter PIDs.",
    );
  const scan = scanStarterCatalogue(
    catalogue,
    {
      tid: Number(state.tid),
      ...(state.playerGender ? { otGender: state.playerGender } : {}),
      intro: state.intro,
      starter: state.starter,
      expectedLandingRadius: 5,
    },
    progress,
  );
  const target = scan.recommended;
  if (!target)
    throw Error(
      "No complete 11-PID target fits the timing and search settings.",
    );
  const summary = (s: StarterCatalogue["spreads"][number]) =>
    `${s.pid % 25}/${genderForPid(target.species, s.pid)}/${s.level5Stats[target.species]}`;
  const summaries = catalogue.spreads
    .filter((s) => Math.abs(s.advance - target.advance) <= target.searchRadius)
    .map(summary);
  return {
    key: starterRecommendationKey(state),
    species: target.species,
    advance: target.advance,
    timing: { ...state.starter, second: target.secondCountdown },
    fullSidCount: scan.fullSidCount,
    priorityCount: scan.priority.length,
    drawingChance: target.expectedDrawingOnly,
    rows: scan.landings
      .filter(
        (r) =>
          r.species === target.species &&
          Math.abs(r.advance - target.advance) <= 5,
      )
      .map((row) => {
        const spread = catalogue.spreads.find(
          (s) => s.advance === row.advance,
        )!;
        return {
          advance: row.advance,
          pid: row.pid,
          drawingOnly: row.drawingOnly,
          withoutTraining: row.withoutTraining,
          ambiguous:
            summaries.filter((key) => key === summary(spread)).length !== 1,
        };
      }),
  };
}

export function applyStarterRecommendation(
  s: StarterGuideState,
  suggestion: StarterPidRecommendation,
  explicitSearch = false,
): StarterGuideState {
  if (suggestion.key !== starterRecommendationKey(s)) return s;
  // A returning player may already have a real starter and curtain evidence.
  if (
    (!(explicitSearch && s.step === 0) &&
      (s.step !== 1 || s.starterPart !== "timer")) ||
    s.readings.length ||
    s.identifiedStarter ||
    (!explicitSearch && s.starterRecommendation?.key === suggestion.key)
  )
    return s;
  return {
    ...s,
    species: suggestion.species,
    ability: starterAbility(suggestion.species),
    attemptAbility: starterAbility(suggestion.species),
    moves: creationMoves(suggestion.species),
    nature: "",
    gender: "",
    starter: suggestion.timing,
    route: null,
    starterRecommendation: structuredClone(suggestion),
  };
}

export function isRecommendedTimer(
  s: StarterGuideState,
  suggestion: StarterPidRecommendation,
) {
  return (
    s.species === suggestion.species &&
    starterTargetFrame(s.starter) === suggestion.advance
  );
}

/** Use the same exact preparation that was scored, only before the modeled trip.
 * Extra/changed battles and existing Rustboro checkpoints use the actual-state planner. */
export function catalogueStarterRoute(
  catalogue: StarterCatalogue,
  s: StarterGuideState,
  hit: RngSpread,
): RouteSetup | null {
  if (
    !s.starterRecommendation ||
    s.starterRecommendation.key !== starterRecommendationKey(s) ||
    s.routeDone ||
    !s.evsKnown ||
    s.battles.length !== 1 ||
    s.battles[0].id !== "birch" ||
    s.battles[0].species !== 288 ||
    s.battles[0].count !== 1 ||
    s.battles[0].multiplier !== 1 ||
    (s.usedTms?.length ?? 0) > 0
  )
    return null;
  const spread = catalogue.spreads.find(
    (row) =>
      row.advance === hit.advance &&
      row.pid === hit.pid &&
      row.ivs.join() === hit.ivs.join(),
  );
  if (!spread) return null;
  const scan = scanStarterCatalogue(
    { ...catalogue, spreads: [spread] },
    {
      tid: Number(s.tid),
      intro: s.intro,
      starter: s.starter,
      ...(s.playerGender ? { otGender: s.playerGender } : {}),
    },
  );
  const winner = scan.landings.find((row) => row.species === s.species)!;
  const prep = catalogue.preparations[winner.option.preparation];
  const prepared = cataloguePreparation(catalogue, spread, winner.option);
  const steps: {
    text: string;
    battles?: typeof prep.battles;
    acquiredItems?: number[];
    order: number;
  }[] = [];
  const journey = starterJourney(s.species);
  for (const battle of prep.battles.filter((b) => b.id !== "birch")) {
    const step = journey.find((step) =>
      step.battles.some((b) => b.id === battle.id),
    );
    steps.push({
      text:
        step?.text ??
        (battle.id === "journey-lyle"
          ? "Fight Bug Catcher Lyle's four level-3 Wurmple in Petalburg Woods with only the starter (+4 HP EVs)."
          : `After the forest trainers, defeat exactly ${battle.count} level-${battle.level} Wurmple in Petalburg Woods to reach level ${prep.level}; these add HP EVs only.`),
      battles: [battle],
      order:
        (
          {
            "journey-rival": 10,
            "journey-calvin": 20,
            "journey-lyle": 30,
            "journey-aqua": 40,
            "journey-james": 60,
          } as Record<string, number>
        )[battle.id] ?? 65,
    });
  }
  const items = [
    ...new Set([
      ...(winner.option.item ? [winner.option.item] : []),
      ...prep.consumedItems,
    ]),
  ];
  steps.push(...starterAcquisitionSteps(items));
  if (prep.facts.moves?.includes(15))
    steps.push({
      text: "Get HM01 Cut from Cutter's House in Rustboro; no badge is needed to teach it.",
      order: 87,
    });
  steps.sort((a, b) => a.order - b.order);
  const learning = prep.instructions.filter((t) =>
    /^(Learn |Decline )/.test(t),
  );
  const teaching = prep.instructions.filter((t) => t.startsWith("Teach "));
  const confirm = `Confirm the starter has these moves in this order: ${prep.facts.moves!.map((m) => (m ? moveName(m) : "empty")).join(" / ")}.`;
  const instructions = [
    "Avoid all wild battles and optional trainers except those listed. Check off each battle once; cancel evolution.",
    ...learning,
    ...steps.map((step) => step.text),
    ...teaching,
    confirm,
    "PC storage fully heals the starter and restores PP.",
    winner.option.item
      ? `Before depositing, give ${catalogue.items.find((item) => item.id === winner.option.item)!.name} to the starter.`
      : "Remove any held item before depositing the starter.",
    "Place the starter in Box 8, slot 5, with slots 4 and 6 empty. Leave and reenter Rustboro Trainer's School.",
  ];
  return preserveStarterChecklist(s, {
    itemPlanVersion: 2,
    facts: {
      ...prepared.facts,
      tid: Number(s.tid),
      ...(s.playerGender ? { otGender: s.playerGender } : {}),
    },
    instructions,
    items: winner.option.item ? [winner.option.item] : [],
    done: instructions.map(() => false),
    score: {
      total: scan.fullSidCount,
      expected: winner.expectedSurvivors,
      worstCase: winner.worstSurvivors,
    },
    actions: [
      ...steps.map((step) => ({
        index: instructions.indexOf(step.text),
        battles: step.battles,
        acquiredItems: step.acquiredItems,
      })),
      {
        index: instructions.indexOf(confirm),
        moves: prep.facts.moves!.slice(),
        beforeMoves: s.moves.slice(),
        consumedItems: prep.consumedItems.slice(),
      },
    ],
  });
}
