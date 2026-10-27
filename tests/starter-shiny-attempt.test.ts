import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newStarterGuide,
  validateStarterGuide,
  newShinyAttempt,
  STARTERS,
  nearbyStarters,
  searchShinyStarters,
  shinyStarterSpecies,
  matchShinyStarterAttempt,
  starterAbility,
} from "../src/core/starterGuide";
import {
  calibrateStarterLanding,
  targetCountdown,
  STARTER_LANDING_RADIUS,
  EMERALD_FPS,
} from "../src/core/starterTiming";
import {
  StarterSpreadTable,
  StarterTraitsForm,
} from "../src/components/StarterGuideParts";
import { calculateStat } from "../src/core/stats";
import { speciesTraits } from "../src/core/traits";

function fixture() {
  const state = newStarterGuide();
  state.species = 280; // Torchic used for the investigation.
  state.shinySpecies = 283; // Mudkip chosen for the shiny attempt.
  state.tid = "48734";
  state.confirmedSid = 49423;
  state.selected = { advance: 10725 } as NonNullable<typeof state.selected>;
  const spreads = nearbyStarters(state, STARTER_LANDING_RADIUS);
  state.selected = spreads.find((s) => s.advance === 10725)!;
  return { state, spreads };
}

function summary(
  species: number,
  spread: ReturnType<typeof nearbyStarters>[number],
) {
  const traits = speciesTraits(species)!;
  return {
    level: 5,
    stats: spread.ivs.map((iv, i) =>
      calculateStat(
        traits.summaryBaseStats[i],
        iv,
        i === 3 ? 1 : 0,
        5,
        i,
        spread.pid % 25,
      ),
    ),
  };
}

test("reported advance 10717 remains a match eight advances before the shiny target", () => {
  const { state, spreads } = fixture();
  const landed = spreads.find((s) => s.advance === 10717)!;
  assert.equal(landed.pid, 0xa6816d76);
  assert.deepEqual(landed.ivs, [8, 31, 7, 11, 10, 23]);
  state.attemptNature = "22";
  state.attemptGender = "male";
  state.attemptAbility = "66"; // Stale investigation ability must not exclude Torrent.
  const stats = { level: 5, stats: [20, 13, 10, 8, 10, 12] };
  const matches = matchShinyStarterAttempt(state, spreads, stats);
  assert.ok(matches.some((s) => s.advance === 10717 && s.pid === 0xa6816d76));
  assert.equal(spreads[0].advance, 10725 - 120);
  assert.equal(spreads.at(-1)!.advance, 10725 + 120);
});

test("Treecko selection updates Overgrow and matching without changing the investigation starter", () => {
  const { state, spreads } = fixture();
  state.species = 283;
  state.shinySpecies = 277;
  state.attemptAbility = "67"; // Previous Mudkip / Torrent.
  const landed = spreads.find((s) => s.advance === 10717)!;
  const stats = summary(277, landed);
  state.attemptNature = String(landed.pid % 25);
  state.attemptGender = "male";
  assert.ok(
    matchShinyStarterAttempt(state, spreads, stats).some(
      (s) => s.advance === 10717,
    ),
  );
  assert.equal(validateStarterGuide(state).attemptAbility, starterAbility(277));
  assert.equal(newShinyAttempt(state).attemptAbility, starterAbility(277));
  assert.equal(shinyStarterSpecies(state), 277);
  assert.equal(state.species, 283);
  assert.equal(state.confirmedSid, 49423);
  const markup = renderToStaticMarkup(
    createElement(StarterTraitsForm, {
      species: 277,
      nature: "",
      gender: "",
      chooseSpecies: true,
      onChange: () => {},
    }),
  );
  assert.match(markup, /Overgrow/);
  assert.doesNotMatch(markup, /Torrent/);
});

test("all three chosen starters share shiny advances and PID spreads", () => {
  const { state } = fixture();
  state.targetMin = 1000;
  state.targetMax = 25000;
  const targets = STARTERS.map((shinySpecies) =>
    searchShinyStarters({ ...state, shinySpecies }),
  );
  assert.ok(targets[0].length);
  assert.deepEqual(targets[1], targets[0]);
  assert.deepEqual(targets[2], targets[0]);
  const legacy = { ...state };
  delete legacy.shinySpecies;
  assert.equal(shinyStarterSpecies(legacy), legacy.species);
});

test("ambiguous landed matches are retained and each can be selected in the existing table", () => {
  const { state, spreads } = fixture();
  const matches = matchShinyStarterAttempt(state, spreads, {
    level: 5,
    stats: [null, null, null, null, null, null],
  });
  assert.equal(matches.length, spreads.length);
  assert.ok(matches.length > 1);
  const markup = renderToStaticMarkup(
    createElement(StarterSpreadTable, {
      spreads: matches,
      species: 283,
      onSelect: () => {},
      selectionHeading: "Landing",
      selectionLabel: "Use this landing",
    }),
  );
  assert.equal(
    (markup.match(/Use this landing/g) ?? []).length,
    matches.length,
  );
  assert.match(markup, /A6816D76/);
  assert.match(markup, /10717/);
  assert.doesNotMatch(markup, /Use this target/);
});

test("selected early or late landing adjusts the timer in the right direction without applying one result twice", () => {
  const { state } = fixture();
  state.starter.calibration = 3;
  const before = targetCountdown(
    10725,
    3,
    state.starter.first,
    state.starter.offset,
  );
  const corrected = calibrateStarterLanding(state.starter, 10725, 10717, 3);
  assert.equal(corrected.calibration, -5);
  const after = targetCountdown(
    10725,
    corrected.calibration,
    corrected.first,
    corrected.offset,
  );
  assert.ok(Math.abs(after.second - before.second - 8 / EMERALD_FPS) < 1e-9);
  assert.deepEqual(
    calibrateStarterLanding(corrected, 10725, 10717, 3),
    corrected,
  );
  assert.equal(
    calibrateStarterLanding(state.starter, 10725, 10733, 3).calibration,
    11,
  );
  assert.equal(corrected.offset, state.starter.offset);
});
