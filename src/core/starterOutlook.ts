import type { KnownFacts } from "./constraints";
import type { RngSpread } from "./rng";
import { makeHypothesis } from "./sid";
import { generateSidRng } from "./sidRng";
import { estimatedSidWindow, EMERALD_FPS } from "./starterTiming";
import type { StarterGuideState, RouteSetup } from "./starterGuide";
import { starterPlaintext } from "./starterRoute";
import { STARTER_ITEM_IDS, starterItemCost } from "./starterItems";
import { starterCollectedItems } from "./starterChecklist";
import { swapMoveFacts } from "./moveLearningExperiments";
import { compareSidSteps } from "./nextSidStep";
import { EXPERIMENT_SECONDS } from "./evTraining";

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
export type StarterOutlookAudit = {
  sid: number;
  before: number[];
  after: number[];
  action: { id: string; stat?: 2 | 3; target?: number };
  questions: { digit: number; candidate: number }[];
};

/** One row per generating advance, not per distinct SID. Keep repeated SIDs
 * and chronological order; clip to the real search window at its edges. */
export function closestGuideSids(state: StarterGuideState) {
  const target = Math.max(
    1,
    Math.round(state.intro.second * EMERALD_FPS) +
      state.intro.offset +
      state.intro.calibration,
  );
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

type Tests = number[]; // Four SID nibble masks, least significant first.
const signature = (sid: number, tests: Tests) =>
  tests
    .map((mask, n) => {
      const digit = (sid >>> (n * 4)) & 15;
      return mask & (1 << digit) ? digit.toString(16) : "x";
    })
    .join("");

/** Blocks are 12 bytes, a multiple of the XOR-key period. Permutation changes
 * pixel coordinates, not which SID digit a known plaintext nibble tests. */
function plaintextTests(facts: KnownFacts, spread: RngSpread) {
  const h = {
    ...makeHypothesis(spread.pid, 0, 0),
    rng: { ivs: spread.ivs, abilitySlot: spread.abilitySlot },
  };
  const masks: Tests = [1, 1, 1, 1]; // The SID header also tests zero.
  starterPlaintext(facts, h).forEach((mask, n) => {
    if (n % 8 < 4 || !mask || mask & (mask - 1)) return;
    const digit = (n % 8) - 4,
      value = Math.log2(mask) ^ ((spread.pid >>> ((digit + 4) * 4)) & 15);
    masks[digit] |= 1 << value;
  });
  return masks;
}

type Action = {
  id: string;
  tests: Tests;
  seconds: number;
  stat?: 2 | 3;
  target?: number;
};
type Choice = {
  action: Action;
  groups: Map<string, number[]>;
  tests: Tests;
  informationGain: number;
  seconds: number;
  lastResort: boolean;
  worstCase: number;
};

// Model at most four useful pixel confirmations per setup, as in the guide.
// Their selection depends only on surviving candidates, never on a row's SID.
function actionChoice(
  action: Action,
  sids: number[],
  seconds: number,
): Choice | null {
  const questions: { digit: number; value: number; worst: number }[] = [];
  action.tests.forEach((mask, digit) => {
    for (let value = 0; value < 16; value++)
      if (mask & (1 << value)) {
        const zero = sids.filter(
          (sid) => ((sid >>> (digit * 4)) & 15) === value,
        ).length;
        if (zero && zero < sids.length)
          questions.push({
            digit,
            value,
            worst: Math.max(zero, sids.length - zero),
          });
      }
  });
  if (!questions.length) return null;
  questions.sort(
    (a, b) => a.worst - b.worst || a.digit - b.digit || a.value - b.value,
  );
  const tests: Tests = [0, 0, 0, 0];
  for (const q of questions.slice(0, 4)) tests[q.digit] |= 1 << q.value;
  const groups = new Map<string, number[]>();
  for (const sid of sids) {
    const key = signature(sid, tests),
      group = groups.get(key) ?? [];
    group.push(sid);
    groups.set(key, group);
  }
  const sizes = [...groups.values()].map((g) => g.length);
  return {
    action,
    groups,
    tests,
    seconds,
    informationGain: sizes.reduce(
      (sum, n) => sum - (n / sids.length) * Math.log2(n / sids.length),
      0,
    ),
    lastResort:
      action.target !== undefined &&
      action.target > STARTER_OUTLOOK_SHORT_EV_TARGET,
    worstCase: Math.max(...sizes),
  };
}

/** A truth-blind, conservative rehearsal of known-pixel experiments. Every
 * displayed possible SID is compared against the full timing window. The
 * assumed SID selects an outcome only AFTER a shared policy chooses a test.
 * Unknown plaintext and checksum deductions are omitted; counts are estimates,
 * not a promise that the interactive recommender will choose this exact path.
 */
export function assessStarterOutlook(
  state: StarterGuideState,
  spread: RngSpread,
  route: RouteSetup,
  audit?: (step: StarterOutlookAudit) => void,
): StarterSidOutlook {
  const scope = closestGuideSids(state);
  const facts = { ...route.facts, pid: spread.pid, ivs: spread.ivs };
  const drawing = plaintextTests(facts, spread);
  const initial = new Map<string, number[]>();
  for (const sid of scope.sidValues) {
    const key = signature(sid, drawing),
      group = initial.get(key) ?? [];
    group.push(sid);
    initial.set(key, group);
  }
  const consumed = new Set([
    ...(state.usedTms ?? []),
    ...(route.actions ?? []).flatMap((a) => a.consumedItems ?? []),
  ]);
  const collected = new Set([
    ...(route.items ?? []),
    ...starterCollectedItems(state),
  ]);
  const cheap: Action[] = [];
  for (const item of [0, ...STARTER_ITEM_IDS])
    if (!consumed.has(item) && item !== facts.heldItem)
      cheap.push({
        id: `item-${item}`,
        tests: plaintextTests({ ...facts, heldItem: item }, spread),
        seconds:
          EXPERIMENT_SECONDS.item +
          (item && !collected.has(item) ? starterItemCost([item]).seconds : 0),
      });
  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++)
      if (facts.moves?.[a] && facts.moves[b])
        cheap.push({
          id: `moves-${a}-${b}`,
          tests: plaintextTests(
            { ...facts, ...swapMoveFacts(facts, a, b) },
            spread,
          ),
          seconds: EXPERIMENT_SECONDS.item,
        });
  const evs = facts.evs;
  const evKnown =
    evs?.length === 6 &&
    evs.every((n) => n !== null) &&
    facts.pokerus === 0 &&
    !state.battles.some((b) => b.multiplier !== 1);
  const start = evKnown ? (evs as number[]) : null;
  const total = start?.reduce((a, b) => a + b, 0) ?? 0;
  const training: Action[][] = [[], []];
  if (start)
    for (const stat of [2, 3] as const) {
      const cap = Math.min(255, start[stat] + 510 - total);
      for (let target = start[stat] + 1; target <= cap; target++) {
        const next = start.slice();
        next[stat] = target;
        training[stat - 2].push({
          id: `ev-${stat}-${target}`,
          stat,
          target,
          tests: plaintextTests({ ...facts, evs: next }, spread),
          seconds: 0,
        });
      }
    }
  const cache = new Map<string, Choice | null>();
  const choose = (sids: number[], defense: number, speed: number) => {
    const key = `${defense}/${speed}/${sids.join(",")}`;
    if (cache.has(key)) return cache.get(key)!;
    const options = cheap
      .map((a) => actionChoice(a, sids, a.seconds))
      .filter((c): c is Choice => !!c);
    if (start)
      for (const stat of [2, 3] as const) {
        const current = stat === 2 ? defense : speed;
        const trained = defense - start[2] + speed - start[3];
        for (const action of training[stat - 2]) {
          if (action.target! <= current) continue;
          if (total + trained + action.target! - current > 510) break;
          const candidate = actionChoice(
            action,
            sids,
            30 + (action.target! - current) * EXPERIMENT_SECONDS.battle,
          );
          if (candidate) {
            options.push(candidate);
            // Never skip an informative lower EV checkpoint. Otherwise a jump
            // could falsely make a row look as though it needed >10 EVs.
            break;
          }
        }
      }
    options.sort(
      (a, b) =>
        compareSidSteps(a, b) ||
        a.worstCase - b.worstCase ||
        a.action.id.localeCompare(b.action.id),
    );
    const choice = options[0] ?? null;
    cache.set(key, choice);
    return choice;
  };
  const cases = scope.closest.map((row) => {
    let remaining = initial.get(signature(row.sid, drawing))!;
    let experiments = 0,
      defense = start?.[2] ?? 0,
      speed = start?.[3] ?? 0;
    let defenseTarget: number | null = null,
      speedTarget: number | null = null;
    const paintingOnly = remaining.length === 1;
    // Wide windows retain their full candidates; do not substitute a sample
    // to produce an optimistic estimate. Normal ±60 windows are fully modeled.
    while (
      remaining.length > 1 &&
      experiments < 64 &&
      scope.fullCount <= 4096
    ) {
      const next = choose(remaining, defense, speed);
      if (!next) break;
      const after = next.groups.get(signature(row.sid, next.tests))!;
      if (audit)
        audit({
          sid: row.sid,
          before: remaining.slice(),
          after: after.slice(),
          action: {
            id: next.action.id,
            stat: next.action.stat,
            target: next.action.target,
          },
          questions: next.tests.flatMap((mask, digit) =>
            Array.from({ length: 16 }, (_, candidate) => ({
              digit,
              candidate,
            })).filter((q) => !!(mask & (1 << q.candidate))),
          ),
        });
      remaining = after;
      experiments++;
      if (next.action.stat === 2) defenseTarget = defense = next.action.target!;
      if (next.action.stat === 3) speedTarget = speed = next.action.target!;
    }
    const resolved = remaining.length === 1;
    const difficulty: StarterSidCase["difficulty"] = !resolved
      ? "unknown"
      : paintingOnly
        ? "easy"
        : (defenseTarget ?? 0) > STARTER_OUTLOOK_SHORT_EV_TARGET ||
            (speedTarget ?? 0) > STARTER_OUTLOOK_SHORT_EV_TARGET
          ? "hard"
          : "moderate";
    return {
      ...row,
      paintingOnly,
      experiments: resolved ? experiments : null,
      defenseTarget,
      speedTarget,
      difficulty,
    };
  });
  return { fullCount: scope.fullCount, target: scope.target, cases };
}

export type StarterOutlookTask = {
  key: string;
  route: RouteSetup;
  outlook: StarterSidOutlook;
};
