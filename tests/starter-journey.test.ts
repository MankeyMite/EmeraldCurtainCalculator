import test from "node:test";
import assert from "node:assert/strict";
import {
  newStarterGuide,
  battleEvs,
  creationMoves,
  checkStarterRoute,
  validateStarterGuide,
} from "../src/core/starterGuide";
import {
  starterJourney,
  projectStarterJourney,
  starterBattleExperience,
  starterLevelAt,
  starterJourneyMoves,
} from "../src/core/starterJourney";
import { planStarterItems, routeCheckpoint } from "../src/core/starterRoute";
import learnsets from "../src/data/level-up-learnsets.json";
import { makeHypothesis, solveSids } from "../src/core/sid";
import { newSnapshot } from "../src/core/investigation";

function stateFor(species: number) {
  const s = newStarterGuide();
  s.species = species;
  s.moves = creationMoves(species);
  s.readings = [
    {
      id: "initial",
      summary: { level: 5, stats: [20, 10, 10, 10, 10, 10] },
      evs: [0, 0, 0, 1, 0, 0],
    },
  ];
  return validateStarterGuide(s);
}

test("the verified route projects starter-dependent EVs and solo EXP without recording future battles", () => {
  for (const [species, evs] of [
    [277, [0, 2, 2, 1, 1, 0]],
    [280, [0, 3, 2, 1, 0, 0]],
    [283, [0, 2, 2, 2, 0, 0]],
  ] as const) {
    const s = stateFor(species),
      before = structuredClone(s);
    const forecast = projectStarterJourney(s);
    assert.deepEqual(battleEvs(forecast.battles), evs);
    assert.equal(starterBattleExperience(s.battles), 152);
    assert.equal(starterBattleExperience(forecast.battles), 548);
    assert.equal(starterLevelAt(species, 548), 9);
    assert.deepEqual(s, before);
    assert.match(forecast.steps.at(-1)!.text, /can be avoided/);
    s.routeDone = true;
    assert.deepEqual(
      projectStarterJourney(s).battles,
      s.battles,
      "arrival uses actual evidence, not the projected route",
    );
  }
  assert.equal(
    starterBattleExperience([
      { id: "manual", species: 290, count: 1, multiplier: 1 },
    ]),
    undefined,
  );
});

test("checklist completion records each fight exactly once and supports correction and restore", () => {
  const s = stateFor(280),
    steps = starterJourney(280);
  s.route = {
    facts: routeCheckpoint(s),
    instructions: steps.map((step) => step.text),
    done: steps.map(() => false),
    score: { total: 2, expected: 2, worstCase: 2 },
    actions: steps.map((step, index) => ({ index, battles: step.battles })),
  };
  let done = s;
  for (let i = 0; i < steps.length; i++)
    done = checkStarterRoute(done, i, true);
  assert.deepEqual(battleEvs(done.battles), [0, 3, 2, 1, 0, 0]);
  assert.deepEqual(checkStarterRoute(done, 0, true), done);
  assert.deepEqual(
    battleEvs(checkStarterRoute(done, 3, false).battles),
    [0, 3, 0, 1, 0, 0],
  );
  assert.equal(projectStarterJourney(done).steps.length, 0);
  assert.deepEqual(
    validateStarterGuide(JSON.parse(JSON.stringify(done))),
    done,
  );
  assert.equal(s.battles.length, 1);
});

test("early moves use actual Emerald compatibility and level-up training preserves Defense and Speed", () => {
  for (const species of [277, 280, 283]) {
    const s = stateFor(species),
      forecast = projectStarterJourney(s);
    const options = starterJourneyMoves(s, forecast.battles);
    assert.equal(
      options.some((option) => option.facts.moves?.includes(15)),
      species !== 283,
    );
    assert.equal(
      options.some((option) => option.facts.moves?.includes(331)),
      species === 277,
    );
    const levelMove = species === 280 ? 52 : species === 283 ? 55 : 98;
    const option = options.find(
      (option) =>
        option.facts.moves?.includes(levelMove) &&
        option.steps[0]?.battles[0].species === 290,
    )!;
    assert.ok(option);
    const extra = option.steps.flatMap((step) => step.battles);
    assert.equal(extra[0].count, species === 277 ? 6 : 1);
    assert.deepEqual(battleEvs(extra), [extra[0].count, 0, 0, 0, 0, 0]);
    const xp = starterBattleExperience([...forecast.battles, ...extra])!;
    assert.equal(starterLevelAt(species, xp), species === 277 ? 11 : 10);
    assert.equal(xp, species === 277 ? 776 : 586);
    if (species === 277) {
      const bullet = options.find((option) =>
        option.facts.moves?.includes(331),
      )!;
      assert.deepEqual(bullet.consumedItems, [297]);
      const helper = planStarterItems(
        [makeHypothesis(0, 0, 1), makeHypothesis(0, 0, 2)],
        bullet.facts,
        [297],
      );
      assert.ok(
        !helper.items.includes(297),
        "the consumed Bullet Seed TM cannot also be held",
      );
    }
    assert.deepEqual(
      starterJourneyMoves({ ...s, routeDone: true }, forecast.battles)[0].facts
        .moves,
      s.moves,
    );
  }
  assert.ok(
    learnsets["280"].some(([level, move]) => level === 28 && move === 98),
  );
  assert.ok(!learnsets["280"].some(([level]) => level === 11));
});

test("each black SID header pixel removes zero from its own position, with no predictions saved as evidence", () => {
  const pid = 0x12345678,
    tid = 123;
  const all = [0, 1, 0x10, 0x100, 0x1000, 0x1111, 0x1112, 0x2222];
  const snapshot = newSnapshot("drawing", "Initial curtain");
  const solve = () =>
    solveSids({ tid }, [snapshot], [pid], undefined, Infinity, all).sidValues;
  assert.deepEqual(solve(), all);
  let expected = all;
  for (let index = 28; index < 32; index++) {
    snapshot.observations[index] = 1;
    expected = expected.filter(
      (sid) => ((sid >>> ((index - 28) * 4)) & 15) !== 0,
    );
    assert.deepEqual(solve(), expected);
  }
  assert.deepEqual(expected, [0x1111, 0x1112, 0x2222]);
  snapshot.observations[28] = 0;
  assert.deepEqual(
    solve(),
    [],
    "contradictory transparent evidence also updates the candidate set",
  );
  assert.equal(
    snapshot.observations[80],
    -1,
    "unpainted encrypted pixels remain unrecorded",
  );
});
