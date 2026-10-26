import type { KnownFacts } from "./constraints";
import type { RngSpread } from "./rng";
import type { SidRngRow } from "./sidRng";
import type { SidTestMasks } from "./starterCatalogue";
import { knownPlaintext } from "./inference";
import { makeHypothesis } from "./sid";
import { starterPlaintext } from "./starterRoute";
import { newSnapshot } from "./investigation";
import {
  controlledActions,
  type ControlledAction,
} from "./controlledExperiments";
import { experimentSeconds } from "./nextSidStep";
import { STARTER_ITEM_IDS, starterItemCost } from "./starterItems";
import {
  rankSurvivingSidTimings,
  type SidTimingPriority,
} from "./starterSidPriority";
import {
  scoreStarterSidOutcomes,
  compareStarterSidExperiments,
} from "./starterSidScoring";

export type StarterStrategyQuestion = { digit: number; candidate: number };
export type StarterStrategyAudit = {
  sid: number;
  before: number[];
  after: number[];
  action: { id: string; stat?: 2 | 3; target?: number };
  questions: StarterStrategyQuestion[];
  startingFacts: KnownFacts;
  resultingFacts: KnownFacts;
};
export type StarterStrategyCase = {
  sid: number;
  paintingOnly: boolean;
  experiments: number | null;
  seconds: number | null;
  defenseTarget: number | null;
  speedTarget: number | null;
};
export type StarterStrategyInput = {
  facts: KnownFacts;
  spread: Pick<RngSpread, "pid" | "ivs" | "abilitySlot">;
  rows: SidRngRow[];
  target: number;
  scenarios: number[];
  collectedItems?: number[];
  consumedItems?: number[];
  allowTraining?: boolean;
  // Already verified singleton catalogue masks avoid rebuilding the initial drawing.
  drawingMasks?: SidTestMasks;
  cache?: StarterStrategyCache;
};

type RawAction = { action: ControlledAction; masks: SidTestMasks };
export type StarterStrategyCache = {
  moves: Map<string, RawAction[]>;
  evs: Map<string, RawAction[]>;
  plaintext: Map<string, SidTestMasks>;
};
export const newStarterStrategyCache = (): StarterStrategyCache => ({
  moves: new Map(),
  evs: new Map(),
  plaintext: new Map(),
});
const itemMasks = new Map<number, SidTestMasks>();
const itemSeconds = new Map<number, number>();
const xorMasks = (raw: SidTestMasks, pid: number): SidTestMasks =>
  raw.map((mask, digit) => {
    let result = 0;
    for (let value = 0; value < 16; value++)
      if (mask & (1 << value))
        result |= 1 << (value ^ ((pid >>> ((digit + 4) * 4)) & 15));
    return result;
  }) as SidTestMasks;
function cachedActions(
  cache: StarterStrategyCache,
  current: KnownFacts,
  keyMasks: number[],
  allowTraining: boolean,
) {
  const moveKey = JSON.stringify([
    current.moves,
    current.pp,
    current.ppBonuses,
  ]);
  let moves = cache.moves.get(moveKey);
  if (!moves) {
    const facts = {
      moves: current.moves,
      ...(current.pp ? { pp: current.pp } : {}),
      ...(current.ppBonuses === undefined
        ? {}
        : { ppBonuses: current.ppBonuses }),
    };
    moves = !current.moves
      ? []
      : controlledActions(newSnapshot("strategy-moves", "Strategy", facts))
          .filter((a) => a.kind === "moves")
          .map((action) => ({
            action,
            masks: starterStrategyMasks(
              knownPlaintext(action.changes),
              0,
              action.logical,
            ),
          }));
    cache.moves.set(moveKey, moves);
  }
  if (!allowTraining || !current.evs || current.evs.some((v) => v === null))
    return moves;
  const all: RawAction[] = [...moves];
  for (const stat of [2, 3]) {
    const halfMasks = Array(8).fill(0);
    halfMasks[stat * 2] = keyMasks[stat * 2];
    halfMasks[stat * 2 + 1] = keyMasks[stat * 2 + 1];
    if (
      !(halfMasks[stat * 2] & (halfMasks[stat * 2] - 1)) &&
      !(halfMasks[stat * 2 + 1] & (halfMasks[stat * 2 + 1] - 1))
    )
      continue;
    const evKey = JSON.stringify([
      current.evs,
      current.heldItem,
      current.pokerus,
      stat,
      halfMasks[stat * 2],
      halfMasks[stat * 2 + 1],
    ]);
    let evs = cache.evs.get(evKey);
    if (!evs) {
      const facts = {
        evs: current.evs,
        ...(current.heldItem === undefined
          ? {}
          : { heldItem: current.heldItem }),
        ...(current.pokerus === undefined ? {} : { pokerus: current.pokerus }),
      };
      evs = controlledActions(
        newSnapshot("strategy-evs", "Strategy", facts),
        undefined,
        {},
        halfMasks,
        { allowVitamins: false },
      )
        .filter((a) => a.kind === "ev" && a.training?.vitamins === 0)
        .map((action) => {
          const key = JSON.stringify([action.changes, action.logical]);
          let masks = cache.plaintext.get(key);
          if (!masks) {
            masks = starterStrategyMasks(
              knownPlaintext(action.changes),
              0,
              action.logical,
            );
            cache.plaintext.set(key, masks);
          }
          return { action, masks };
        });
      if (cache.evs.size > 10000) cache.evs.clear();
      cache.evs.set(evKey, evs);
    }
    all.push(...evs);
  }
  return all;
}

type StrategyAction = {
  id: string;
  masks: SidTestMasks;
  changes: KnownFacts;
  seconds: number;
  lastResort: boolean;
  item?: number;
  stat?: 2 | 3;
  target?: number;
};
const signature = (sid: number, masks: SidTestMasks) =>
  masks
    .map((mask, n) => {
      const value = (sid >>> (4 * n)) & 15;
      return mask & (1 << value) ? value.toString(16) : "x";
    })
    .join("");

/** Only known singleton plaintext becomes a test. Unknown fields are omitted,
 * not assigned a guessed outcome. The live guide also uses uncertain fields;
 * consequently this rehearsal remains a conservative planning estimate. */
export function starterStrategyMasks(
  plain: number[],
  pid: number,
  logical?: number[],
): SidTestMasks {
  const masks: SidTestMasks = [0, 0, 0, 0];
  for (const n of logical ?? plain.map((_, n) => n)) {
    const mask = plain[n];
    if (n % 8 < 4 || !mask || mask & (mask - 1)) continue;
    const digit = (n % 8) - 4;
    masks[digit] |= 1 << (Math.log2(mask) ^ ((pid >>> ((digit + 4) * 4)) & 15));
  }
  return masks;
}

/** Same four-question greedy policy and outcome score as the interactive guide.
 * A mask is a set of real, known-plaintext black/transparent pixel predicates.
 * Several pixels testing the same predicate contribute just one question. */
export function chooseStarterStrategyQuestions(
  sids: number[],
  masks: SidTestMasks,
  timing: SidTimingPriority,
) {
  const questions: StarterStrategyQuestion[] = [];
  masks.forEach((mask, digit) => {
    for (let candidate = 0; candidate < 16; candidate++) {
      if (!(mask & (1 << candidate))) continue;
      const count = sids.filter(
        (sid) => ((sid >>> (digit * 4)) & 15) === candidate,
      ).length;
      if (count && count < sids.length) questions.push({ digit, candidate });
    }
  });
  if (!questions.length) return null;
  const branches = (selected: StarterStrategyQuestion[]) => {
    const groups = Array.from(
      { length: 1 << selected.length },
      () => new Set<number>(),
    );
    for (const sid of sids) {
      let pattern = 0;
      selected.forEach((q, n) => {
        if (((sid >>> (q.digit * 4)) & 15) !== q.candidate) pattern |= 1 << n;
      });
      groups[pattern].add(sid);
    }
    return groups;
  };
  const selected: StarterStrategyQuestion[] = [];
  let score = scoreStarterSidOutcomes(sids, [new Set(sids)], timing);
  while (selected.length < 4 && questions.length) {
    let best = 0;
    let next = scoreStarterSidOutcomes(
      sids,
      branches([...selected, questions[0]]),
      timing,
    );
    for (let n = 1; n < questions.length; n++) {
      const value = scoreStarterSidOutcomes(
        sids,
        branches([...selected, questions[n]]),
        timing,
      );
      if (value.benefit > next.benefit) {
        best = n;
        next = value;
      }
    }
    if (selected.length && next.benefit <= score.benefit) break;
    selected.push(questions.splice(best, 1)[0]);
    score = next;
  }
  return {
    ...score,
    questions: selected,
    groups: branches(selected).filter((g) => g.size),
  };
}

/** Shared by the TID catalogue scan and the landed-starter difficulty preview.
 * The hidden scenario SID selects an answer only AFTER the current surviving
 * pool has selected an action. No sampled pool is substituted for the window. */
export function rehearseStarterSidStrategy(
  input: StarterStrategyInput,
  audit?: (step: StarterStrategyAudit) => void,
): StarterStrategyCase[] {
  const { spread } = input;
  const cache = input.cache ?? newStarterStrategyCache();
  const full = [...new Set(input.rows.map((row) => row.sid))];
  const facts = { ...input.facts, pid: spread.pid, ivs: spread.ivs };
  let drawing = input.drawingMasks;
  if (!drawing) {
    const h = {
      ...makeHypothesis(spread.pid, Number(facts.tid ?? 0), 0),
      rng: { ivs: spread.ivs, abilitySlot: spread.abilitySlot },
    };
    drawing = starterStrategyMasks(starterPlaintext(facts, h), spread.pid);
    drawing.forEach((_, n) => (drawing![n] |= 1)); // SID header zero tests.
  }
  const initial = new Map<string, number[]>();
  for (const sid of full) {
    const key = signature(sid, drawing);
    const group = initial.get(key) ?? [];
    group.push(sid);
    initial.set(key, group);
  }
  const consumed = new Set(input.consumedItems);
  const baseCollected = [
    ...new Set([
      ...(input.collectedItems ?? []),
      ...(facts.heldItem ? [facts.heldItem] : []),
    ]),
  ];
  const choices = new Map<string, ReturnType<typeof choose>>();
  function choose(sids: number[], current: KnownFacts, collected: number[]) {
    const timing = rankSurvivingSidTimings(input.rows, sids, input.target);
    const actions: StrategyAction[] = [];
    for (const item of [0, ...STARTER_ITEM_IDS]) {
      if (item === current.heldItem || consumed.has(item)) continue;
      let raw = itemMasks.get(item);
      if (!raw) {
        raw = starterStrategyMasks(
          knownPlaintext({ heldItem: item }),
          0,
          [4, 5, 6, 7],
        );
        itemMasks.set(item, raw);
      }
      if (!itemSeconds.has(item))
        itemSeconds.set(item, item ? starterItemCost([item]).seconds : 0);
      actions.push({
        id: `item-${item}`,
        item,
        changes: { heldItem: item },
        masks: xorMasks(raw, spread.pid),
        seconds:
          30 + (item && !collected.includes(item) ? itemSeconds.get(item)! : 0),
        lastResort: false,
      });
    }
    const keyMasks = Array.from({ length: 8 }, (_, n) =>
      sids.reduce(
        (m, sid) =>
          m |
          (1 <<
            ((((sid << 16) ^ (Number(facts.tid ?? 0) & 65535) ^ spread.pid) >>>
              (n * 4)) &
              15)),
        0,
      ),
    );
    // Reuse legal swaps, EV caps, no-vitamin costs and informative-checkpoint
    // pruning from the real experiment generator; do not invent training actions.
    for (const { action, masks } of cachedActions(
      cache,
      current,
      keyMasks,
      input.allowTraining !== false,
    )) {
      const stat =
        action.kind === "ev"
          ? action.id.split("-")[1] === "2"
            ? 2
            : 3
          : undefined;
      actions.push({
        id: action.id,
        masks: xorMasks(masks, spread.pid),
        changes: action.changes,
        seconds: experimentSeconds(action),
        lastResort: action.training?.lastResort ?? false,
        stat,
        target: action.training?.target,
      });
    }
    // Equivalent predicates need only one evaluation, at the cheapest legal cost.
    const distinct = new Map<string, StrategyAction>();
    for (const action of actions) {
      const useful = action.masks
        .map((mask, digit) => {
          let result = 0;
          for (let value = 0; value < 16; value++) {
            if (!(mask & (1 << value))) continue;
            const hits = sids.filter(
              (sid) => ((sid >>> (digit * 4)) & 15) === value,
            ).length;
            if (hits && hits < sids.length) result |= 1 << value;
          }
          return result;
        })
        .join();
      if (useful === "0,0,0,0") continue;
      const old = distinct.get(useful);
      if (
        !old ||
        Number(action.lastResort) < Number(old.lastResort) ||
        (action.lastResort === old.lastResort && action.seconds < old.seconds)
      )
        distinct.set(useful, action);
    }
    return (
      [...distinct.values()]
        .flatMap((action) => {
          const choice = chooseStarterStrategyQuestions(
            sids,
            action.masks,
            timing,
          );
          return choice
            ? [
                {
                  ...choice,
                  action,
                  seconds: action.seconds,
                  lastResort: action.lastResort,
                },
              ]
            : [];
        })
        .sort(
          (a, b) =>
            compareStarterSidExperiments(a, b) ||
            a.action.id.localeCompare(b.action.id),
        )[0] ?? null
    );
  }
  return input.scenarios.map((sid) => {
    let remaining = initial.get(signature(sid, drawing!));
    if (!remaining?.includes(sid))
      throw Error(
        "The strategy scenario must belong to the complete SID window.",
      );
    const paintingOnly = remaining.length === 1;
    let current: KnownFacts = facts,
      collected = baseCollected.slice();
    let experiments = 0,
      seconds = 0,
      defenseTarget: number | null = null,
      speedTarget: number | null = null;
    while (remaining.length > 1 && experiments < 64 && full.length <= 4096) {
      const key = JSON.stringify([
        remaining,
        current.heldItem,
        current.moves,
        current.pp,
        current.ppBonuses,
        current.evs,
        current.pokerus,
        collected,
      ]);
      let next = choices.get(key);
      if (next === undefined) {
        next = choose(remaining, current, collected);
        choices.set(key, next);
      }
      if (!next) break;
      const after = [...next.groups.find((group) => group.has(sid))!];
      const resultingFacts = { ...current, ...next.action.changes };
      if (audit)
        audit({
          sid,
          before: remaining.slice(),
          after,
          action: {
            id: next.action.id,
            stat: next.action.stat,
            target: next.action.target,
          },
          questions: next.questions,
          startingFacts: current,
          resultingFacts,
        });
      remaining = after;
      current = resultingFacts;
      if (next.action.item && !collected.includes(next.action.item))
        collected.push(next.action.item);
      if (next.action.stat === 2) defenseTarget = next.action.target!;
      if (next.action.stat === 3) speedTarget = next.action.target!;
      experiments++;
      seconds += next.seconds;
    }
    const resolved = remaining.length === 1;
    return {
      sid,
      paintingOnly,
      experiments: resolved ? experiments : null,
      seconds: resolved ? seconds : null,
      defenseTarget,
      speedTarget,
    };
  });
}
