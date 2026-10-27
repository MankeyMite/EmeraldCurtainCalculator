import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StarterTravelChecklist } from "../src/components/StarterGuideParts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  completeStarterRoute,
  newStarterGuide,
  newStarterAttempt,
  validateStarterGuide,
  checkStarterRoute,
  battleEvs,
  type RouteSetup,
} from "../src/core/starterGuide";
import {
  withStarterStorageInstructions,
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

test("Petalburg shopping is before Route 104 berries and forest battles", () => {
  const steps = starterAcquisitionSteps([17, 133]);
  const purchase = steps.find((step) => step.acquiredItems.includes(17))!;
  assert.ok(
    purchase.order < 24,
    "buy Awakening before leaving Petalburg for Route 104",
  );
  assert.ok(purchase.order < 30, "buy Awakening before Bug Catcher Lyle");
});

test("saved late Petalburg purchases move before the forest with their checks and actions intact", () => {
  const s = fixture();
  const battle = { id: "lyle", species: 290, count: 4, multiplier: 1 as const };
  const route: RouteSetup = {
    ...s.route!,
    instructions: [
      "Route 102 battle",
      "Fight Bug Catcher Lyle in Petalburg Woods",
      "At the Petalburg Mart on the way, buy AWAKENING",
      "Aqua Grunt in Petalburg Woods",
    ],
    done: [false, false, true, true],
    actions: [
      { index: 1, battles: [battle] },
      { index: 2, acquiredItems: [17] },
    ],
  };
  const before = structuredClone(route);
  const fixed = withStarterStorageInstructions(route, true);
  assert.deepEqual(fixed.instructions, [
    route.instructions[0],
    route.instructions[2],
    route.instructions[1],
    route.instructions[3],
  ]);
  assert.deepEqual(fixed.done, [false, true, false, true]);
  assert.deepEqual(fixed.actions, [
    { index: 2, battles: [battle] },
    { index: 1, acquiredItems: [17] },
  ]);
  assert.deepEqual(withStarterStorageInstructions(fixed, true), fixed);
  assert.deepEqual(route, before);
});

test("one Next records the route battles, acquired items, move order and consumed TM without duplication", () => {
  const s = fixture();
  s.route!.actions!.find((a) => a.moves)!.consumedItems = [297];
  const before = structuredClone(s);
  const completed = completeStarterRoute(s);
  assert.equal(completed.routeDone, true);
  assert.ok(completed.route!.done.every(Boolean));
  assert.deepEqual(completed.moves, s.route!.facts.moves);
  assert.deepEqual(battleEvs(completed.battles), s.route!.facts.evs);
  assert.deepEqual(completed.usedTms, [297]);
  assert.ok(starterCollectedItems(completed).has(14));
  assert.deepEqual(completeStarterRoute(completed), completed);
  assert.deepEqual(
    s,
    before,
    "merely displaying the plan must not record projected battles",
  );
  const partial = checkStarterRoute(
    s,
    s.route!.actions!.find((a) => a.battles)!.index,
    true,
  );
  assert.deepEqual(completeStarterRoute(partial).battles, completed.battles);
});

test("route page uses bullets and contains held item and PC placement without healing or checkbox instructions", () => {
  const s = fixture();
  const markup = renderToStaticMarkup(
    createElement(StarterTravelChecklist, { plan: s.route! }),
  );
  assert.match(markup, /<ul>/);
  assert.doesNotMatch(
    markup,
    /<input|<ol>|check off|Checking off|fully heals|restores PP|choose Next to enter/i,
  );
  assert.match(
    markup,
    /Arrange the moves in this order: Scratch \/ Cut \/ Focus Energy \/ Growl/,
  );
  assert.match(markup, /Before depositing, give ANTIDOTE/);
  assert.match(markup, /Box 8, slot 5/);
  assert.match(markup, /When you have followed this plan, choose Next/);
});

test("a training route is confirmed once with its exact EV gain", () => {
  const s = fixture();
  s.route = {
    ...s.route!,
    instructions: [
      "Defeat two Zigzagoon",
      "Keep moves",
      "Box the starter in Box 8, slot 5",
    ],
    done: [false, false, false],
    actions: undefined,
    train: { species: 288, count: 2 },
  };
  const completed = completeStarterRoute(s);
  assert.equal(battleEvs(completed.battles)[3], battleEvs(s.battles)[3] + 2);
  assert.deepEqual(completeStarterRoute(completed).battles, completed.battles);
});
