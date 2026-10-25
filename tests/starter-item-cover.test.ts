import test from "node:test";
import assert from "node:assert/strict";
import { coverStarterItems } from "../src/core/starterItemCover";
import {
  STARTER_ITEMS,
  starterItemCost,
  starterItemSource,
  starterShoppingInstructions,
} from "../src/core/starterItems";
import { planStarterItems, routeCheckpoint } from "../src/core/starterRoute";
import { newStarterGuide } from "../src/core/starterGuide";
import { makeHypothesis } from "../src/core/sid";
import { knownPlaintext } from "../src/core/inference";

test("joint item cover matches a brute-force minimum including shared Mart trips", () => {
  const ids = [13, 18, 14, 34, 183, 17];
  let seed = 123456;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const cost = (subset: number[]) => [
    starterItemCost(subset).seconds + subset.length * 30,
    subset.length,
    starterItemCost(subset).price,
  ];
  const compare = (a: number[], b: number[]) =>
    a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  for (let run = 0; run < 80; run++) {
    const requirements = Array.from(
      { length: 1 + (random() % 12) },
      () => 1 + (random() % 63),
    );
    let oracle: number[] | undefined;
    for (let mask = 0; mask < 64; mask++)
      if (requirements.every((required) => required & mask)) {
        const subset = ids.filter((_, i) => mask & (1 << i));
        if (!oracle || compare(cost(subset), cost(oracle)) < 0) oracle = subset;
      }
    const selected = coverStarterItems(requirements, ids);
    assert.deepEqual(cost(selected), cost(oracle!));
    const mask = selected.reduce(
      (mask, id) => mask | (1 << ids.indexOf(id)),
      0,
    );
    assert.ok(requirements.every((required) => required & mask));
    for (const id of selected)
      assert.ok(
        requirements.some(
          (required) => !(required & (mask & ~(1 << ids.indexOf(id)))),
        ),
        "every selected item is necessary for the retained coverage",
      );
  }
});

test("selected items preserve all obtainable SID distinctions without duplicate B tests", () => {
  const facts = {
    ...routeCheckpoint(newStarterGuide()),
    ivs: [0, 0, 0, 0, 0, 0],
    evs: [0, 0, 0, 0, 0, 0],
    moves: [0, 0, 0, 0],
    pp: [0, 0, 0, 0],
  };
  const candidates = Array.from({ length: 15 }, (_, n) =>
    makeHypothesis(0, 0, 0x11 + n),
  );
  // Independent binary XOR outcomes in logical order. Fixed PID permutation
  // only rearranges these columns. Unknown columns are never filled in.
  const rows = (item: number | undefined) => {
    const plain = knownPlaintext({ ...facts, heldItem: item });
    const outcomes = candidates.map((h) => [
      ...Array.from({ length: 4 }, (_, n) =>
        (h.sid >>> (n * 4)) & 15 ? "1" : "0",
      ),
      ...plain.map((mask, n) => {
        const bit = 1 << ((h.key >>> ((n % 8) * 4)) & 15);
        return mask === bit ? "0" : mask & bit ? "?" : "1";
      }),
    ]);
    const common = outcomes[0]
      .map((_, n) => n)
      .filter((n) => outcomes.every((row) => row[n] !== "?"));
    return outcomes.map((row) => common.map((n) => row[n]).join(""));
  };
  const base = rows(0);
  const partition = (ids: number[]) => {
    const itemRows = ids.map(rows),
      groups = new Map<string, number[]>();
    candidates.forEach((h, n) => {
      const key = base[n] + itemRows.map((r) => r[n]).join("");
      const group = groups.get(key) ?? [];
      group.push(h.sid);
      groups.set(key, group);
    });
    return [...groups.values()].sort((a, b) => a[0] - b[0]);
  };
  const selected = planStarterItems(candidates, facts).items;
  assert.ok(selected.length > 0);
  assert.deepEqual(
    partition(selected),
    partition(STARTER_ITEMS.map((source) => source.id)),
  );
  assert.ok(
    selected.includes(75) || selected.includes(139),
    "B remains available in the useful SID position",
  );
  assert.ok(
    !(selected.includes(75) && selected.includes(139)),
    "X Attack and Oran Berry both testing B in this position is redundant",
  );
  for (const id of selected)
    assert.notDeepEqual(
      partition(selected.filter((other) => other !== id)),
      partition(selected),
    );
});

test("shop instructions group Rustboro purchases and keep Awakening in Petalburg", () => {
  const instructions = starterShoppingInstructions([14, 18, 22, 86, 17, 14]);
  assert.equal(instructions.length, 2);
  assert.match(instructions[0], /Petalburg/);
  assert.match(instructions[0], /AWAKENING/);
  assert.match(instructions[0], /250 money total/);
  assert.match(instructions[1], /Rustboro/);
  assert.match(instructions[1], /ANTIDOTE, PARLYZ HEAL, SUPER POTION, REPEL/);
  assert.match(instructions[1], /1350 money total/);
  assert.doesNotMatch(instructions.join(" "), /hidden|Route 116/);
  assert.equal(
    starterItemCost([14, 18]).seconds,
    40,
    "one shop visit, two short purchases",
  );
  assert.equal(starterItemSource(17)!.shop, "Petalburg");
  assert.equal(starterItemSource(86)!.shop, "Rustboro");
});
