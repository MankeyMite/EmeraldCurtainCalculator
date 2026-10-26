import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  newStarterGuide,
  validateStarterGuide,
  starterIdentity,
  newStarterAttempt,
} from "../src/core/starterGuide";
import { knownPlaintext } from "../src/core/inference";
import { starterPlaintext, routeCheckpoint } from "../src/core/starterRoute";
import { makeHypothesis } from "../src/core/sid";
import {
  scanStarterCatalogue,
  catalogueCandidateMasks,
} from "../src/core/starterCatalogueScan";
import { starterStrategyMasks } from "../src/core/starterSidStrategy";
import {
  starterRecommendationKey,
  catalogueStarterRoute,
} from "../src/core/starterRecommendation";
import type { StarterCatalogue } from "../src/core/starterCatalogue";
import {
  STARTER_COMPANION_STEP,
  withStarterStorageInstructions,
} from "../src/core/starterChecklist";

const catalogue = JSON.parse(
  fs.readFileSync("src/data/starter-catalogue.json", "utf8"),
) as StarterCatalogue;

test("player character persists independently of Pokemon gender and supplies the verified origin nibble", () => {
  const s = newStarterGuide();
  assert.equal(starterIdentity(s).otGender, undefined);
  assert.equal(knownPlaintext(starterIdentity(s))[79], (1 << 2) | (1 << 10));
  const unknownKey = starterRecommendationKey(s);
  for (const [playerGender, nibble] of [
    ["male", 2],
    ["female", 10],
  ] as const) {
    s.playerGender = playerGender;
    s.gender = "female";
    assert.equal(starterIdentity(s).otGender, playerGender);
    assert.equal(starterIdentity(s).gender, "female");
    assert.equal(routeCheckpoint(s).otGender, playerGender);
    assert.equal(knownPlaintext(starterIdentity(s))[79], 1 << nibble);
    assert.equal(newStarterAttempt(s).playerGender, playerGender);
    assert.equal(
      validateStarterGuide(JSON.parse(JSON.stringify(s))).playerGender,
      playerGender,
    );
    assert.notEqual(starterRecommendationKey(s), unknownKey);
  }
  assert.throws(
    () => validateStarterGuide({ ...s, playerGender: "guess" }),
    /Invalid starter guide/,
  );
  const legacy = { ...s };
  delete legacy.playerGender;
  assert.equal(
    starterIdentity(validateStarterGuide(legacy)).otGender,
    undefined,
  );
});

test("boy and girl catalogue scans match actual singleton plaintext and put OT gender in the routed starter", () => {
  const small = {
    ...catalogue,
    spreads: catalogue.spreads.slice(0, 3),
    rules: { ...catalogue.rules, maxAdvance: 1002 },
  };
  const state = newStarterGuide();
  state.tid = "50998";
  for (const otGender of ["male", "female"] as const) {
    state.playerGender = otGender;
    const scan = scanStarterCatalogue(small, {
      tid: 50998,
      otGender,
      intro: state.intro,
      starter: { ...state.starter, uncertainty: 1 },
    });
    assert.equal(scan.fullSidCount, 121);
    assert.equal(scan.priority.length, 19);
    for (const landing of scan.landings) {
      const spread = small.spreads.find((s) => s.advance === landing.advance)!;
      const prep = small.preparations[landing.option.preparation];
      const h = {
        ...makeHypothesis(spread.pid, 50998, 0),
        rng: { ivs: spread.ivs, abilitySlot: spread.abilitySlot },
      };
      const plain = starterPlaintext(
        { ...prep.facts, heldItem: landing.option.item, otGender },
        h,
      );
      const expected = starterStrategyMasks(plain, spread.pid);
      expected.forEach((_, n) => (expected[n] |= 1));
      assert.deepEqual(
        catalogueCandidateMasks(spread, landing.option, otGender),
        expected,
      );
      const value = (spread.pid >>> 28) ^ (otGender === "male" ? 2 : 10);
      assert.ok(expected[3] & (1 << value));
    }
    const spread = small.spreads[1];
    state.starterRecommendation = {
      key: starterRecommendationKey(state),
      advance: spread.advance,
      species: state.species,
    };
    const plan = catalogueStarterRoute(small, state, {
      ...spread,
      lastAdvance: spread.advance,
      methods: ["Method1"],
      slot: 0,
      level: 5,
    })!;
    assert.equal(plan.facts.otGender, otGender);
    assert.equal(
      plan.instructions.filter((t) => t === STARTER_COMPANION_STEP).length,
      1,
    );
    assert.match(plan.instructions.at(-1)!, /^Swap your caught/);
    assert.doesNotMatch(plan.instructions.join(" "), /Heal at|Heal and/);
  }
});

test("adding the early catch and final swap to a saved route preserves facts, checkmarks and battle actions", () => {
  const s = newStarterGuide();
  const plan = {
    facts: routeCheckpoint(s),
    instructions: [
      "Avoid all wild battles except those listed.",
      "Defeat the Route 103 rival.",
      "Defeat Youngster Calvin.",
      "Heal at the Pok\u00e9mon Center; PC storage restores PP.",
      "Place the starter in Box 8, slot 5.",
    ],
    done: [true, true, true, true, false],
    score: { total: 1, worstCase: 1, expected: 1 },
    actions: [
      {
        index: 2,
        battles: [
          { id: "calvin", species: 286, count: 1, multiplier: 1 as const },
        ],
      },
    ],
  };
  const updated = withStarterStorageInstructions(plan, true);
  assert.equal(updated.facts, plan.facts);
  assert.deepEqual(updated.done, [true, true, false, true, true, false]);
  assert.equal(updated.instructions[2], STARTER_COMPANION_STEP);
  assert.equal(updated.actions![0].index, 3);
  assert.deepEqual(updated.actions![0].battles, plan.actions[0].battles);
  assert.match(updated.instructions.at(-1)!, /^Swap your caught/);
  assert.deepEqual(withStarterStorageInstructions(updated, true), updated);
  assert.ok(
    !withStarterStorageInstructions(plan, false).instructions.includes(
      STARTER_COMPANION_STEP,
    ),
  );
});
