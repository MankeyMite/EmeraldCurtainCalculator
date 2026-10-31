import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
import { stripLayout, hitForNibble } from "../src/components/WorkbenchData";
import { GroupedHex } from "../src/components/GroupedHex";
import { PixelInspector } from "../src/components/PixelInspector";
import { SidRngPanel } from "../src/components/SidRngPanel";
import { curtainHit } from "../src/core/window";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

test("refresh ignores saved guide-open flags and opens About on desktop", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) =>
          ["emerald-spinda-guide-open", "emerald-starter-guide-open"].includes(
            key,
          )
            ? "true"
            : null,
      },
    },
  });
  try {
    const html = renderToStaticMarkup(createElement(App));
    assert.match(html, /id="work-tab-about" aria-selected="true"/);
    assert.doesNotMatch(html, /<main class="starter-wizard/);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("compact workspace follows the supplied split layout with one curtain strip, primary fields and collapsed extras", () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.equal((html.match(/<canvas/g) ?? []).length, 1);
  assert.match(html, /width="280" height="520"/);
  assert.match(html, /id="work-tab-about" aria-selected="true"/);
  assert.ok(
    html.indexOf('id="work-tab-about"') < html.indexOf('id="work-tab-info"'),
  );
  assert.ok(
    html.indexOf('id="work-tab-info"') <
      html.indexOf('id="work-tab-investigate"'),
  );
  assert.match(html, /id="work-panel-info"[^>]*hidden=""/);
  assert.ok(
    html.indexOf('id="getting-started-title"') <
      html.indexOf('id="research-title"'),
  );
  assert.match(html, /Box 8, slot 5/);
  assert.match(html, /Keep slots 4 and 6 empty/);
  assert.match(html, /Rustboro Trainer’s School/);
  assert.match(html, />Start with Pokémon info<\/button>/);
  assert.match(html, />Find SID with Spinda<\/button>/);
  assert.doesNotMatch(html, /aria-label="Find SID with Spinda"/);
  const tools = html.slice(
    html.indexOf('class="toolbar-primary"'),
    html.indexOf('class="drawing-options"'),
  );
  assert.match(tools, />Draw<\/button><button[^>]*[\s\S]*Finish drawing/);
  assert.doesNotMatch(html, /Pixel paint value/);
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  assert.match(header, />New Pokémon<\/button>/);
  assert.match(header, /Use Save first/);
  assert.match(html, /Pokémon info/);
  assert.match(html, /Investigate/);
  assert.match(html, /About/);
  for (const label of [
    "Trainer ID",
    "Secret ID",
    "Current EXP",
    "Summary maximum HP",
    "Original trainer name",
    "Known PID",
  ])
    assert.ok(html.includes(`aria-label="${label}"`));
  assert.match(html, /View and edit remaining fields/);
  assert.match(html, /Assume freshly caught Pokémon/);
  assert.match(html, /Dewford trend SID finder/);
  assert.match(html, /Limit RNG advances/);
  assert.match(html, /Fixed curtain and byte recovery/);
  assert.match(html, /aria-label="Pixel grid lines" aria-pressed="true"/);
  assert.match(html, />Lines on<\/button>/);
  assert.equal((html.match(/class="grouped-byte"/g) ?? []).length, 80);
  assert.equal((html.match(/class="hex-digit /g) ?? []).length, 160);
  assert.doesNotMatch(html, /type="checkbox" checked=""/);
});
test("single strip retains every original nibble and gives each encrypted byte a bidirectional display address", () => {
  const layout = stripLayout();
  assert.equal(layout.placements.length, 3);
  assert.equal(layout.bounds.w, 14);
  const dataX = layout.placements[0].x;
  assert.equal(dataX - layout.bounds.x, 3);
  assert.equal(layout.bounds.x + layout.bounds.w - (dataX + 8), 3);
  for (let y = layout.bounds.y; y < layout.bounds.y + layout.bounds.h; y++)
    for (let x = layout.bounds.x; x < layout.bounds.x + layout.bounds.w; x++) {
      if (x >= dataX && x < dataX + 8) continue;
      assert.equal(curtainHit(layout.placements, x, y), null);
    }
  const coordinates = new Set<string>();
  for (let n = 0; n < 192; n++) {
    const hit = hitForNibble(n)!;
    assert.ok(hit);
    assert.equal(hit.nibble, n);
    assert.equal(hit.slot, n < 16 ? 4 : n < 176 ? 5 : 6);
    if (hit.slot === 5) {
      assert.equal(hit.offset, Math.floor((n - 16) / 2));
      assert.equal(hit.side, (n - 16) % 2);
    }
    coordinates.add(`${hit.displayX}/${hit.displayY}`);
  }
  assert.equal(coordinates.size, 192);
});
test("pinned pixel inspector and hex digit agree on byte, nibble and remaining candidate digits", () => {
  const masks = Array(160).fill(0xffff),
    hit = hitForNibble(16 + 0x4c * 2)!;
  masks[0x4c * 2] = (1 << 1) | (1 << 5) | (1 << 12) | (1 << 13);
  const lab = {
    mode: "solver",
    selectedPixel: hit,
    hover: hit,
    inference: { masks, pidValues: null },
    obs: Array(192).fill(-1),
    predictions: Array(192).fill(-1),
    memory: Array(96).fill(null),
  } as unknown as CurtainLab;
  const inspector = renderToStaticMarkup(
    createElement(PixelInspector, { lab }),
  );
  assert.match(inspector, /0x4C/);
  assert.match(inspector, /Low · bits 0–3/);
  assert.match(inspector, /Candidates: 1, 5, C, D/);
  const hex = renderToStaticMarkup(createElement(GroupedHex, { lab }));
  assert.match(hex, /Byte 0x4C low nibble: 1, 5, C, D" aria-pressed="true"/);
  assert.equal((hex.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(hex, /Encrypted block 4/);
  assert.match(hex, /0\/80 bytes exact/);
  const unhovered = { ...lab, hover: null };
  const idleHex = renderToStaticMarkup(
    createElement(GroupedHex, { lab: unhovered }),
  );
  assert.doesNotMatch(idleHex, /aria-pressed="true"|class="hex-digit selected/);
  const idleInspector = renderToStaticMarkup(
    createElement(PixelInspector, { lab: unhovered }),
  );
  assert.match(idleInspector, /0x4C/);
  assert.match(idleInspector, /Candidates: 1, 5, C, D/);
});
test("SID controls show the actual intersection, advances, validation and reversible zero-result guidance", () => {
  const lab = {
    facts: { tid: 40492 },
    sidRngSettings: { minAdvance: 1, maxAdvance: 3600 },
    sidRngRows: [
      { sid: 10, advances: [2, 3] },
      { sid: 20, advances: [4] },
    ],
    curtainSidAnalysis: { sidValues: [10, 30, 40] },
    sidRngResult: { rows: [{ sid: 10, advances: [2, 3] }], exact: true },
  } as unknown as CurtainLab;
  const html = renderToStaticMarkup(createElement(SidRngPanel, { lab }));
  assert.match(html, /2<\/strong> distinct/);
  assert.match(html, /3<\/strong> curtain-compatible/);
  assert.match(html, /1<\/strong> in the actual intersection/);
  assert.match(html, /<td>2, 3<\/td>/);
  assert.match(html, /Validate 10/);
  assert.match(html, /advance 1|Advance 1/);
  assert.match(html, /extra calls and transitions/);
  const zero = renderToStaticMarkup(
    createElement(SidRngPanel, {
      lab: {
        ...lab,
        sidRngResult: { rows: [], exact: true },
      } as unknown as CurtainLab,
    }),
  );
  assert.match(zero, /No SID survives/);
  assert.match(zero, /Widen SID window/);
  assert.match(zero, /Disable SID filter/);
});
