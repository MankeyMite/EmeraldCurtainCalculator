import { generateSidRng } from "./sidRng";
import { EMERALD_FPS, estimatedSidWindow } from "./starterTiming";
import { estimatedSidTargetAdvance } from "./starterSidPriority";
import { scanStaticSpreads } from "./staticRng";
import type { StarterGuideState } from "./starterGuide";
import { canSearchOptimalPid } from "./starterRecommendation";
import type { RngSettings } from "./rng";

// Practical time to load the save and reach the bag, not a different RNG seed.
export const earliestShinyStarterAdvance = (dryBattery = false) =>
  dryBattery ? 900 : 650;
export const SHINY_PREVIEW_LIMIT = 1_000_000;
export const starterTidPreviewKey = (
  s: Pick<StarterGuideState, "tid" | "intro" | "dryBattery">,
) => JSON.stringify([2, s.tid, s.intro, s.dryBattery ?? false]);
export type StarterTidPreview = {
  key: string;
  target: number;
  minimum: number;
  limit: number;
  weightedAverage: number | null;
  rows: {
    sid: number;
    advance: number;
    difference: number;
    shinyAdvance: number | null;
  }[];
};
/** Each generating advance contributes its own triangular timing weight.
 * A missing shiny result must not turn into a favorable partial average. */
export function weightedFirstShinyAdvance(
  rows: { difference: number; shinyAdvance: number | null }[],
  radius: number,
) {
  let sum = 0,
    weights = 0;
  for (const row of rows) {
    const weight = radius + 1 - Math.abs(row.difference);
    if (weight <= 0)
      throw Error("SID timing lies outside the configured window.");
    if (row.shinyAdvance === null) return null;
    sum += row.shinyAdvance * weight;
    weights += weight;
  }
  return weights ? sum / weights : null;
}
export function firstShinyWait(advance: number) {
  const seconds = Math.round(advance / EMERALD_FPS);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
}
export function shinyAdvanceColour(advance: number | null) {
  return advance === null || advance > 9000
    ? "hard"
    : advance >= 5000
      ? "moderate"
      : "easy";
}
export function previewStarterTid(
  s: Pick<StarterGuideState, "tid" | "intro" | "dryBattery">,
): StarterTidPreview {
  if (!canSearchOptimalPid(s.tid))
    throw Error("Enter a public TID from 0 to 65535.");
  const target = estimatedSidTargetAdvance(s.intro);
  const window = estimatedSidWindow(s.intro);
  // Reuse the existing generation model, retaining repeated chronological witnesses.
  // This preview never narrows the full investigation window.
  const rows = generateSidRng(Number(s.tid), window)
    .flatMap((row) =>
      row.advances.map((advance) => ({
        sid: row.sid,
        advance,
        difference: advance - target,
      })),
    )
    .sort((a, b) => a.advance - b.advance);
  const minimum = earliestShinyStarterAdvance(s.dryBattery);
  const settings: RngSettings = {
    kind: "static",
    seed: 0,
    minAdvance: minimum,
    maxAdvance: SHINY_PREVIEW_LIMIT,
    methods: ["Method1"],
    areaId: "",
    lead: "none",
    synchronizeNature: 0,
  };
  const firstBySid = new Map<number, number | null>();
  for (const row of rows) {
    if (firstBySid.has(row.sid)) continue;
    const first = scanStaticSpreads(
      settings,
      { species: 277, tid: Number(s.tid), sid: row.sid, shiny: true },
      [],
      undefined,
      true,
    )[0];
    firstBySid.set(row.sid, first?.advance ?? null);
  }
  const allRows = rows.map((row) => ({
    ...row,
    shinyAdvance: firstBySid.get(row.sid)!,
  }));
  return {
    key: starterTidPreviewKey(s),
    target,
    minimum,
    limit: SHINY_PREVIEW_LIMIT,
    weightedAverage: weightedFirstShinyAdvance(allRows, s.intro.uncertainty),
    rows: allRows.filter((row) => Math.abs(row.difference) <= 9),
  };
}
