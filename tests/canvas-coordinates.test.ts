import test from "node:test";
import assert from "node:assert/strict";
import { bitmapCoordinates } from "../src/core/canvasCoordinates";

test("fractionally scaled curtain cells keep the same address throughout their lower half", () => {
  const rect = {
    left: 1356.015625,
    top: 65,
    width: 187.34375,
    height: 608.875,
  };
  for (let row = 0; row < 26; row++)
    for (let column = 0; column < 8; column++) {
      for (const fraction of [0.01, 0.49, 0.51, 0.75, 0.99]) {
        const point = bitmapCoordinates(
          rect.left + ((column + 0.5) * rect.width) / 8,
          rect.top + ((row + fraction) * rect.height) / 26,
          rect,
          160,
          520,
          true,
        );
        assert.equal(Math.floor(point.x / 20), column);
        assert.equal(Math.floor(point.y / 20), row);
      }
    }
});
test("contained canvas hit testing excludes vertical and horizontal letterboxing from image coordinates", () => {
  // A 160×520 bitmap in a 200×800 box occupies y=75..725, not y=0..800.
  const vertical = { left: 10, top: 20, width: 200, height: 800 };
  for (const y of [0.01, 0.49, 0.51, 0.75, 0.99]) {
    const point = bitmapCoordinates(
      122.5,
      95 + (10 + y) * 25,
      vertical,
      160,
      520,
      true,
    );
    assert.equal(Math.floor(point.x / 20), 4);
    assert.equal(Math.floor(point.y / 20), 10);
  }
  assert.ok(bitmapCoordinates(110, 94, vertical, 160, 520, true).y < 0);
  assert.ok(bitmapCoordinates(110, 746, vertical, 160, 520, true).y >= 520);
  // The same bitmap in a 300×520 box has 70 pixels of padding on each side.
  const horizontal = { left: 0, top: 0, width: 300, height: 520 };
  assert.equal(bitmapCoordinates(70, 0, horizontal, 160, 520, true).x, 0);
  assert.equal(
    bitmapCoordinates(229.9, 519.9, horizontal, 160, 520, true).x,
    159.9,
  );
  assert.ok(bitmapCoordinates(69, 50, horizontal, 160, 520, true).x < 0);
});
test("raw and annotated canvases preserve pixel edges and annotation offsets", () => {
  const rect = { left: 100, top: 50, width: 320, height: 1088 };
  const cell = (x: number, y: number) => {
    const point = bitmapCoordinates(x, y, rect, 160, 544);
    return { x: Math.floor(point.x / 20), y: Math.floor((point.y - 24) / 20) };
  };
  assert.deepEqual(cell(100, 98), { x: 0, y: 0 });
  assert.deepEqual(cell(139.99, 137.99), { x: 0, y: 0 });
  assert.deepEqual(cell(140, 138), { x: 1, y: 1 });
  assert.deepEqual(cell(100, 97), { x: 0, y: -1 });
});
