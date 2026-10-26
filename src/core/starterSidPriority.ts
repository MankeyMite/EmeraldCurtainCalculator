import type { KnownFacts } from "./constraints";
import { emptyObservations } from "./constraints";
import type { Hypothesis } from "./sid";
import type { SidRngRow } from "./sidRng";
import { starterTargetFrame, type StarterTiming } from "./starterTiming";
import {
  starterPlaintext,
  starterPixelSupport,
  usefulStarterPixels,
} from "./starterRoute";
import {
  scoreStarterSidOutcomes,
  type SidPriorityScore,
} from "./starterSidScoring";
export { compareStarterSidExperiments } from "./starterSidScoring";
export type { SidPriorityScore } from "./starterSidScoring";

export type SidTimingCandidate = {
  sid: number;
  advances: number[];
  closestAdvances: number[];
  distance: number | null;
};
export type SidTimingPriority = {
  target: number;
  candidates: SidTimingCandidate[];
  leaders: SidTimingCandidate[];
};

/** Same seconds/offset/calibration conversion as the existing timers. Timing
 * distance is an ordering heuristic, never a probability or a SID filter. */
export function estimatedSidTargetAdvance(timing: StarterTiming) {
  return Math.max(1, starterTargetFrame(timing));
}
export function rankSurvivingSidTimings(
  rows: SidRngRow[],
  surviving: number[],
  target: number,
): SidTimingPriority {
  const bySid = new Map<number, Set<number>>();
  for (const row of rows) {
    const advances = bySid.get(row.sid) ?? new Set<number>();
    row.advances.forEach((a) => advances.add(a));
    bySid.set(row.sid, advances);
  }
  const candidates = [...new Set(surviving)]
    .map((sid) => {
      const advances = [...(bySid.get(sid) ?? [])].sort((a, b) => a - b);
      const distance = advances.length
        ? Math.min(...advances.map((a) => Math.abs(a - target)))
        : null;
      return {
        sid,
        advances,
        distance,
        closestAdvances: advances.filter(
          (a) => Math.abs(a - target) === distance,
        ),
      };
    })
    .sort(
      (a, b) =>
        (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.sid - b.sid,
    );
  const first = candidates[0];
  return {
    target,
    candidates,
    leaders:
      first?.distance === null || !first
        ? []
        : candidates.filter((c) => c.distance === first.distance),
  };
}
export const signedAdvanceDifference = (difference: number) =>
  difference > 0 ? `+${difference}` : String(difference);
export const sidTimingLabel = (row: SidTimingCandidate, target: number) =>
  `0x${row.sid.toString(16).toUpperCase().padStart(4, "0")} (${String(row.sid).padStart(5, "0")})` +
  (row.closestAdvances.length
    ? `, ${row.closestAdvances.map((a) => signedAdvanceDifference(a - target)).join(" / ")} advances`
    : "");

type PixelSupports = { index: number; masks: number[] };
type Prepared = {
  sids: number[];
  hypotheses: Hypothesis[];
  plain: number[][];
  timing: SidTimingPriority;
};
function prepare(
  candidates: Hypothesis[],
  facts: KnownFacts,
  timing: SidTimingPriority,
): Prepared {
  return {
    sids: [
      ...new Set([
        ...timing.candidates.map((c) => c.sid),
        ...candidates.map((h) => h.sid),
      ]),
    ],
    hypotheses: candidates,
    plain: candidates.map((h) => starterPlaintext(facts, h)),
    timing,
  };
}
function pixelSupports(prepared: Prepared, index: number): PixelSupports {
  return {
    index,
    masks: prepared.hypotheses.map(
      (h, n) => starterPixelSupport(index, h, prepared.plain[n]) || 3,
    ),
  };
}
function branches(prepared: Prepared, pixels: PixelSupports[]) {
  const totalPatterns = 1 << pixels.length;
  const patternsBySid = new Map(
    prepared.sids.map((sid) => [sid, new Set<number>()]),
  );
  const modelled = new Set<number>();
  for (let n = 0; n < prepared.hypotheses.length; n++) {
    const sid = prepared.hypotheses[n].sid;
    modelled.add(sid);
    for (let pattern = 0; pattern < totalPatterns; pattern++)
      if (
        pixels.every(
          (p, digit) => p.masks[n] & (1 << ((pattern >>> digit) & 1)),
        )
      )
        patternsBySid.get(sid)!.add(pattern);
  }
  // Unresolved SIDs without an enumerated witness must not disappear from a
  // confirmation claim. Conservatively retain them in every possible outcome.
  for (const sid of prepared.sids)
    if (!modelled.has(sid))
      for (let p = 0; p < totalPatterns; p++) patternsBySid.get(sid)!.add(p);
  const survivors = Array.from(
    { length: totalPatterns },
    () => new Set<number>(),
  );
  for (const [sid, patterns] of patternsBySid)
    for (const pattern of patterns) survivors[pattern].add(sid);
  return { patternsBySid, survivors };
}
function score(prepared: Prepared, pixels: PixelSupports[]): SidPriorityScore {
  return scoreStarterSidOutcomes(
    prepared.sids,
    branches(prepared, pixels).survivors,
    prepared.timing,
  );
}

/** Conservative outcome claims across every SID and every PID/IV witness. */
export function leadingSidPixelReason(
  candidates: Hypothesis[],
  facts: KnownFacts,
  index: number,
  timing: SidTimingPriority,
) {
  if (!timing.leaders.length || timing.candidates.length < 2) return "";
  const prepared = prepare(candidates, facts, timing),
    pixel = pixelSupports(prepared, index);
  const evaluation = score(prepared, [pixel]);
  if (timing.leaders.length > 1)
    return evaluation.closestSeparation > 0
      ? "This pixel helps distinguish the equally close SID candidates."
      : "";
  const leader = timing.leaders[0],
    { patternsBySid, survivors } = branches(prepared, [pixel]);
  const support = patternsBySid.get(leader.sid)!;
  const sentences: string[] = [];
  for (const [value, label] of [
    [0, "Transparent"],
    [1, "Black"],
  ] as const) {
    if (survivors[value].size === 1 && survivors[value].has(leader.sid))
      sentences.push(`${label} would uniquely confirm the leading SID.`);
    else if (!support.has(value))
      sentences.push(`${label} would eliminate the leading SID.`);
  }
  return evaluation.leadingGain > 0 ||
    evaluation.closestSeparation > 0 ||
    sentences.length
    ? `Recommended to test the leading SID (${sidTimingLabel(leader, timing.target)}). ${sentences.join(" ")}`.trim()
    : "";
}

/** Greedily choose at most the existing four target pixels. Joint signatures
 * preserve correlations within a PID/IV hypothesis; unknown plaintext adds all
 * permitted outcomes rather than inventing deterministic black/transparent. */
export function prioritizeStarterSidPixels(
  candidates: Hypothesis[],
  facts: KnownFacts,
  positions: number[],
  timing: SidTimingPriority,
) {
  const wanted = new Set(positions);
  const useful = usefulStarterPixels(
    candidates,
    facts,
    emptyObservations(),
  ).filter((q) => wanted.has(q.index));
  if (!useful.length) return null;
  const prepared = prepare(candidates, facts, timing),
    available = useful.map((q) => pixelSupports(prepared, q.index));
  const selected: PixelSupports[] = [];
  let current = score(prepared, []);
  while (selected.length < 4 && available.length) {
    let best = 0,
      next = score(prepared, [...selected, available[0]]);
    for (let n = 1; n < available.length; n++) {
      const candidate = score(prepared, [...selected, available[n]]);
      if (candidate.benefit > next.benefit) {
        best = n;
        next = candidate;
      }
    }
    if (selected.length && next.benefit <= current.benefit) break;
    selected.push(available.splice(best, 1)[0]);
    current = next;
  }
  const targets = selected.map((p) => p.index),
    first = useful.find((q) => q.index === targets[0])!;
  return {
    ...current,
    targets,
    worstCase: first.worstCase,
    reason:
      leadingSidPixelReason(candidates, facts, targets[0], timing) ||
      (timing.leaders.length && current.leadingGain > 0
        ? "These pixels help distinguish the closest surviving SID candidates."
        : ""),
  };
}
