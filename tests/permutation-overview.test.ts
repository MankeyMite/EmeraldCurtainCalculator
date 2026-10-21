import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  blockOrder,
  describeByte,
  describeByteWithOrders,
  BLOCK_CODES,
} from "../src/core/inspection";
import {
  SUBSTRUCT_POSITIONS,
  decodePokemon,
  exampleRecord,
} from "../src/core/pokemon";
import { computeDeduction } from "../src/core/deduction";
import { analyzeConstraints } from "../src/core/inference";
import { loadInvestigation } from "../src/core/investigation";
import { makeHypothesis } from "../src/core/sid";
import {
  workbenchOrders,
  workbenchEvs,
  hitForNibble,
} from "../src/components/WorkbenchData";
import { RecoveryOverview } from "../src/components/RecoveryOverview";
import { GroupedHex } from "../src/components/GroupedHex";
import { PixelInspector } from "../src/components/PixelInspector";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

test("all 24 permutations identify physical blocks and fields without a complete PID", () => {
  for (let o = 0; o < 24; o++) {
    const physical = blockOrder([o]);
    for (let logical = 0; logical < 4; logical++)
      assert.equal(physical[SUBSTRUCT_POSITIONS[o][logical]], logical);
    for (let byte = 0; byte < 80; byte++)
      assert.deepEqual(
        describeByteWithOrders(byte, [o]),
        describeByte(byte, o),
      );
  }
  assert.deepEqual(blockOrder([]), [null, null, null, null]);
  assert.deepEqual(blockOrder(Array.from({ length: 24 }, (_, n) => n)), [
    null,
    null,
    null,
    null,
  ]);
});

test("partial permutations name only agreed positions and retract names when constraints widen", () => {
  const orders = [2, 4]; // G - E/M - A - M/E
  assert.deepEqual(blockOrder(orders), [0, null, 1, null]);
  assert.equal(
    blockOrder(orders)
      .map((b) => (b === null ? "?" : BLOCK_CODES[b]))
      .join(" - "),
    "G - ? - A - ?",
  );
  assert.equal(describeByteWithOrders(32, orders).name, "Species");
  assert.equal(describeByteWithOrders(56, orders).name, "Move 1");
  assert.equal(describeByteWithOrders(44, orders).name, "Encrypted data");
  assert.equal(
    describeByteWithOrders(32, [...orders, 6]).name,
    "Encrypted data",
  );
});

function torchicLab() {
  const investigation = loadInvestigation(
    fs.readFileSync(
      "research/fixtures/unknown-sid-user-investigation.json",
      "utf8",
    ),
  );
  const result = computeDeduction({ ...investigation, sidRng: undefined });
  return {
    ...result,
    mode: "solver",
    facts: {
      ...investigation.snapshots[0].knownFacts,
      ...investigation.identity,
    },
    sid: { count: 65536n },
    wildRng: { result: null, busy: false },
    rngActive: false,
    obs: investigation.snapshots[0].observations,
    predictions: result.assistance.predictions,
    memory: Array(96).fill(null),
    selectedPixel: hitForNibble(83),
    hover: null,
    setHover: () => {},
    setSelectedPixel: () => {},
  } as unknown as CurtainLab;
}

test("Torchic shows M-A-G-E, named encrypted blocks, met location, EV bounds and the requested summary order", () => {
  const lab = torchicLab();
  const before = lab.inference.pidCount;
  assert.equal(lab.inference.pidValues, null);
  assert.equal(lab.facts.pid, undefined);
  assert.deepEqual(workbenchOrders(lab), [20]);
  const summary = renderToStaticMarkup(
    createElement(RecoveryOverview, { lab, onInvestigate: () => {} }),
  );
  assert.match(summary, /M - A - G - E/);
  const headings = [
    "PID:",
    "SID:",
    ">IVs<",
    ">EVs<",
    "XOR key:",
    "Permutation:",
  ];
  for (let n = 1; n < headings.length; n++)
    assert.ok(summary.indexOf(headings[n - 1]) < summary.indexOf(headings[n]));
  const grid = renderToStaticMarkup(createElement(GroupedHex, { lab }));
  assert.match(grid, /Byte 0x20 · Miscellaneous/);
  assert.match(grid, /Byte 0x2C · Attacks/);
  assert.match(grid, /Byte 0x38 · Growth/);
  assert.match(grid, /Byte 0x44 · EVs \/ condition/);
  assert.doesNotMatch(grid, /Encrypted block [1-4]/);
  const inspector = renderToStaticMarkup(
    createElement(PixelInspector, { lab }),
  );
  assert.match(inspector, /Met location/);
  assert.match(inspector, /Miscellaneous · encrypted/);
  assert.match(inspector, /Candidates: 1/);
  assert.equal(lab.inference.pidCount, before);
  assert.equal(before, 148515n);
  const evs = workbenchEvs(lab);
  assert.equal(lab.facts.evs, undefined);
  assert.ok(evs.some((values) => values.length > 1));
  for (let i = 0; i < 6; i++)
    assert.deepEqual(
      evs[i],
      [...lab.inference.plaintextByteValues[24 + i]].sort((a, b) => a - b),
    );
});

test("order display respects exhaustive hypotheses and never promotes SID witness PIDs", () => {
  const lab = {
    mode: "solver",
    inference: { consistent: true, orders: [2, 4, 20] },
    sidRngResult: { pidValues: null, rows: [{ sid: 3, witnessPid: 20 }] },
  } as unknown as CurtainLab;
  assert.deepEqual(workbenchOrders(lab), [2, 4, 20]);
  assert.deepEqual(
    workbenchOrders({
      ...lab,
      sidAnalysis: {
        candidates: [makeHypothesis(2, 0, 1), makeHypothesis(28, 0, 2)],
      },
    } as CurtainLab),
    [2, 4],
  );
  assert.deepEqual(
    workbenchOrders({
      ...lab,
      inference: { ...lab.inference, consistent: false },
    }),
    [],
  );
  assert.deepEqual(
    workbenchOrders({
      ...lab,
      mode: "renderer",
      imported: { pid: 20 },
    } as CurtainLab),
    [20],
  );
});

test("EV display preserves unknowns, supplied values, byte correlations, recovery bounds and imported data", () => {
  const inference = analyzeConstraints(Array(160).fill(65535));
  const lab = { mode: "solver", facts: {}, inference } as unknown as CurtainLab;
  assert.ok(workbenchEvs(lab).every((values) => values.length === 256));
  const supplied = workbenchEvs({
    ...lab,
    facts: { evs: [12, null, null, null, null, 255] },
  });
  assert.deepEqual(supplied[0], [12]);
  assert.equal(supplied[1].length, 256);
  assert.deepEqual(supplied[5], [255]);
  const plain = inference.plaintextMasks.slice();
  plain[48] = (1 << 1) | (1 << 2);
  plain[49] = (1 << 0) | (1 << 1);
  const bounded = {
    ...lab,
    recovery: { plaintext: plain },
    inference: {
      ...inference,
      plaintextByteValues: inference.plaintextByteValues.map((v, i) =>
        i === 24 ? [1, 18] : v,
      ),
    },
  } as CurtainLab;
  assert.deepEqual(workbenchEvs(bounded)[0], [1, 18]);
  const imported = decodePokemon(exampleRecord());
  assert.deepEqual(
    workbenchEvs({ ...lab, mode: "renderer", imported }),
    imported.evs.map((v) => [v]),
  );
});

test("EV summary shows only minimum and maximum without widening the actual candidate sets", () => {
  const lab = torchicLab();
  const candidates = [0, 1, 3, 4, 200, 255];
  lab.inference = {
    ...lab.inference,
    plaintextByteValues: lab.inference.plaintextByteValues.map((values, i) =>
      i === 24 ? candidates : values,
    ),
  };
  const summary = renderToStaticMarkup(
    createElement(RecoveryOverview, { lab, onInvestigate: () => {} }),
  );
  const evSection = summary.slice(
    summary.indexOf("<h3>EVs</h3>"),
    summary.indexOf("XOR key:"),
  );
  assert.match(evSection, /<b>HP:<\/b> 0–255/);
  assert.doesNotMatch(evSection, /0–1,|3–4|200,/);
  assert.match(evSection, /intermediate values may be excluded/);
  assert.deepEqual(workbenchEvs(lab)[0], candidates);
});
