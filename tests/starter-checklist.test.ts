import test from "node:test";
import assert from "node:assert/strict";
import {
  newStarterGuide,
  newStarterAttempt,
  validateStarterGuide,
  checkStarterRoute,
  battleEvs,
  type RouteSetup,
} from "../src/core/starterGuide";
import {
  patchStarterGuide,
  preserveStarterChecklist,
  starterCollectedItems,
  starterTravelReady,
} from "../src/core/starterChecklist";
import { starterAcquisitionSteps } from "../src/core/starterItems";
import { routeCheckpoint } from "../src/core/starterRoute";

function fixture() {
  const s = validateStarterGuide({
    ...newStarterGuide(),
    species: 280,
    tid: "16780",
    moves: [10, 45, 116, 0],
  });
  const rival = {
    id: "journey-rival",
    species: 283,
    level: 5,
    count: 1,
    trainer: true,
    multiplier: 1 as const,
  };
  const acquisitions = starterAcquisitionSteps([111, 14, 18]);
  const instructions = [
    "Avoid other wild battles.",
    ...acquisitions.map((a) => a.text),
    "Defeat the rival's Mudkip.",
    "Swap occupied move slots 2 and 4 (Growl / Cut). PP follows its move.",
    "Confirm the starter has these moves in this order: Scratch / Cut / Focus Energy / Growl.",
    "Heal at the Pokémon Center.",
    "Before depositing, give ANTIDOTE to the starter.",
    "Place the starter in Box 8, slot 5.",
  ];
  s.route = {
    facts: {
      ...routeCheckpoint(s),
      moves: [10, 15, 116, 45],
      evs: battleEvs([...s.battles, rival]),
      heldItem: 14,
    },
    items: [111, 14, 18],
    instructions,
    done: instructions.map(() => false),
    score: { total: 3, expected: 2, worstCase: 2 },
    actions: [
      ...acquisitions.map((a) => ({
        index: instructions.indexOf(a.text),
        acquiredItems: a.acquiredItems,
      })),
      {
        index: instructions.indexOf("Defeat the rival's Mudkip."),
        battles: [rival],
      },
      {
        index: instructions.findIndex((t) => t.startsWith("Confirm")),
        moves: [10, 15, 116, 45],
        beforeMoves: s.moves.slice(),
      },
    ],
  };
  return s;
}

test("Ember and an extra logged trainer preserve completed acquisitions through rapid move edits and reload", () => {
  let s = fixture();
  for (let index = 0; index < s.route!.instructions.length; index++)
    if (
      !s.route!.instructions[index].startsWith("Swap") &&
      !s.route!.instructions[index].startsWith("Confirm")
    )
      s = checkStarterRoute(s, index, true);
  // Exercise migration from a save that only had route.done, before item metadata existed.
  delete s.completedRouteSteps;
  s.route!.actions = s.route!.actions!.filter((a) => !a.acquiredItems);
  const extra = {
    id: "extra-forest-trainer",
    species: 290,
    count: 1,
    multiplier: 1 as const,
  };
  const edited = patchStarterGuide(s, {
    moves: [10, 45, 116, 52],
    battles: [...s.battles, extra],
    route: null,
  });
  const editedAgain = patchStarterGuide(edited, {
    moves: [10, 52, 116, 45],
    route: null,
  });
  const restored = validateStarterGuide(
    JSON.parse(JSON.stringify(editedAgain)),
  );
  assert.equal(restored.route, null);
  assert.deepEqual(starterCollectedItems(restored), new Set([111, 14, 18]));
  const before = structuredClone(restored);
  const collected = starterCollectedItems(restored);
  const items = [111, 14, 18, 75];
  const acquisitions = [
    ...starterAcquisitionSteps(items.filter((id) => collected.has(id))),
    ...starterAcquisitionSteps(items.filter((id) => !collected.has(id))),
  ];
  const old = s.route!;
  const instructions = [
    ...acquisitions.map((a) => a.text),
    ...old.instructions.filter(
      (t) => !starterAcquisitionSteps(old.items!).some((a) => a.text === t),
    ),
  ];
  const plan: RouteSetup = {
    ...old,
    items,
    instructions,
    facts: {
      ...old.facts,
      moves: restored.moves,
      evs: battleEvs(restored.battles),
    },
    done: instructions.map(() => false),
    actions: [
      ...acquisitions.map((a) => ({
        index: instructions.indexOf(a.text),
        acquiredItems: a.acquiredItems,
      })),
      ...old.actions!.map((a) => ({
        ...a,
        index: instructions.indexOf(old.instructions[a.index]),
      })),
    ],
  };
  const result = preserveStarterChecklist(restored, plan);
  for (const acquisition of acquisitions)
    assert.equal(
      result.done[instructions.indexOf(acquisition.text)],
      acquisition.acquiredItems.every((id) => collected.has(id)),
    );
  assert.equal(
    acquisitions.filter((a) => a.text.includes("Mart")).length,
    2,
    "old purchases and new purchases stay separate",
  );
  assert.ok(
    acquisitions
      .find((a) => a.acquiredItems.includes(75))!
      .text.includes("X ATTACK"),
  );
  for (const prefix of [
    "Swap",
    "Confirm",
    "Heal",
    "Before depositing",
    "Place",
  ])
    assert.equal(
      result.done[instructions.findIndex((t) => t.startsWith(prefix))],
      false,
      `${prefix} needs the updated setup`,
    );
  const battleIndex = instructions.indexOf("Defeat the rival's Mudkip.");
  assert.equal(result.done[battleIndex], true);
  const after = checkStarterRoute(
    { ...restored, route: result },
    battleIndex,
    true,
  );
  assert.deepEqual(
    after.battles,
    restored.battles,
    "restoring/rechecking never duplicates EV gains",
  );
  assert.deepEqual(
    restored,
    before,
    "reconciliation does not apply planned actions or mutate evidence",
  );
});

test("unchecking an acquired item or removing a logged battle cannot be undone by an older checkmark", () => {
  let s = fixture();
  const itemIndex = s.route!.actions!.find((a) =>
    a.acquiredItems?.includes(111),
  )!.index;
  s = checkStarterRoute(s, itemIndex, true);
  s = checkStarterRoute(s, itemIndex, false);
  const rivalIndex = s.route!.actions!.find((a) => a.battles)!.index;
  s = checkStarterRoute(s, rivalIndex, true);
  const plan = s.route!;
  const corrected = patchStarterGuide(s, {
    route: null,
    battles: s.battles.filter((b) => b.id !== "journey-rival"),
  });
  const next = preserveStarterChecklist(corrected, {
    ...plan,
    done: plan.done.map(() => false),
  });
  assert.equal(next.done[itemIndex], false);
  assert.equal(next.done[rivalIndex], false);
});

test("completion is tied to the starter and trainer, and a timed reset starts with a clean checklist", () => {
  let s = fixture();
  s = checkStarterRoute(s, 1, true);
  const plan = s.route!;
  assert.ok(s.completedRouteSteps!.length);
  for (const next of [
    newStarterAttempt(s),
    patchStarterGuide(s, { tid: "123", route: null }),
    patchStarterGuide(s, { species: 283, route: null }),
  ]) {
    assert.deepEqual(next.completedRouteSteps, []);
    assert.ok(
      preserveStarterChecklist(next, {
        ...plan,
        done: plan.done.map(() => false),
      }).done.every((v) => !v),
    );
  }
});

test("a mismatching suggested moveset does not block entering the actual moves on arrival", () => {
  const s = fixture(),
    plan = s.route!;
  const ready = {
    ...plan,
    done: plan.instructions.map(
      (text) => !text.startsWith("Swap") && !text.startsWith("Confirm"),
    ),
  };
  assert.equal(starterTravelReady(ready), true);
  ready.done[1] = false;
  assert.equal(
    starterTravelReady(ready),
    false,
    "an uncollected required item still needs completing",
  );
});
