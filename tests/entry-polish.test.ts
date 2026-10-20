import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sidDisplay } from "../src/core/sidDisplay";
import { maxPp, ppUpChange } from "../src/core/pp";
import {
  factsToDraft,
  draftToFacts,
  refreshCaptureDefaults,
  newPokemonFacts,
  ppUpDraftChange,
} from "../src/core/facts";
import { saveSession, loadSession } from "../src/core/session";
import { MovePpInput } from "../src/components/MovePpInput";
import { knownPlaintext } from "../src/core/inference";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

test("SID decimal and hex patterns show only common digits, including decimal carries and zero padding", () => {
  assert.equal(sidDisplay([], [33789]), "33789 - 0x83FD");
  assert.equal(sidDisplay([], [0]), "0 - 0x0000");
  assert.equal(sidDisplay([], [65535]), "65535 - 0xFFFF");
  assert.equal(sidDisplay([], [33719, 33789]), "337?9 - 0x83??");
  assert.equal(sidDisplay([], [9, 10]), "000?? - 0x000?");
  assert.equal(sidDisplay([65535, 65535, 65535, 65535]), "????? - 0x????");
  assert.equal(sidDisplay([0, 0, 0, 0]), "????? - 0x????");
});

test("partial hex domains agree with independent exhaustive decimal/hex digit supports, while joint candidates can reveal additional decimal digits", () => {
  const cases = [
    [1 << 13, 1 << 15, (1 << 3) | (1 << 4), 1 << 8],
    [65535, 1, 1, 1],
    [1, 1, 1 << 1, 1 << 8],
    [3, 5, 0xf, 0xc000],
  ];
  for (const masks of cases) {
    const values: number[] = [];
    for (let v = 0; v < 65536; v++) {
      const littleEndianDigits = [
        v % 16,
        Math.floor(v / 16) % 16,
        Math.floor(v / 256) % 16,
        Math.floor(v / 4096),
      ];
      if (littleEndianDigits.every((d, n) => (masks[n] & (2 ** d)) !== 0))
        values.push(v);
    }
    const pattern = (base: number, width: number) =>
      Array.from({ length: width }, (_, n) => {
        const chars = new Set(
          values.map(
            (v) => v.toString(base).toUpperCase().padStart(width, "0")[n],
          ),
        );
        return chars.size === 1 ? [...chars][0] : "?";
      }).join("");
    const expected = `${values.length === 1 ? values[0] : pattern(10, 5)} - 0x${pattern(16, 4)}`;
    assert.equal(sidDisplay(masks), expected);
  }
  assert.equal(sidDisplay(cases[0]), "3???? - 0x8?FD");
  assert.equal(
    sidDisplay([65535, 65535, 65535, 65535], [33719, 33789]),
    "337?9 - 0x83??",
  );
});

test("PP Up slot selection preserves every other counter and unknown counters, and survives JSON without assuming other stages", () => {
  for (let packed = 0; packed < 256; packed++)
    for (let index = 0; index < 4; index++)
      for (let stage = 0; stage < 4; stage++) {
        const changed = ppUpChange(52, index, stage, packed);
        assert.equal(changed.pp, 25 + stage * 5);
        for (let slot = 0; slot < 4; slot++) {
          const expected =
            slot === index ? stage : Math.floor(packed / 4 ** slot) % 4;
          assert.equal(
            Math.floor(changed.ppBonuses! / 4 ** slot) % 4,
            expected,
          );
        }
      }
  assert.deepEqual(ppUpChange(52, 0, 3), { pp: 40 });
  assert.throws(() => ppUpChange(undefined, 0, 3));
  const facts = {
    moves: [33, 45, 52, 15],
    pp: [35, 48, 35, 48],
    ppBonuses: 0xe4,
  };
  const change = ppUpChange(45, 1, 3, facts.ppBonuses);
  const next = refreshCaptureDefaults(
    draftToFacts({
      ...factsToDraft(facts),
      pp_1: String(change.pp),
      ppBonuses: String(change.ppBonuses),
    }),
    "pp_1",
  );
  assert.equal(next.ppBonuses, 0xec);
  assert.deepEqual(next.pp, [35, 64, 35, 48]);
  assert.equal(
    loadSession(saveSession(Array(192).fill(-1), next)).knownFacts.ppBonuses,
    0xec,
  );
  const typed = refreshCaptureDefaults(
    { ...next, pp: [35, 40, 35, 48] },
    "pp_1",
  );
  assert.equal(
    typed.ppBonuses,
    0xe0,
    "typing restored PP updates just its slot's counter",
  );
});

test("selecting boosted PP Ups replaces the shared zero assumption without verifying the other slots", () => {
  const facts = refreshCaptureDefaults(
      {
        ...newPokemonFacts(),
        moves: [52, 0, 0, 0],
        assumed: newPokemonFacts().assumed?.filter((key) => key !== "move_0"),
      },
      "move_0",
    ),
    patch = ppUpDraftChange(facts, 0, 3),
    next = refreshCaptureDefaults(
      draftToFacts(
        { ...factsToDraft(facts), ...patch },
        facts.assumed?.filter((key) => !(key in patch)),
      ),
      "pp_0",
    );
  assert.equal(next.pp?.[0], 40);
  assert.equal(next.ppBonuses, undefined);
  assert.ok(!next.assumed?.includes("ppBonuses"));
  assert.ok(!next.assumed?.includes("pp_0"));
  assert.ok(next.assumed?.includes("pp_1"));
  assert.equal(
    knownPlaintext(next)[16],
    0x8888,
    "slot 1 is three PP Ups; the empty second move's stage remains unconstrained",
  );
  assert.equal(knownPlaintext(next)[17], 65535);
  assert.equal(
    loadSession(saveSession(Array(192).fill(-1), next)).knownFacts.ppBonuses,
    undefined,
  );
});

test("PP controls keep the maximum below the input and expose separate per-move PP Up selectors", () => {
  const facts = { moves: [52, 0, 0, 0], pp: [35, 0, 0, 0] };
  const lab = {
    facts,
    factDraft: factsToDraft(facts),
  } as unknown as CurtainLab;
  const html = renderToStaticMarkup(
    createElement(MovePpInput, { lab, index: 0 }),
  );
  assert.match(html, /aria-label="Move 1 current PP"[^>]*value="35"/);
  assert.match(html, /<small class="pp-limit">Max 40<\/small>/);
  assert.match(html, /aria-label="Move 1 PP Ups"/);
  assert.match(html, /value="2" selected="">2/);
  assert.equal(maxPp(52, 3), 40);
});
