import { generateSidRng } from "./sidRng";
import {
  estimatedSidWindow,
  estimatedStarterWindow,
  targetCountdown,
  EMERALD_FPS,
  type StarterTiming,
} from "./starterTiming";
import { STARTERS } from "./starterGuide";
import { genderForPid } from "./traits";
import type {
  StarterCatalogue,
  CatalogueOption,
  CatalogueSpread,
  SidTestMasks,
} from "./starterCatalogue";

export type CatalogueScanInput = {
  tid: number;
  intro: StarterTiming;
  starter: StarterTiming;
  remainingSids?: number[];
  expectedLandingRadius?: number; // Scoring assumption only; never narrows PID search.
};
export type CatalogueLanding = {
  advance: number;
  pid: number;
  species: number;
  option: CatalogueOption;
  drawingOnly: number;
  coverageBits: number;
  fullDrawingOnly: number;
  expectedSurvivors: number;
  worstSurvivors: number;
  priorityExpectedSurvivors: number;
  withoutTraining: number;
  withoutTrainingBits: number;
  shortTraining: number;
  shortTrainingBits: number;
  evCap: number;
  evEffort: number;
};
export type CatalogueTarget = {
  species: number;
  advance: number;
  secondCountdown: number;
  radius: number;
  searchRadius: number;
  expectedDrawingOnly: number;
  expectedWithoutTraining: number;
  expectedRemaining: number;
  worstDrawingOnly: number;
  priorityCount: number;
  evaluatedLandings: number;
  ambiguousLandings: number;
  averagePreparationSeconds: number;
  perfectCluster: { minAdvance: number; maxAdvance: number } | null;
  centre: CatalogueLanding;
  ranking: {
    centreEvCap: number;
    nearEvCap: number;
    nearEvEffort: number;
    centreShort: number;
    nearShort: number;
    centreEasy: number;
    nearEasy: number;
    centreDrawing: number;
    weightedDrawing: number;
    weightedShort: number;
    weightedEasy: number;
  };
};
export type CatalogueScan = {
  targetSidAdvance: number;
  fullSidCount: number;
  priority: { advance: number; sid: number }[];
  sidWeights: number[];
  assumptions: string[];
  targets: CatalogueTarget[];
  recommended: CatalogueTarget | null;
  landings: CatalogueLanding[];
  evaluatedSetups: number;
};

function signature(key: number, m: SidTestMasks) {
  const a = key & 15,
    b = (key >>> 4) & 15,
    c = (key >>> 8) & 15,
    d = key >>> 12;
  return (
    (m[0] & (1 << a) ? a : 16) |
    ((m[1] & (1 << b) ? b : 16) << 5) |
    ((m[2] & (1 << c) ? c : 16) << 10) |
    ((m[3] & (1 << d) ? d : 16) << 15)
  );
}

/** Raw plaintext and SID candidate masks are equivalent after XORing every
 * candidate with the PID upper word. Use that bijection to avoid regenerating
 * plaintext or transforming 16-bit masks for every recipe at runtime. */
export function catalogueCandidateMasks(
  spread: CatalogueSpread,
  option: CatalogueOption,
): SidTestMasks {
  return option.plaintextMasks.map((mask, digit) => {
    let tests = spread.baseMasks[digit];
    const pid = (spread.pid >>> ((digit + 4) * 4)) & 15;
    for (let value = 0; value < 16; value++)
      if (mask & (1 << value)) tests |= 1 << (value ^ pid);
    return tests;
  }) as SidTestMasks;
}

/** Each preparation is selected once for a PID/species against the complete
 * candidate pool. No true SID or simulated curtain answer is an input. */
export function scanStarterCatalogue(
  catalogue: StarterCatalogue,
  input: CatalogueScanInput,
  progress?: (done: number, total: number) => void,
): CatalogueScan {
  if (!Number.isInteger(input.tid) || input.tid < 0 || input.tid > 65535)
    throw Error("Enter a public TID from 0 to 65535.");
  const window = estimatedSidWindow(input.intro);
  const center = Math.max(
    1,
    Math.round(input.intro.second * EMERALD_FPS) +
      input.intro.offset +
      input.intro.calibration,
  );
  const kept = input.remainingSids && new Set(input.remainingSids);
  const sidRows = generateSidRng(input.tid, window).filter(
    (row) => !kept || kept.has(row.sid),
  );
  if (!sidRows.length || sidRows.length > 4096)
    throw Error(
      "Catalogue scans require 1–4096 remaining SIDs; the full window is never sampled down.",
    );
  const full = sidRows.map((row) => row.sid);
  const priority = sidRows
    .flatMap((row) =>
      row.advances
        .filter((a) => Math.abs(a - center) <= 9)
        .map((advance) => ({ advance, sid: row.sid })),
    )
    .sort((a, b) => a.advance - b.advance);
  if (!priority.length)
    throw Error(
      "No surviving SID occurs in the prioritised ±9-advance window.",
    );
  const sidWeights = priority.map((row) => 10 - Math.abs(row.advance - center));
  const priorityIndices = priority.map((row) => full.indexOf(row.sid));
  // Signature digits are 0–16, packed into 20 bits. Epochs avoid allocating a
  // million-entry array or Map anew for each evaluated setup.
  const counts = new Uint16Array(1 << 20),
    epochs = new Uint32Array(1 << 20),
    patterns = new Uint32Array(full.length);
  let epoch = 0,
    evaluatedSetups = 0;
  const landings: CatalogueLanding[] = [];
  const evaluate = (keys: Uint16Array, masks: SidTestMasks) => {
    epoch++;
    evaluatedSetups++;
    let unique = 0,
      squares = 0,
      worst = 0;
    for (let n = 0; n < keys.length; n++) {
      const key = signature(keys[n], masks);
      patterns[n] = key;
      const before = epochs[key] === epoch ? counts[key] : 0;
      epochs[key] = epoch;
      counts[key] = before + 1;
      unique += before === 0 ? 1 : before === 1 ? -1 : 0;
      squares += 2 * before + 1;
      worst = Math.max(worst, before + 1);
    }
    let drawingOnly = 0,
      coverageBits = 0,
      weightedCoverage = 0;
    priorityIndices.forEach((index, n) => {
      if (counts[patterns[index]] === 1) {
        drawingOnly++;
        coverageBits |= 1 << n;
        weightedCoverage += sidWeights[n];
      }
    });
    return {
      drawingOnly,
      coverageBits,
      weightedCoverage,
      fullDrawingOnly: unique,
      expectedSurvivors: squares / full.length,
      worstSurvivors: worst,
      priorityExpectedSurvivors:
        priorityIndices.reduce(
          (sum, index) => sum + counts[patterns[index]],
          0,
        ) / priorityIndices.length,
    };
  };
  const futureKeys = catalogue.preparations.map((p) =>
    [
      p.withoutTrainingMasks,
      p.shortTrainingMasks,
      ...p.trainingMasks.map((t) => t.masks),
    ]
      .map((m) => m.join())
      .join("/"),
  );
  for (let row = 0; row < catalogue.spreads.length; row++) {
    const spread = catalogue.spreads[row],
      upper = spread.pid >>> 16;
    const keys = Uint16Array.from(full, (sid) => sid ^ upper);
    const fixed = [0, 1, 2, 3].map(
      (n) =>
        (1 << ((upper >>> (n * 4)) & 15)) |
        (1 << spread.ivTests.find((t) => t.position === 4 - n)!.plaintext),
    ) as SidTestMasks;
    const outcomes = new Map<string, ReturnType<typeof evaluate>>();
    const outcome = (raw: SidTestMasks) => {
      const masks = raw.map((m, n) => m | fixed[n]) as SidTestMasks,
        key = masks.join();
      let found = outcomes.get(key);
      if (!found) {
        found = evaluate(keys, masks);
        outcomes.set(key, found);
      }
      return found;
    };
    const futureOutcomes = new Map<
      string,
      {
        easy: ReturnType<typeof evaluate>;
        short: ReturnType<typeof evaluate>;
        evCap: number;
        evEffort: number;
      }
    >();
    for (const species of STARTERS) {
      let best: CatalogueLanding | null = null;
      let bestScores: number[] = [];
      for (const option of catalogue.options[species]) {
        const prep = catalogue.preparations[option.preparation];
        const drawing = outcome(option.plaintextMasks);
        let future = futureOutcomes.get(futureKeys[prep.id]);
        if (!future) {
          const easy = outcome(prep.withoutTrainingMasks),
            short = outcome(prep.shortTrainingMasks);
          const budgets = [
            { cap: 0, result: easy },
            { cap: 10, result: short },
            ...prep.trainingMasks.map((t) => ({
              cap: t.cap,
              result: outcome(t.masks),
            })),
          ];
          const effort = priorityIndices.map(
            (_, n) =>
              budgets.find((b) => b.result.coverageBits & (1 << n))?.cap ?? 240,
          );
          const evCap = Math.max(...effort),
            evEffort =
              effort.reduce((sum, cap, n) => sum + cap * sidWeights[n], 0) /
              sidWeights.reduce((a, b) => a + b, 0);
          future = { easy, short, evCap, evEffort };
          futureOutcomes.set(futureKeys[prep.id], future);
        }
        const { easy, short, evCap, evEffort } = future;
        const scores = [
          -evCap,
          -evEffort,
          short.weightedCoverage,
          easy.weightedCoverage,
          drawing.weightedCoverage,
          short.drawingOnly,
          easy.drawingOnly,
          drawing.drawingOnly,
          -option.seconds,
          -drawing.priorityExpectedSurvivors,
        ];
        const difference =
          scores
            .map((value, n) => value - (bestScores[n] ?? 0))
            .find((value) => value !== 0) ?? 0;
        if (!best || difference > 0) {
          bestScores = scores;
          best = {
            advance: spread.advance,
            pid: spread.pid,
            species,
            option,
            ...drawing,
            withoutTraining: easy.drawingOnly,
            withoutTrainingBits: easy.coverageBits,
            shortTraining: short.drawingOnly,
            shortTrainingBits: short.coverageBits,
            evCap,
            evEffort,
          };
        }
      }
      if (!best)
        throw Error("Catalogue has no supported preparation for this starter.");
      landings.push(best);
    }
    if (row % 16 === 0 || row === catalogue.spreads.length - 1)
      progress?.(row + 1, catalogue.spreads.length);
  }
  const targets = rankCatalogueTargets(
    catalogue,
    landings,
    input.starter,
    priority.length,
    input.expectedLandingRadius,
    sidWeights,
  );
  const radius =
    input.expectedLandingRadius ?? Math.min(input.starter.uncertainty, 100);
  return {
    targetSidAdvance: center,
    fullSidCount: full.length,
    priority,
    sidWeights,
    targets,
    recommended: targets[0] ?? null,
    landings,
    evaluatedSetups,
    assumptions: [
      "Triangular planning weights favour SID-generating advances near estimated target ±9; this is a planning assumption, not a measured probability.",
      `The exact starter target and errors within +/-3 advances take priority; outer rows through +/-${radius} have lower weight. PID search retains +/-${Math.min(input.starter.uncertainty, 100)} advances.`,
      "Every prioritised SID is compared with the entire surviving SID window.",
      "One held item and one legal preparation per landed PID; no true SID is supplied to route selection.",
      "A level-5 summary that matches multiple in-window PIDs counts as a retry, not drawing-only success.",
      "Avoid experiments beyond 10 Defense/Speed EVs at the exact target and within +/-3 advances first; then favour item/move recovery and drawing-only outcomes. Outer rows have less weight.",
      "Lyle and James are fought; extra HP-only battles are permitted solely to learn an early move, never to tune Defense or Speed.",
      "Known singleton plaintext only; unknown fields and checksum correlations can improve real results beyond this conservative score.",
    ],
  };
}

/** Re-score timing confidence without rerunning the recipe search. The wider
 * actual PID search still determines whether summary stats identify a landing. */
export function rankCatalogueTargets(
  catalogue: StarterCatalogue,
  landings: CatalogueLanding[],
  starter: StarterTiming,
  priorityCount: number,
  landingRadius?: number,
  sidWeights: number[] = Array(priorityCount).fill(1),
): CatalogueTarget[] {
  const targets: CatalogueTarget[] = [];
  const searchRadius = Math.min(starter.uncertainty, 100);
  const radius = landingRadius ?? searchRadius;
  if (
    !Number.isInteger(priorityCount) ||
    priorityCount < 1 ||
    priorityCount > 19
  )
    throw Error("Use 1–19 prioritised SID advance witnesses.");
  if (!Number.isInteger(radius) || radius < 0 || radius > searchRadius)
    throw Error(
      "Expected landing radius must fit within the retained PID search radius.",
    );
  if (
    sidWeights.length !== priorityCount ||
    sidWeights.some((w) => !Number.isFinite(w) || w <= 0)
  )
    throw Error("Invalid SID timing weights.");
  const sidWeightTotal = sidWeights.reduce((a, b) => a + b, 0);
  const weighted = (bits: number) =>
    sidWeights.reduce((sum, w, n) => sum + (bits & (1 << n) ? w : 0), 0) /
    sidWeightTotal;
  estimatedStarterWindow(starter); // Validate all supplied timer values.
  for (const species of STARTERS) {
    const rows = landings.filter((row) => row.species === species);
    const summaries = new Map(
      catalogue.spreads.map((s) => [
        s.advance,
        `${s.pid % 25}/${genderForPid(species, s.pid)}/${s.level5Stats[species]}`,
      ]),
    );
    let best: CatalogueTarget | null = null;
    for (const centre of rows) {
      if (
        centre.advance - searchRadius < catalogue.rules.minAdvance ||
        centre.advance + searchRadius > catalogue.rules.maxAdvance
      )
        continue;
      let second: number;
      try {
        second = targetCountdown(
          centre.advance,
          starter.calibration,
          starter.first,
          starter.offset,
        ).second;
      } catch {
        continue;
      }
      if (second < catalogue.rules.minimumSecondCountdown) continue;
      const neighbors = rows.filter(
        (row) => Math.abs(row.advance - centre.advance) <= radius,
      );
      if (neighbors.length !== 2 * radius + 1) continue;
      const searchNeighbors = rows.filter(
        (row) => Math.abs(row.advance - centre.advance) <= searchRadius,
      );
      if (searchNeighbors.length !== 2 * searchRadius + 1) continue;
      const matches = new Map<string, number>();
      for (const row of searchNeighbors) {
        const key = summaries.get(row.advance)!;
        matches.set(key, (matches.get(key) ?? 0) + 1);
      }
      const identified = (row: CatalogueLanding) =>
        matches.get(summaries.get(row.advance)!) === 1;
      if (!identified(centre)) continue;
      const score = (
        r: CatalogueLanding,
        field: "coverageBits" | "withoutTrainingBits" | "shortTrainingBits",
      ) => (identified(r) ? weighted(r[field]) : 0);
      const average = (
        field: "coverageBits" | "withoutTrainingBits" | "shortTrainingBits",
        close: boolean,
      ) => {
        let sum = 0,
          total = 0;
        for (const r of neighbors) {
          const distance = Math.abs(r.advance - centre.advance);
          if (close && distance > 3) continue;
          const weight = close ? 4 - distance : Math.max(1, 6 - distance);
          sum += weight * score(r, field);
          total += weight;
        }
        return sum / total;
      };
      const successes = neighbors.map((row) =>
        identified(row) ? row.drawingOnly : 0,
      );
      const drawingSum = successes.reduce((a, b) => a + b, 0);
      let perfectCluster: CatalogueTarget["perfectCluster"] = null;
      if (identified(centre) && centre.drawingOnly === priorityCount) {
        let min = centre.advance,
          max = min;
        while (
          searchNeighbors.some(
            (row) =>
              row.advance === min - 1 &&
              identified(row) &&
              row.drawingOnly === priorityCount,
          )
        )
          min--;
        while (
          searchNeighbors.some(
            (row) =>
              row.advance === max + 1 &&
              identified(row) &&
              row.drawingOnly === priorityCount,
          )
        )
          max++;
        perfectCluster = { minAdvance: min, maxAdvance: max };
      }
      const candidate: CatalogueTarget = {
        species,
        advance: centre.advance,
        secondCountdown: Math.round(second * 100) / 100,
        radius,
        searchRadius,
        expectedDrawingOnly: drawingSum / (neighbors.length * priorityCount),
        expectedWithoutTraining:
          neighbors.reduce(
            (sum, row) => sum + (identified(row) ? row.withoutTraining : 0),
            0,
          ) /
          (neighbors.length * priorityCount),
        expectedRemaining:
          neighbors.reduce(
            (sum, row) => sum + row.priorityExpectedSurvivors,
            0,
          ) / neighbors.length,
        worstDrawingOnly: Math.min(...successes),
        priorityCount: priorityCount,
        evaluatedLandings: neighbors.length,
        ambiguousLandings: neighbors.filter((row) => !identified(row)).length,
        averagePreparationSeconds:
          neighbors.reduce((sum, row) => sum + row.option.seconds, 0) /
          neighbors.length,
        perfectCluster,
        centre,
        ranking: {
          centreEvCap: centre.evCap,
          nearEvCap: Math.max(
            ...neighbors
              .filter((r) => Math.abs(r.advance - centre.advance) <= 3)
              .map((r) => (identified(r) ? r.evCap : 240)),
          ),
          nearEvEffort:
            neighbors
              .filter((r) => Math.abs(r.advance - centre.advance) <= 3)
              .reduce(
                (sum, r) =>
                  sum +
                  (4 - Math.abs(r.advance - centre.advance)) *
                    (identified(r) ? r.evEffort : 240),
                0,
              ) /
            neighbors
              .filter((r) => Math.abs(r.advance - centre.advance) <= 3)
              .reduce(
                (sum, r) => sum + 4 - Math.abs(r.advance - centre.advance),
                0,
              ),
          centreShort: score(centre, "shortTrainingBits"),
          nearShort: average("shortTrainingBits", true),
          centreEasy: score(centre, "withoutTrainingBits"),
          nearEasy: average("withoutTrainingBits", true),
          centreDrawing: score(centre, "coverageBits"),
          weightedDrawing: average("coverageBits", false),
          weightedShort: average("shortTrainingBits", false),
          weightedEasy: average("withoutTrainingBits", false),
        },
      };
      if (!best || compareCatalogueTargets(candidate, best) < 0)
        best = candidate;
    }
    if (best) targets.push(best);
  }
  targets.sort(compareCatalogueTargets);
  return targets;
}

export function compareCatalogueTargets(
  a: CatalogueTarget,
  b: CatalogueTarget,
) {
  const length = (target: CatalogueTarget) =>
    target.perfectCluster
      ? target.perfectCluster.maxAdvance - target.perfectCluster.minAdvance + 1
      : 0;
  const midpointDistance = (target: CatalogueTarget) =>
    target.perfectCluster
      ? Math.abs(
          target.advance -
            (target.perfectCluster.minAdvance +
              target.perfectCluster.maxAdvance) /
              2,
        )
      : 0;
  return (
    a.ranking.centreEvCap - b.ranking.centreEvCap ||
    a.ranking.nearEvCap - b.ranking.nearEvCap ||
    b.ranking.centreShort - a.ranking.centreShort ||
    b.ranking.centreEasy - a.ranking.centreEasy ||
    a.ranking.nearEvEffort - b.ranking.nearEvEffort ||
    b.ranking.nearShort - a.ranking.nearShort ||
    b.ranking.nearEasy - a.ranking.nearEasy ||
    b.ranking.centreDrawing - a.ranking.centreDrawing ||
    b.ranking.weightedDrawing - a.ranking.weightedDrawing ||
    b.ranking.weightedShort - a.ranking.weightedShort ||
    b.ranking.weightedEasy - a.ranking.weightedEasy ||
    b.worstDrawingOnly - a.worstDrawingOnly ||
    length(b) - length(a) ||
    midpointDistance(a) - midpointDistance(b) ||
    a.expectedRemaining - b.expectedRemaining ||
    a.averagePreparationSeconds - b.averagePreparationSeconds ||
    a.advance - b.advance ||
    a.species - b.species
  );
}
