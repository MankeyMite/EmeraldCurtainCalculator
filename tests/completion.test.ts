import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyObservations,
  completeObservations,
  recordMasks,
} from "../src/core/constraints";
import { saveSession, loadSession } from "../src/core/session";

test("explicit completion preserves paint and hidden neighbors, without changing the unfinished drawing", () => {
  const unfinished = emptyObservations();
  unfinished[16] = 1;
  unfinished[20] = 0;
  unfinished[0] = 1;
  const next = completeObservations(unfinished);
  assert.equal(unfinished[17], -1);
  assert.equal(next[16], 1);
  assert.equal(next[20], 0);
  assert.equal(next.slice(16, 176).filter((n) => n === 0).length, 159);
  assert.equal(next[0], 1);
  assert.ok(next.slice(1, 16).every((n) => n === -1));
  assert.ok(next.slice(176).every((n) => n === -1));
  assert.equal(recordMasks(next, 5)[0], 0xfffe);
  assert.equal(recordMasks(next, 5)[1], 1);
  assert.deepEqual(loadSession(saveSession(next, {})).observations, next);
  assert.ok(
    completeObservations(emptyObservations(), true).every((n) => n === 0),
  );
  assert.throws(() => completeObservations([]));
});
