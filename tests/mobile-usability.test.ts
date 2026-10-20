import test from "node:test";
import assert from "node:assert/strict";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PixelGrid } from "../src/components/PixelGrid";
import { PokemonInfoForm } from "../src/components/PokemonInfoForm";
import { useCurtainLab } from "../src/hooks/useCurtainLab";
import {
  stripLayout,
  recordStripLayout,
  hitForNibble,
} from "../src/components/WorkbenchData";
import { curtainHit } from "../src/core/window";

test("inspection and record previews allow touch scrolling and zoom; drawing alone captures gestures", () => {
  const layout = stripLayout();
  const props: ComponentProps<typeof PixelGrid> = {
    canvasRef: createRef(),
    placements: layout.placements,
    bounds: layout.bounds,
    zoom: 20,
    grid: true,
    annotated: false,
    gameBackground: true,
    mainOnly: true,
    solver: true,
    memory: Array(96).fill(null),
    observations: Array(192).fill(-1),
    tool: 1,
    contradictions: new Set(),
    onHover: () => {},
    onStart: () => {},
    onPaint: () => {},
    onEnd: () => {},
  };
  const inspect = renderToStaticMarkup(
      createElement(PixelGrid, { ...props, editable: false }),
    ),
    preview = renderToStaticMarkup(
      createElement(PixelGrid, { ...props, solver: false }),
    ),
    draw = renderToStaticMarkup(
      createElement(PixelGrid, { ...props, editable: true }),
    );
  for (const html of [inspect, preview])
    assert.match(html, /touch-action:pan-y pinch-zoom/);
  assert.match(draw, /touch-action:none/);
  for (const html of [inspect, preview, draw])
    assert.match(
      html,
      /width="280" height="520"/,
      "gesture policy must not change verified curtain geometry",
    );
});

function Entry() {
  return createElement(PokemonInfoForm, {
    lab: useCurtainLab(),
    onSid: () => {},
  });
}
test("phone entry uses numeric keyboards for decimal facts, preserves hex PID entry and disables game-name autocorrection", () => {
  const html = renderToStaticMarkup(createElement(Entry));
  for (const label of ["Trainer ID", "Secret ID", "Met level", "Current EXP"])
    assert.match(
      html,
      new RegExp(`aria-label="${label}"[^>]*inputMode="numeric"`),
    );
  assert.match(html, /aria-label="Known PID"[^>]*inputMode="text"/);
  assert.match(
    html,
    /autoCorrect="off" autoCapitalize="none" spellCheck="false"/,
  );
  assert.match(html, /aria-label="Nickname"[^>]*autoCorrect="off"/);
  assert.doesNotMatch(html, /maximum-scale|user-scalable/);
});

test("the compact curtain crops only context and retains every original main-record nibble and its screen mapping", () => {
  const compact = recordStripLayout(),
    original = stripLayout();
  assert.equal(compact.bounds.w, 8);
  assert.equal(compact.bounds.h, 20);
  assert.deepEqual(compact.placements, original.placements);
  const seen = new Set<number>();
  for (let y = compact.bounds.y; y < compact.bounds.y + compact.bounds.h; y++)
    for (
      let x = compact.bounds.x;
      x < compact.bounds.x + compact.bounds.w;
      x++
    ) {
      const hit = curtainHit(compact.placements, x, y, true);
      assert.ok(hit);
      assert.equal(hit.slot, 5);
      const originalHit = hitForNibble(hit.nibble)!;
      assert.equal(originalHit.displayX, x);
      assert.equal(originalHit.displayY, y);
      seen.add(hit.nibble);
    }
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    Array.from({ length: 160 }, (_, n) => n + 16),
  );
});
