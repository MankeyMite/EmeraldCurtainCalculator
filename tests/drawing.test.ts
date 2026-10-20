import test from "node:test";
import assert from "node:assert/strict";
import { drawingPixelState, toggleDrawingPixel } from "../src/core/drawing";
import { emptyObservations } from "../src/core/constraints";
import { completeAssistedDrawing } from "../src/core/pixelAssistance";
import { loadSession, saveSession } from "../src/core/session";
import { loadResearchExample } from "../src/core/examples";
import { pixelAssistance } from "../src/core/pixelAssistance";
import { compareCandidate } from "../src/core/constraints";

test("blank drawing cells look transparent without recording evidence; clicking toggles the visible state", () => {
  const observations = emptyObservations();
  assert.equal(drawingPixelState(observations[16]), 0);
  assert.equal(observations[16], -1);
  for (const observed of [-1, 0, 1] as const)
    for (const predicted of [-1, 0, 1] as const)
      for (const reference of [-1, 0, 1] as const) {
        const visible =
          observed !== -1
            ? observed
            : predicted !== -1
              ? predicted
              : reference !== -1
                ? reference
                : 0;
        assert.equal(
          drawingPixelState(observed, predicted, reference),
          visible,
        );
        assert.equal(
          toggleDrawingPixel(observed, predicted, reference),
          1 - visible,
        );
      }
  assert.equal(
    toggleDrawingPixel(-1, 1),
    0,
    "a predicted black pixel can be explicitly contradicted",
  );
  assert.equal(
    toggleDrawingPixel(1, 0),
    0,
    "manual observations control the visible pixel",
  );
  assert.deepEqual(
    loadSession(saveSession(observations, {})).observations,
    observations,
  );
});

test("finishing a full drawing confirms blanks, keeps automatic pixels derived and preserves manual paint, the source drawing and hidden neighbors", () => {
  const observations = emptyObservations(),
    predictions = emptyObservations();
  observations[16] = 1;
  observations[17] = 0;
  observations[0] = 1;
  predictions[18] = 1;
  predictions[19] = 0;
  predictions[16] = 0; // An explicit contradiction must survive.
  const before = observations.slice();
  const completed = completeAssistedDrawing(observations, predictions);
  assert.deepEqual(observations, before);
  assert.deepEqual(completed.slice(16, 21), [1, 0, -1, -1, 0]);
  assert.deepEqual(completed.slice(0, 16), before.slice(0, 16));
  assert.deepEqual(completed.slice(176), before.slice(176));
  assert.equal(drawingPixelState(completed[18], predictions[18]), 1);
  assert.equal(drawingPixelState(completed[19], predictions[19]), 0);
  // Removing a fact retracts its derived pixel, rather than preserving false evidence.
  assert.equal(drawingPixelState(completed[18], -1), 0);
  assert.equal(completed[18], -1);
  assert.deepEqual(
    loadSession(saveSession(completed, {})).observations,
    completed,
  );
});

test("drawing only missing black pixels and finishing retains the genuine Skarmory without copying automatic evidence", () => {
  const { session, records } = loadResearchExample("skarmory"),
    observations = emptyObservations(),
    predictions = pixelAssistance(observations, session.knownFacts).predictions;
  let automatic = 0;
  for (let n = 16; n < 176; n++) {
    if (predictions[n] !== -1) {
      assert.equal(predictions[n], session.observations[n]);
      automatic++;
    } else if (session.observations[n] === 1) observations[n] = 1;
  }
  assert.ok(automatic > 0);
  const completed = completeAssistedDrawing(observations, predictions),
    comparison = compareCandidate(completed, records, session.knownFacts);
  assert.deepEqual(comparison.contradictions, []);
  assert.deepEqual(comparison.factContradictions, []);
  assert.equal(comparison.observed, 160 - automatic);
  for (let n = 16; n < 176; n++) {
    assert.equal(
      drawingPixelState(completed[n], predictions[n]),
      session.observations[n],
    );
    if (predictions[n] !== -1) assert.equal(completed[n], -1);
  }
});
