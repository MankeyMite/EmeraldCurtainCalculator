import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RESEARCH_EXAMPLES, loadResearchExample } from "../src/core/examples";
import { loadSession } from "../src/core/session";
import { compareCandidate, recordMasks } from "../src/core/constraints";
import { decodePokemon } from "../src/core/pokemon";
import { genderForPid, speciesTraits } from "../src/core/traits";
import { analyzeConstraints } from "../src/core/inference";

const references = {
  dots: "research/fixtures/emulator-ss8/slot5.ek3",
  skarmory: "research/fixtures/skarmory-test.ek3",
  latios: "research/fixtures/latios-test-box.ek3",
};
const counts = { dots: 1n, skarmory: 20n, latios: 5703n };
for (const entry of RESEARCH_EXAMPLES) {
  test(
    "public " +
      entry.id +
      " example preserves saved observations, facts and reference bytes",
    () => {
      const example = loadResearchExample(entry.id);
      const saved = loadSession(
        fs.readFileSync(
          "research/fixtures/solver-example-" + entry.id + ".json",
          "utf8",
        ),
      );
      if (entry.id === "dots") {
        saved.knownFacts = { ...saved.knownFacts, gender: "male", ability: 48 };
      }
      assert.deepEqual(example.session, saved);
      assert.deepEqual(
        Buffer.from(example.records[5]!),
        fs.readFileSync(references[entry.id]),
      );
      assert.equal(example.session.knownFacts.pid, undefined);
      const comparison = compareCandidate(
        saved.observations,
        example.records,
        saved.knownFacts,
      );
      assert.equal(
        comparison.matches.length,
        entry.id === "skarmory" ? 160 : 192,
      );
      assert.deepEqual(comparison.contradictions, []);
      assert.deepEqual(comparison.factContradictions, []);
      const inference = analyzeConstraints(
        recordMasks(saved.observations, 5),
        saved.knownFacts,
      );
      assert.equal(inference.pidCount, counts[entry.id]);
      if (entry.id === "skarmory") {
        assert.equal(example.records[4], undefined);
        assert.equal(example.records[6], undefined);
        assert.ok(saved.observations.slice(0, 16).every((n) => n === -1));
        assert.ok(saved.observations.slice(176).every((n) => n === -1));
        assert.equal(saved.knownFacts.ivs?.[0], 31);
        assert.equal(saved.summaryStats?.level, 16);
      } else {
        const directory =
          entry.id === "dots" ? "emulator-ss8" : "emulator-latios-ss9";
        for (const slot of [4, 6] as const) {
          assert.deepEqual(
            Buffer.from(example.records[slot]!),
            fs.readFileSync(
              "research/fixtures/" + directory + "/slot" + slot + ".ek3",
            ),
          );
        }
      }
    },
  );
}
test("example edits cannot change the catalog, solver facts or a later example load", () => {
  const first = loadResearchExample("skarmory"),
    original = loadResearchExample("skarmory");
  const saved = JSON.stringify(first.session);
  first.records[5]!.fill(0);
  assert.equal(JSON.stringify(first.session), saved);
  first.session.observations.fill(-1);
  first.session.knownFacts.evs!.fill(255);
  first.session.summaryStats!.stats.fill(null);
  assert.deepEqual(loadResearchExample("skarmory"), original);
});

test("DOTS summary-visible gender and Early Bird establish PID 132 without supplying PID or SID", () => {
  const example = loadResearchExample("dots");
  const original = loadSession(
    fs.readFileSync("research/fixtures/solver-example-dots.json", "utf8"),
  );
  const masks = recordMasks(example.session.observations, 5);
  assert.equal(original.knownFacts.gender, undefined);
  assert.equal(original.knownFacts.ability, undefined);
  assert.deepEqual(example.session.observations, original.observations);
  assert.equal(analyzeConstraints(masks, original.knownFacts).pidCount, 5n);
  const known = example.session.knownFacts;
  assert.equal(known.pid, undefined);
  assert.equal(known.sid, undefined);
  assert.equal(known.gender, "male");
  assert.equal(known.ability, 48);
  const decoded = decodePokemon(example.records[5]!);
  assert.equal(genderForPid(decoded.species, decoded.pid), "male");
  assert.equal(
    speciesTraits(decoded.species)!.abilities[decoded.ability].name,
    "Early Bird",
  );
  assert.equal(
    speciesTraits(decoded.species)!.abilities[decoded.ability].id,
    known.ability,
  );
  const inferred = analyzeConstraints(masks, known);
  assert.equal(inferred.pidCount, 1n);
  assert.deepEqual(inferred.pidValues, [132]);
  assert.equal(inferred.pidValues![0], decoded.pid);
  const { ability: _, ...withoutAbility } = known;
  assert.equal(analyzeConstraints(masks, withoutAbility).pidCount, 4n);
  const { gender: __, ...abilityOnly } = known;
  assert.equal(analyzeConstraints(masks, abilityOnly).pidCount, 1n);
});
