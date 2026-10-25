import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidProgress } from "../src/components/SidProgress";

const render = (sids?: number[], updating = false) =>
  renderToStaticMarkup(createElement(SidProgress, { sids, updating }));

test("hex positions show distinct remaining values in S1–S4 order, with hover and keyboard descriptions", () => {
  const html = render([0x1a01, 0x1a01, 0x1b01]);
  for (const [position, value] of [
    [1, "1"],
    [2, "?"],
    [3, "0"],
    [4, "1"],
  ])
    assert.ok(html.includes(`aria-label="S${position}: ${value}"`));
  assert.match(html, /S2: 2 possible values/);
  assert.match(html, /S2 remaining: A, B/);
  assert.match(html, /2 left/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-describedby="[^"]+"/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /Decimal SID: 06\?\?\?/);
});

test("decimal positions use whole surviving SIDs, retaining correlations and leading zeros", () => {
  // 04096 and 08192 share the tens digit 9 despite the unknown hex digit.
  const html = render([0x1000, 0x2000]);
  assert.match(html, /aria-label="S1: \?"/);
  assert.match(html, /S1 remaining: 1, 2/);
  assert.match(html, /Decimal SID: 0\?\?9\?/);
  assert.match(render([0]), /Decimal SID: 00000/);
  assert.match(render([65535]), /Decimal SID: 65535/);
});

test("new evidence reveals digits and shrinks counts without changing the candidate list", () => {
  const candidates = [0x1a01, 0x1b01];
  const before = render(candidates);
  const after = render([candidates[0]]);
  assert.match(before, /S2: 2 possible values/);
  assert.match(after, /aria-label="S2: A"/);
  assert.match(after, /S2: 1 possible value"/);
  assert.match(after, /Decimal SID: 06657/);
  assert.equal(
    (after.match(/class="starter-sid-digit known"/g) ?? []).length,
    4,
  );
  assert.deepEqual(candidates, [0x1a01, 0x1b01]);
});

test("waiting, paused updates and contradictory evidence do not fabricate a recovered SID", () => {
  const waiting = render();
  assert.match(waiting, /waiting for SID candidates/);
  assert.doesNotMatch(waiting, /16 left|starter-sid-digit known/);
  assert.match(waiting, /Decimal SID: \?\?\?\?\?/);
  const paused = render([0x1a01, 0x1b01], true);
  assert.match(paused, /aria-busy="true"/);
  assert.match(paused, /S2: 2 possible values/);
  const contradiction = render([]);
  assert.match(contradiction, /no candidates match/);
  assert.equal((contradiction.match(/0 left/g) ?? []).length, 4);
  assert.doesNotMatch(contradiction, /starter-sid-digit known/);
  assert.match(contradiction, /Decimal SID: —————/);
});
