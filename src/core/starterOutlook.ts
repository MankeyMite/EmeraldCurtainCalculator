import type { RngSpread } from "./rng";
import { generateSidRng } from "./sidRng";
import { estimatedSidWindow } from "./starterTiming";
import type { StarterGuideState, RouteSetup } from "./starterGuide";
import { starterCollectedItems } from "./starterChecklist";
import {
  rehearseStarterSidStrategy,
  type StarterStrategyAudit,
} from "./starterSidStrategy";
import { estimatedSidTargetAdvance } from "./starterSidPriority";

export const STARTER_OUTLOOK_RADIUS = 5;
export const STARTER_OUTLOOK_SHORT_EV_TARGET = 10;
export type StarterSidCase = {
  sid: number;
  advance: number;
  paintingOnly: boolean;
  experiments: number | null;
  defenseTarget: number | null;
  speedTarget: number | null;
  difficulty: "easy" | "moderate" | "hard" | "unknown";
};
export type StarterSidOutlook = {
  fullCount: number;
  target: number;
  cases: StarterSidCase[];
};
export type StarterOutlookAudit = StarterStrategyAudit;

/** One row per generating advance, not per distinct SID. Keep repeated SIDs
 * and chronological order; clip to the real search window at its edges. */
export function closestGuideSids(state: StarterGuideState) {
  const target = estimatedSidTargetAdvance(state.intro);
  const rows = generateSidRng(
    Number(state.tid),
    estimatedSidWindow(state.intro),
  );
  const closest = rows
    .flatMap((row) =>
      row.advances
        .filter(
          (advance) => Math.abs(advance - target) <= STARTER_OUTLOOK_RADIUS,
        )
        .map((advance) => ({ sid: row.sid, advance })),
    )
    .sort((a, b) => a.advance - b.advance);
  return {
    target,
    fullCount: rows.length,
    closest,
    sidValues: rows.map((row) => row.sid),
  };
}

/** Conservative rehearsal of the same timing-aware experiment policy used by
 * the live guide. All timing-window rivals participate in every answer. */
export function assessStarterOutlook(
  state: StarterGuideState,
  spread: RngSpread,
  route: RouteSetup,
  audit?: (step: StarterOutlookAudit) => void,
): StarterSidOutlook {
  const scope = closestGuideSids(state);
  const facts = {
    ...route.facts,
    pid: spread.pid,
    ivs: spread.ivs,
    ...(state.playerGender ? { otGender: state.playerGender } : {}),
  };
  const rows = generateSidRng(
    Number(state.tid),
    estimatedSidWindow(state.intro),
  );
  const cases = rehearseStarterSidStrategy(
    {
      facts,
      spread,
      rows,
      target: scope.target,
      scenarios: scope.closest.map((row) => row.sid),
      consumedItems: [
        ...new Set([
          ...(state.usedTms ?? []),
          ...(route.actions ?? []).flatMap((a) => a.consumedItems ?? []),
        ]),
      ],
      collectedItems: [
        ...new Set([...(route.items ?? []), ...starterCollectedItems(state)]),
      ],
      allowTraining:
        facts.pokerus === 0 && !state.battles.some((b) => b.multiplier !== 1),
    },
    audit,
  );
  return {
    fullCount: scope.fullCount,
    target: scope.target,
    cases: scope.closest.map((row, n) => {
      const result = cases[n];
      return {
        ...row,
        ...result,
        difficulty:
          result.experiments === null
            ? "unknown"
            : result.paintingOnly
              ? "easy"
              : (result.defenseTarget ?? 0) > STARTER_OUTLOOK_SHORT_EV_TARGET ||
                  (result.speedTarget ?? 0) > STARTER_OUTLOOK_SHORT_EV_TARGET
                ? "hard"
                : "moderate",
      };
    }),
  };
}

export type StarterOutlookTask = {
  key: string;
  route: RouteSetup;
  outlook: StarterSidOutlook;
};
