import { knownPlaintext } from "./inference";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import type { KnownFacts, Observations } from "./constraints";
import type { Hypothesis } from "./sid";
import { makeHypothesis } from "./sid";
import { swapMoveFacts, moveName } from "./moveLearningExperiments";
import { maxPp } from "./pp";
import type { RngSpread } from "./rng";
import {
  type StarterGuideState,
  type RouteSetup,
  battleEvs,
  starterIdentity,
  guideSidCandidates,
} from "./starterGuide";
import { validateFacts } from "./session";
import {
  STARTER_ITEMS,
  starterItemSource,
  starterItemCost,
  starterAcquisitionSteps,
} from "./starterItems";
import { coverStarterItems } from "./starterItemCover";
import {
  preserveStarterChecklist,
  starterCollectedItems,
} from "./starterChecklist";
import {
  projectStarterJourney,
  starterJourneyMoves,
  type JourneyStep,
} from "./starterJourney";

const itemInstruction = (id: number) => {
  const source = starterItemSource(id);
  return source
    ? `${source.instruction} Give it to the starter after all battles.`
    : "";
};
const itemEffort = (id: number) =>
  id ? 30 + starterItemCost([id]).seconds : 0;

export type SidQuestion = {
  index: number;
  transparent: number;
  black: number;
  total: number;
  worstCase: number;
  field: string;
};
export function starterPlaintext(facts: KnownFacts, h: Hypothesis) {
  const plain = knownPlaintext({
    ...facts,
    ...(h.rng ? { ivs: h.rng.ivs } : {}),
    isEgg: 0,
  });
  if (h.rng) plain[87] &= h.rng.abilitySlot ? 0xff00 : 0x00ff;
  return plain;
}
function supports(index: number, h: Hypothesis, plain: number[]) {
  if (index < 24) return 1 << ((h.pid >>> ((index - 16) * 4)) & 15 ? 1 : 0);
  if (index < 28) return 1 << ((h.tid >>> ((index - 24) * 4)) & 15 ? 1 : 0);
  if (index < 32) return 1 << ((h.sid >>> ((index - 28) * 4)) & 15 ? 1 : 0);
  const p = index - 80,
    logical =
      SUBSTRUCT_POSITIONS[h.pid % 24].indexOf(Math.floor(p / 24)) * 24 +
      (p % 24);
  const mask = plain[logical],
    bit = 1 << ((h.key >>> ((p % 8) * 4)) & 15);
  return (mask & bit ? 1 : 0) | (mask & (65535 ^ bit) ? 2 : 0);
}
// Reuse the exact guide prediction support for timing-based recommendations.
export { supports as starterPixelSupport };

const indices = [
  ...Array.from({ length: 16 }, (_, n) => 16 + n),
  ...Array.from({ length: 96 }, (_, n) => 80 + n),
];

/** Union outcomes by SID, not by PID/IV hypothesis. Unknown plaintext keeps a
 * SID in both branches. No guessed probability is assigned to unknown digits. */
export function usefulStarterPixels(
  candidates: Hypothesis[],
  facts: KnownFacts,
  observations: Observations,
) {
  if (!candidates.length) return [];
  const prepared = candidates.map((h) => ({
    h,
    plain: starterPlaintext(facts, h),
  }));
  const total = new Set(candidates.map((h) => h.sid)).size;
  if (total < 2) return [];
  return indices
    .filter((index) => observations[index] === -1)
    .flatMap((index) => {
      const zero = new Set<number>(),
        black = new Set<number>();
      for (const { h, plain } of prepared) {
        const mask = supports(index, h, plain);
        if (mask & 1) zero.add(h.sid);
        if (mask & 2) black.add(h.sid);
      }
      if (
        !zero.size ||
        !black.size ||
        (zero.size === total && black.size === total)
      )
        return [];
      return [
        {
          index,
          transparent: zero.size,
          black: black.size,
          total,
          worstCase: Math.max(zero.size, black.size),
          field:
            index >= 28 && index < 32
              ? `SID digit S${32 - index}`
              : index < 24
                ? "PID header"
                : "Encrypted Pokémon data",
        },
      ];
    })
    .sort(
      (a, b) =>
        a.worstCase - b.worstCase ||
        a.transparent + a.black - (b.transparent + b.black) ||
        a.index - b.index,
    );
}

function routePatterns(candidates: Hypothesis[], facts: KnownFacts) {
  const rows = candidates.map((h) => ({
    h,
    plain: starterPlaintext(facts, h),
  }));
  // Only physical positions whose binary outcome is determined for every
  // surviving spread are used. Discarding ambiguous positions weakens the
  // prediction; it never assumes one PID/permutation or fills unknown data.
  const common = indices.filter((index) =>
    rows.every(({ h, plain }) => [1, 2].includes(supports(index, h, plain))),
  );
  return rows.map(({ h, plain }) => {
    let key = "";
    for (const index of common)
      key += supports(index, h, plain) === 1 ? "0" : "1";
    return key;
  });
}
function scorePatterns(candidates: Hypothesis[], patterns: string[]) {
  const groups = new Map<string, Set<number>>();
  candidates.forEach((h, i) => {
    const key = patterns[i];
    const group = groups.get(key) ?? new Set<number>();
    group.add(h.sid);
    groups.set(key, group);
  });
  const sizes = [...groups.values()].map((g) => g.size),
    total = new Set(candidates.map((h) => h.sid)).size;
  const mass = sizes.reduce((a, b) => a + b, 0);
  return {
    total,
    worstCase: Math.max(0, ...sizes),
    expected: mass ? sizes.reduce((a, n) => a + n * n, 0) / mass : 0,
  };
}
function routeScore(candidates: Hypothesis[], facts: KnownFacts) {
  return scorePatterns(candidates, routePatterns(candidates, facts));
}

/** Collect only additional items whose combined outcomes distinguish more
 * surviving SIDs than the complete starter setup already does. Repeated
 * plaintext/PID tests and correlations between SID digits add no gain. */
export function planStarterItems(
  candidates: Hypothesis[],
  facts: KnownFacts,
  consumedItems: number[] = [],
) {
  const patterns = routePatterns(candidates, facts);
  const choices = STARTER_ITEMS.filter(
    (source) =>
      source.id !== facts.heldItem && !consumedItems.includes(source.id),
  ).map((source) => ({
    ...source,
    patterns: routePatterns(candidates, { ...facts, heldItem: source.id }),
  }));
  const groups = new Map<string, number[]>();
  patterns.forEach((pattern, index) => {
    const group = groups.get(pattern) ?? [];
    group.push(index);
    groups.set(pattern, group);
  });
  const requirements = new Set<number>();
  for (const group of groups.values())
    for (let a = 0; a < group.length; a++)
      for (let b = a + 1; b < group.length; b++) {
        const i = group[a],
          j = group[b];
        if (candidates[i].sid === candidates[j].sid) continue;
        let mask = 0;
        choices.forEach((choice, index) => {
          if (choice.patterns[i] !== choice.patterns[j]) mask |= 1 << index;
        });
        if (mask) requirements.add(mask);
      }
  const items = coverStarterItems(
    [...requirements],
    choices.map((choice) => choice.id),
  );
  const combined = patterns.map(
    (pattern, row) =>
      pattern +
      choices
        .filter((choice) => items.includes(choice.id))
        .map((choice) => choice.patterns[row])
        .join(""),
  );
  return { items, score: scorePatterns(candidates, combined) };
}

export function legalMoveOrders(facts: KnownFacts) {
  const occupied = (facts.moves ?? []).flatMap((m, i) => (m ? [i] : []));
  let states = [{ facts, instructions: [] as string[] }];
  // Breadth first all permutations of occupied slots, including slots 3/4.
  const seen = new Set([JSON.stringify(facts.moves)]);
  for (let at = 0; at < states.length; at++)
    for (let a = 0; a < occupied.length; a++)
      for (let b = a + 1; b < occupied.length; b++) {
        const i = occupied[a],
          j = occupied[b],
          next = {
            ...states[at].facts,
            ...swapMoveFacts(states[at].facts, i, j),
          },
          key = JSON.stringify(next.moves);
        if (seen.has(key)) continue;
        seen.add(key);
        states.push({
          facts: next,
          instructions: [
            ...states[at].instructions,
            `Swap occupied move slots ${i + 1} and ${j + 1} (${moveName(states[at].facts.moves![i]!)} / ${moveName(states[at].facts.moves![j]!)}). PP follows its move.`,
          ],
        });
      }
  return states;
}
export function routeCheckpoint(s: StarterGuideState): KnownFacts {
  // Exact EXP is not required on the early route. Its low half tests TID,
  // while the zero high half duplicates other known-zero SID plaintext.
  // Leave it unknown rather than assuming an EXP value from the level.
  return validateFacts({
    ...starterIdentity(s),
    evs: s.evsKnown ? battleEvs(s.battles) : Array(6).fill(null),
    moves: s.moves,
    pp: s.moves.map((m) =>
      m === null ? null : m === 0 ? 0 : (maxPp(m, 0) ?? null),
    ),
    ppBonuses: 0,
    heldItem: 0,
    ...(s.battles.some((b) => b.multiplier !== 1) ? {} : { pokerus: 0 }),
    contest: [0, 0, 0, 0, 0, 0],
    ribbons: 0,
    ribbonTail: 0,
    growthPadding: 0,
    headerPadding: 0,
    headerFlags: 2,
    language: 2,
  });
}
export function planStarterRoute(
  s: StarterGuideState,
  spreads: RngSpread[],
  survivingSids?: number[],
): RouteSetup {
  const journey = projectStarterJourney(s);
  const base = {
      ...routeCheckpoint({ ...s, battles: journey.battles }),
      ...(spreads.length === 1
        ? { pid: spreads[0].pid, ivs: spreads[0].ivs.slice() }
        : {}),
    },
    allowedSids = new Set(guideSidCandidates(s)),
    sids =
      survivingSids === undefined
        ? [...allowedSids]
        : [...new Set(survivingSids)].filter((sid) => allowedSids.has(sid));
  if (!spreads.length)
    throw Error("Resolve the starter search before planning the route.");
  if (!sids.length)
    throw Error(
      "No SID candidates remain. Review the SID timing and recorded evidence.",
    );
  // No partial subset is substituted if the exact route comparison is too big.
  if (spreads.length * sids.length > 4096)
    return preserveStarterChecklist(s, {
      facts: { ...base, evs: routeCheckpoint(s).evs },
      instructions: [
        "Avoid all wild battles and optional trainers. Record every required battle the starter gains EXP from.",
        "Keep the current move order and no held item.",
        "Check the current moves. PC storage fully heals the starter and restores PP.",
        "Place the starter in Box 8, slot 5, with slots 4 and 6 empty. Enter Rustboro Trainer’s School.",
      ],
      score: {
        worstCase: sids.length,
        expected: sids.length,
        total: sids.length,
      },
      done: [false, false, false, false],
    });
  const candidates = spreads.flatMap((e) =>
    sids.map((sid) => ({
      ...makeHypothesis(e.pid, Number(s.tid), sid),
      rng: { ivs: e.ivs, abilitySlot: e.abilitySlot },
    })),
  );
  type Option = {
    facts: KnownFacts;
    instructions: string[];
    seconds: number;
    train?: RouteSetup["train"];
    steps: JourneyStep[];
    consumedItems: number[];
  };
  let best: Option = {
      facts: base,
      instructions: journey.steps.map((step) => step.text),
      seconds: 0,
      steps: journey.steps,
      consumedItems: s.usedTms ?? [],
    },
    score = routeScore(candidates, base);
  const utility = (r: ReturnType<typeof routeScore>, seconds: number) =>
    r.expected ? Math.log2(r.total / r.expected) / (1 + seconds / 240) : 0;
  const consider = (option: Option) => {
    const next = routeScore(candidates, option.facts);
    if (
      utility(next, option.seconds) > utility(score, best.seconds) + 1e-9 ||
      (Math.abs(utility(next, option.seconds) - utility(score, best.seconds)) <
        1e-9 &&
        option.seconds < best.seconds)
    ) {
      best = option;
      score = next;
    }
  };
  // Coordinate search over affordable setup choices. Score full curtain outcome
  // partitions of distinct SIDs, not unique hex digits. This is a best evaluated
  // route estimate, not a promise that one observation resolves the SID.
  // Establish inexpensive item alternatives first, so leveling for a move
  // does not win merely by duplicating a test available from a cheap item.
  const plain = { ...best };
  for (const source of STARTER_ITEMS.filter(
    (source) => !plain.consumedItems.includes(source.id),
  ))
    consider({
      ...plain,
      facts: { ...plain.facts, heldItem: source.id },
      instructions: [...plain.instructions, itemInstruction(source.id)],
      seconds: itemEffort(source.id),
    });
  for (const option of starterJourneyMoves(s, journey.battles)) {
    const projected = {
      ...base,
      ...option.facts,
      evs: s.evsKnown
        ? battleEvs([
            ...journey.battles,
            ...option.steps.flatMap((step) => step.battles),
          ])
        : base.evs,
    };
    for (const order of legalMoveOrders(projected))
      consider({
        ...order,
        instructions: [
          ...journey.steps.map((step) => step.text),
          ...option.instructions,
          ...order.instructions,
        ],
        seconds: option.seconds + order.instructions.length * 30,
        steps: [...journey.steps, ...option.steps],
        consumedItems: [...(s.usedTms ?? []), ...option.consumedItems],
      });
  }
  const moved = {
    ...best,
    seconds: best.seconds - itemEffort(best.facts.heldItem ?? 0),
    instructions: best.instructions.filter(
      (text) => text !== itemInstruction(best.facts.heldItem ?? 0),
    ),
  };
  for (const item of [
    0,
    ...STARTER_ITEMS.filter(
      (source) => !moved.consumedItems.includes(source.id),
    ).map((source) => source.id),
  ])
    consider({
      ...moved,
      facts: { ...moved.facts, heldItem: item },
      seconds: moved.seconds + itemEffort(item),
      instructions: [
        ...moved.instructions,
        ...(item ? [itemInstruction(item)] : []),
      ],
    });
  if (s.evsKnown && !s.battles.some((b) => b.multiplier !== 1)) {
    const equipped = { ...best };
    for (const [stat, species, yieldEv] of [
      [2, 291, 2],
      [3, 288, 1],
    ] as const)
      for (let count = 1; count <= 8; count++) {
        const evs = (equipped.facts.evs as number[]).slice(),
          total = evs.reduce((a, b) => a + b, 0);
        if (evs[stat] + count * yieldEv > 110 || total + count * yieldEv > 510)
          continue;
        evs[stat] += count * yieldEv;
        const text = `Defeat exactly ${count} ${stat === 2 ? "Silcoon in Petalburg Woods (2 Defense EVs each)" : "Zigzagoon on Route 101/103/104 (1 Speed EV each)"} with the starter participating, to reach ${evs[stat]} ${stat === 2 ? "Defense" : "Speed"} EVs. Avoid all other wild battles and optional trainers. Cancel evolution.`;
        const step = {
          text,
          battles: [
            {
              id: `journey-ev-${stat}-${evs[stat]}`,
              species,
              count,
              multiplier: 1 as const,
            },
          ],
        };
        consider({
          ...equipped,
          facts: { ...equipped.facts, evs, experience: undefined },
          seconds: equipped.seconds + count * (stat === 2 ? 120 : 60),
          train: { species, count },
          steps: [...equipped.steps, step],
          instructions: [...equipped.instructions, text],
        });
      }
  }
  // IV, held-item and EV pixels can test the same SID values. Reconsider the
  // item after choosing EV training, using the complete combined outcome.
  if (best.train) {
    const trained = {
      ...best,
      instructions: best.instructions.filter(
        (text) => text !== itemInstruction(best.facts.heldItem ?? 0),
      ),
    };
    for (const item of [
      0,
      ...STARTER_ITEMS.filter(
        (source) => !trained.consumedItems.includes(source.id),
      ).map((source) => source.id),
    ]) {
      consider({
        ...trained,
        facts: { ...trained.facts, heldItem: item },
        seconds:
          trained.seconds -
          itemEffort(trained.facts.heldItem ?? 0) +
          itemEffort(item),
        instructions: [
          ...trained.instructions,
          ...(item ? [itemInstruction(item)] : []),
        ],
      });
    }
  }
  // Choose the full item set jointly, so the first held item cannot force a
  // redundant acquisition to remain on the checklist.
  const coverage = planStarterItems(
    candidates,
    { ...best.facts, heldItem: undefined },
    best.consumedItems,
  );
  let firstItem = 0;
  let finalScore = routeScore(candidates, { ...best.facts, heldItem: 0 });
  for (const id of coverage.items) {
    const next = routeScore(candidates, { ...best.facts, heldItem: id });
    if (
      !firstItem ||
      next.expected < finalScore.expected ||
      (next.expected === finalScore.expected &&
        next.worstCase < finalScore.worstCase)
    ) {
      firstItem = id;
      finalScore = next;
    }
  }
  const items = firstItem
    ? [firstItem, ...coverage.items.filter((id) => id !== firstItem)]
    : [];
  const moveConfirmation = `Confirm the starter has these moves in this order: ${best.facts.moves?.map((m) => (m === null ? "unknown" : m === 0 ? "empty" : moveName(m))).join(" / ")}.`;
  const collected = starterCollectedItems(s);
  // Keep completed purchases visible, and ask only for newly needed items.
  const acquisitionSteps = [
    ...starterAcquisitionSteps(items.filter((id) => collected.has(id))),
    ...starterAcquisitionSteps(items.filter((id) => !collected.has(id))),
  ];
  const routeSteps = [
    ...best.instructions
      .filter((text) => text !== itemInstruction(best.facts.heldItem ?? 0))
      .map((text) => {
        const battle = best.steps.find((step) => step.text === text)
          ?.battles[0];
        const order = battle
          ? ((
              {
                "journey-rival": 10,
                "journey-calvin": 20,
                "journey-aqua": 50,
                "journey-james": 60,
              } as Record<string, number>
            )[battle.id] ?? 65)
          : text.includes("HM01 Cut")
            ? 87
            : text.includes("TM09 Bullet Seed")
              ? 70
              : text.startsWith("Keep ")
                ? 1
                : 98;
        return { text, order };
      }),
    ...acquisitionSteps,
  ].sort((a, b) => a.order - b.order);
  const instructions = [
    "Avoid all wild battles except any training listed below, and other optional trainers. Check off the listed battles once, rather than recording them again in the battle log. Decline any new moves not listed in this plan.",
    ...routeSteps.map((step) => step.text),
    moveConfirmation,
    "Check all four current moves before boxing; PC storage fully heals the starter and restores PP. Cancel evolution during this investigation.",
    firstItem
      ? `Before depositing, give ${starterItemSource(firstItem)!.item.name} to the starter. Keep the other listed items in your Bag for later curtain tests.`
      : "Remove any held item before depositing the starter.",
    "Place the starter in Box 8, slot 5. Keep slots 4 and 6 empty. Leave and reenter Rustboro Trainer’s School.",
  ];
  return preserveStarterChecklist(s, {
    itemPlanVersion: 2,
    facts: { ...best.facts, heldItem: firstItem },
    instructions,
    score: finalScore,
    items,
    actions: [
      ...acquisitionSteps.map((step) => ({
        index: instructions.indexOf(step.text),
        acquiredItems: step.acquiredItems,
      })),
      ...best.steps.map((step) => ({
        index: instructions.indexOf(step.text),
        battles: step.battles,
      })),
      {
        index: instructions.indexOf(moveConfirmation),
        moves: best.facts.moves?.slice(),
        beforeMoves: s.moves.slice(),
        consumedItems: best.consumedItems,
      },
    ],
    done: instructions.map(() => false),
    ...(best.train ? { train: best.train } : {}),
  });
}
