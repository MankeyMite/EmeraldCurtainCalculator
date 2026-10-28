import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  previewStarterTid,
  starterTidPreviewKey,
  earliestShinyStarterAdvance,
  shinyAdvanceColour,
  weightedFirstShinyAdvance,
  firstShinyWait,
} from "../src/core/starterTidPreview";
import {
  newStarterGuide,
  guideSidCandidates,
  validateStarterGuide,
} from "../src/core/starterGuide";
import { scanStaticSpreads } from "../src/core/staticRng";
import { generateSidRng } from "../src/core/sidRng";
import { StarterTidPreview } from "../src/components/StarterTidPreview";
import { OptimalPidSearch } from "../src/components/StarterPidRecommendation";
import type { RngSettings } from "../src/core/rng";
import { EMERALD_FPS, estimatedSidWindow } from "../src/core/starterTiming";

// Independent integer LCRNG oracle for the first Method 1 shiny advance.
function firstShinies(
  tid: number,
  sids: number[],
  minimum: number,
  maximum: number,
) {
  const next = (seed: bigint) => (seed * 1103515245n + 24691n) & 0xffffffffn;
  let low = next(0n),
    high = next(low);
  const wanted = new Set(sids.map((sid) => sid >>> 3));
  const first = new Map<number, number>();
  for (let advance = 0; advance <= maximum; advance++) {
    const group = (tid ^ Number(low >> 16n) ^ Number(high >> 16n)) >>> 3;
    if (advance >= minimum && wanted.has(group) && !first.has(group))
      first.set(group, advance);
    low = high;
    high = next(high);
  }
  return sids.map((sid) => first.get(sid >>> 3) ?? null);
}

test("nineteen chronological SID witnesses include the timer target and preserve all 121 candidates", () => {
  const s = { ...newStarterGuide(), tid: "50998" };
  const before = structuredClone(s);
  const all = guideSidCandidates(s);
  const preview = previewStarterTid(s);
  assert.equal(preview.rows.length, 19);
  assert.equal(preview.target, 1245);
  assert.deepEqual(
    preview.rows.map((row) => row.difference),
    Array.from({ length: 19 }, (_, n) => n - 9),
  );
  assert.equal(preview.rows[9].advance, 1245);
  assert.equal(preview.rows[9].sid, 59012);
  let seed = BigInt(Number(s.tid));
  const generated = new Map<number, number>();
  for (let n = 1; n <= 1254; n++) {
    seed = (seed * 1103515245n + 24691n) & 0xffffffffn;
    if (n >= 1236) generated.set(n, Number(seed >> 16n));
  }
  for (const row of preview.rows)
    assert.equal(row.sid, generated.get(row.advance));
  assert.deepEqual(
    preview.rows.map((row) => row.shinyAdvance),
    firstShinies(
      50998,
      preview.rows.map((row) => row.sid),
      650,
      Math.max(...preview.rows.map((row) => row.shinyAdvance!)),
    ),
  );
  assert.equal(all.length, 121);
  assert.deepEqual(guideSidCandidates(s), all);
  assert.deepEqual(s, before);
});

test("battery choice applies only the practical minimum and finds the first shiny after that cutoff", () => {
  const s = { ...newStarterGuide(), tid: "50998" };
  const native = previewStarterTid(s),
    dry = previewStarterTid({ ...s, dryBattery: true });
  assert.equal(earliestShinyStarterAdvance(), 650);
  assert.equal(earliestShinyStarterAdvance(true), 900);
  assert.equal(native.minimum, 650);
  assert.equal(dry.minimum, 900);
  assert.deepEqual(
    native.rows.map((row) => row.sid),
    dry.rows.map((row) => row.sid),
  );
  assert.equal(native.rows.find((row) => row.sid === 51736)!.shinyAdvance, 859);
  assert.ok(dry.rows.find((row) => row.sid === 51736)!.shinyAdvance! >= 900);
  assert.deepEqual(
    dry.rows.map((row) => row.shinyAdvance),
    firstShinies(
      50998,
      dry.rows.map((row) => row.sid),
      900,
      Math.max(...dry.rows.map((row) => row.shinyAdvance!)),
    ),
  );
  assert.notEqual(native.key, dry.key);
  assert.equal(
    validateStarterGuide({ ...s, dryBattery: true }).dryBattery,
    true,
  );
  assert.throws(
    () => validateStarterGuide({ ...s, dryBattery: "yes" }),
    /Invalid/,
  );
});

test("narrow configured windows are respected and preview keys track timing and TID changes", () => {
  const s = { ...newStarterGuide(), tid: "0" };
  s.intro = { ...s.intro, uncertainty: 2, calibration: -4 };
  const preview = previewStarterTid(s);
  assert.deepEqual(
    preview.rows.map((row) => row.difference),
    [-2, -1, 0, 1, 2],
  );
  assert.equal(preview.target, 1241);
  assert.notEqual(preview.key, starterTidPreviewKey({ ...s, tid: "1" }));
  assert.notEqual(
    preview.key,
    starterTidPreviewKey({ ...s, intro: { ...s.intro, calibration: 0 } }),
  );
  for (const tid of ["", "-1", "65536", "12x"])
    assert.throws(() => previewStarterTid({ ...s, tid }), /TID/);
});

test("repeated SIDs retain every nearby generating advance", () => {
  const s = newStarterGuide();
  const tid = Array.from({ length: 2000 }, (_, n) => n).find((tid) => {
    const rows = generateSidRng(tid, { minAdvance: 1236, maxAdvance: 1254 });
    return rows.some((row) => row.advances.length > 1);
  });
  assert.notEqual(tid, undefined);
  const preview = previewStarterTid({ ...s, tid: String(tid) });
  assert.equal(preview.rows.length, 19);
  assert.ok(new Set(preview.rows.map((row) => row.sid)).size < 19);
  for (const row of preview.rows) {
    assert.ok(
      preview.rows
        .filter((other) => other.sid === row.sid)
        .every((other) => other.shinyAdvance === row.shinyAdvance),
    );
  }
});

test("first-result static scan agrees with the complete existing Method 1 search, including the lower bound", () => {
  const settings: RngSettings = {
    kind: "static",
    seed: 0,
    minAdvance: 859,
    maxAdvance: 20000,
    methods: ["Method1"],
    areaId: "",
    lead: "none",
    synchronizeNature: 0,
  };
  const identity = { species: 277, tid: 50998, sid: 51736, shiny: true };
  const all = scanStaticSpreads(settings, identity, []);
  const first = scanStaticSpreads(settings, identity, [], undefined, true);
  assert.equal(first[0].advance, 859);
  assert.deepEqual(first, [all[0]]);
  assert.ok(
    scanStaticSpreads(
      { ...settings, minAdvance: 860 },
      identity,
      [],
      undefined,
      true,
    )[0].advance > 859,
  );
});

test("preview colors have exact boundaries and the keep control is disabled before a valid preview", () => {
  assert.deepEqual([4999, 5000, 9000, 9001, null].map(shinyAdvanceColour), [
    "easy",
    "moderate",
    "moderate",
    "hard",
    "hard",
  ]);
  const value = {
    key: "test",
    target: 1245,
    minimum: 650,
    limit: 1000000,
    weightedAverage: 6400,
    rows: [4999, 5000, 9000, 9001].map((shinyAdvance, i) => ({
      sid: i,
      advance: 1245 + i,
      difference: i,
      shinyAdvance,
    })),
  };
  const markup = renderToStaticMarkup(
    createElement(StarterTidPreview, { value }),
  );
  assert.match(markup, /aria-current="true"/);
  assert.equal((markup.match(/starter-outlook-easy/g) ?? []).length, 1);
  assert.equal((markup.match(/starter-outlook-moderate/g) ?? []).length, 2);
  assert.equal((markup.match(/starter-outlook-hard/g) ?? []).length, 1);
  assert.match(
    markup,
    /Your actual Secret ID may have a shorter or longer wait/,
  );
  assert.doesNotMatch(markup, /Green:|Yellow:|Red:/);
  const button = renderToStaticMarkup(
    createElement(OptimalPidSearch, {
      tid: "50998",
      busy: false,
      complete: false,
      progress: 0,
      label: "Keep TID",
      disabled: true,
      onSearch: () => {},
    }),
  );
  assert.match(button, /<button disabled="">Keep TID/);
  assert.doesNotMatch(button, /Search optimal PID/);
});

test("triangular weights scale with the configured window, including a single target", () => {
  const rows = [
    { difference: -2, shinyAdvance: 30000 },
    { difference: -1, shinyAdvance: 5000 },
    { difference: 0, shinyAdvance: 1000 },
    { difference: 1, shinyAdvance: 7000 },
    { difference: 2, shinyAdvance: 40000 },
  ];
  assert.equal(weightedFirstShinyAdvance(rows, 2), 97000 / 9);
  assert.equal(weightedFirstShinyAdvance([rows[2]], 0), 1000);
  assert.equal(weightedFirstShinyAdvance([], 9), null);
  assert.equal(
    weightedFirstShinyAdvance([{ difference: 0, shinyAdvance: null }], 9),
    null,
  );
  assert.throws(
    () => weightedFirstShinyAdvance(rows, 1),
    /outside the configured window/,
  );
});

test("TID 25567 at target 1245 with a nine-advance radius reproduces the supplied 9158 example", () => {
  const s = { ...newStarterGuide(), tid: "25567" };
  s.intro.uncertainty = 9;
  const preview = previewStarterTid(s);
  assert.equal(preview.weightedAverage, 9158.22);
  assert.equal(Math.round(preview.weightedAverage!), 9158);
  assert.equal(firstShinyWait(preview.weightedAverage!), "2 min 33 sec");
  const markup = renderToStaticMarkup(
    createElement(StarterTidPreview, { value: preview }),
  );
  assert.match(markup, /Weighted Average First Shiny Advance/);
  assert.match(markup, /9,158 advances/);
  assert.match(markup, /2 min 33 sec/);
  assert.ok(
    markup.indexOf("</table>") <
      markup.indexOf("Weighted Average First Shiny Advance"),
  );
  assert.doesNotMatch(markup, /<button|Green:|Yellow:|Red:/);
});

test("weighted estimate includes all configured timing witnesses, not just the visible or favorable rows", () => {
  const s = { ...newStarterGuide(), tid: "25567" };
  const before = structuredClone(s);
  const preview = previewStarterTid(s);
  const all = generateSidRng(
    Number(s.tid),
    estimatedSidWindow(s.intro),
  ).flatMap((row) =>
    row.advances.map((advance) => ({ sid: row.sid, advance })),
  );
  assert.equal(all.length, 121);
  assert.equal(preview.rows.length, 19);
  const first = firstShinies(
    Number(s.tid),
    all.map((row) => row.sid),
    650,
    1000000,
  );
  assert.ok(first.every((advance) => advance !== null));
  let sum = 0,
    weights = 0;
  all.forEach((row, i) => {
    const weight =
      s.intro.uncertainty + 1 - Math.abs(row.advance - preview.target);
    sum += first[i]! * weight;
    weights += weight;
  });
  assert.equal(preview.weightedAverage, sum / weights);
  assert.equal(Math.round(preview.weightedAverage!), 10224);
  assert.notEqual(
    preview.weightedAverage,
    weightedFirstShinyAdvance(preview.rows, s.intro.uncertainty),
  );
  assert.deepEqual(s, before);
  const other = previewStarterTid({ ...s, tid: "50998" });
  assert.notEqual(other.weightedAverage, preview.weightedAverage);
});

test("wait formatting rounds whole seconds and carries into minutes at the GBA rate", () => {
  assert.equal(firstShinyWait(0), "0 min 0 sec");
  assert.equal(firstShinyWait(59.6 * EMERALD_FPS), "1 min 0 sec");
  assert.equal(firstShinyWait(125 * EMERALD_FPS), "2 min 5 sec");
});
