import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { allowedValues, type KnownFacts } from "../src/core/constraints";
import { knownPlaintext } from "../src/core/inference";
import { pixelAddress } from "../src/core/tiles";
import {
  hitForNibble,
  recordStripLayout,
} from "../src/components/WorkbenchData";
import { SpindaSidGuide } from "../src/components/SpindaSidGuide";
import {
  spindaEstimatedFacts,
  defaultSpindaMatcher,
} from "../src/core/spindaMatcher";
import { SpindaMatcher } from "../src/components/SpindaMatcher";
import type { CurtainLab } from "../src/hooks/useCurtainLab";
import {
  newSpindaSidGuide,
  spindaSidTargets,
  spindaSidMasks,
  sidDigitMask,
  guidePlaintext,
  guidePlaintextDetails,
  spindaInfoPlaintext,
  validateSpindaSidGuide,
  spindaBlockOrder,
} from "../src/core/spindaSidGuide";

// pret GetSubstruct's SUBSTRUCT_CASE values, independent of the app's table.
const positions = [
  "0123",
  "0132",
  "0213",
  "0312",
  "0231",
  "0321",
  "1023",
  "1032",
  "2013",
  "3012",
  "2031",
  "3021",
  "1203",
  "1302",
  "2103",
  "3102",
  "2301",
  "3201",
  "1230",
  "1320",
  "2130",
  "3120",
  "2310",
  "3210",
];
test("SID guide resolves all four digits and all 24 permutations to the actual flipped curtain tiles", () => {
  const logical = Uint8Array.from(
      { length: 48 },
      (_, i) => (i * 61 + 23) & 255,
    ),
    sid = 0xabcd,
    tid = 0x9876;
  for (let order = 0; order < 24; order++) {
    const pid = 0x12345678 - (0x12345678 % 24) + order,
      key = (pid ^ ((sid << 16) | tid)) >>> 0,
      encrypted = new Uint8Array(80),
      view = new DataView(encrypted.buffer),
      guide = newSpindaSidGuide(pid);
    positions[order]
      .split("")
      .forEach((physical, logicalBlock) =>
        encrypted.set(
          logical.slice(logicalBlock * 12, logicalBlock * 12 + 12),
          32 + Number(physical) * 12,
        ),
      );
    for (let n = 32; n < 80; n += 4)
      view.setUint32(n, view.getUint32(n, true) ^ key, true);
    const all = [];
    for (const digit of [1, 2, 3, 4] as const) {
      const targets = spindaSidTargets(pid, digit);
      assert.equal(targets.length, 12);
      for (const t of targets) {
        const logicalByte = t.logicalNibble >>> 1,
          half = t.logicalNibble % 2,
          byte =
            32 +
            Number(positions[order][Math.floor(logicalByte / 12)]) * 12 +
            (logicalByte % 12);
        assert.equal(t.nibble, 16 + byte * 2 + half);
        assert.equal(t.keyNibble, 8 - digit);
        const p = (logical[logicalByte] >>> (half * 4)) & 15,
          ciphertext = (encrypted[byte] >>> (half * 4)) & 15;
        guide.plaintext[t.logicalNibble] = p;
        guide.observations[t.nibble] = ciphertext === 0 ? 0 : 1;
        const mask = sidDigitMask(t.pidDigit, p, ciphertext === 0 ? 0 : 1);
        assert.ok(mask & (1 << ((sid >>> ((4 - digit) * 4)) & 15)));
        const hit = hitForNibble(t.nibble)!;
        assert.equal(hit.slot, 5);
        assert.equal(hit.offset, byte);
        assert.equal(
          pixelAddress(
            hit.tile,
            hit.displayX -
              recordStripLayout().placements.find((pl) => pl.tile === hit.tile)!
                .x,
            hit.displayY -
              recordStripLayout().placements.find((pl) => pl.tile === hit.tile)!
                .y,
            hit.flipped,
          ).nibble,
          t.nibble,
        );
        all.push(t.nibble);
      }
    }
    assert.equal(new Set(all).size, 48);
    spindaSidMasks(guide).forEach((m, i) =>
      assert.ok(m & (1 << ((sid >>> ((3 - i) * 4)) & 15))),
    );
    assert.equal(spindaBlockOrder(pid).length, 4);
  }
  assert.notEqual(
    spindaSidTargets(0, 1)[0].nibble,
    spindaSidTargets(6, 1)[0].nibble,
    "held item moves with Growth",
  );
});

test("transparent, black and missing answers match exhaustive nibble encryption without TID", () => {
  for (let pidDigit = 0; pidDigit < 16; pidDigit++)
    for (let plaintext = 0; plaintext < 16; plaintext++) {
      for (const answer of [-1, 0, 1] as const) {
        const expected = Array.from({ length: 16 }, (_, sid) => sid).filter(
          (sid) =>
            answer === -1 ||
            ((plaintext ^ pidDigit ^ sid) === 0 ? 0 : 1) === answer,
        );
        assert.deepEqual(
          allowedValues(sidDigitMask(pidDigit, plaintext, answer)),
          expected,
        );
      }
      assert.equal(sidDigitMask(pidDigit, undefined, 0), 65535);
    }
  const guide = newSpindaSidGuide(0x12345678);
  for (const digit of [1, 2, 3, 4] as const) {
    const t = spindaSidTargets(guide.pid, digit)[0];
    guide.plaintext[t.logicalNibble] = t.pidDigit ^ (9 + digit);
    guide.observations[t.nibble] = 0;
  }
  assert.deepEqual(spindaSidMasks(guide).map(allowedValues), [
    [10],
    [11],
    [12],
    [13],
  ]);
  const t = spindaSidTargets(guide.pid, 1)[1];
  guide.plaintext[t.logicalNibble] = 1;
  guide.observations[t.nibble] = 0;
  assert.equal(
    spindaSidMasks(guide)[0],
    0,
    "contradictory transparent fields never produce a false digit",
  );
});

test("fresh zero and padding assumptions are independent, opt-in, and can be overridden", () => {
  const guide = newSpindaSidGuide(0x88888888),
    targets = spindaSidTargets(guide.pid, 1);
  assert.ok(targets.every((t) => guidePlaintext(guide, t) === undefined));
  guide.freshZeros = true;
  assert.deepEqual(
    targets.filter((t) => guidePlaintext(guide, t) === 0).map((t) => t.field),
    ["Speed EV", "Beauty", "Sheen", "Ribbons / flags, byte 4"],
  );
  guide.paddingZero = true;
  assert.equal(guidePlaintext(guide, targets[2]), 0);
  assert.equal(
    guidePlaintext(guide, targets[10]),
    undefined,
    "IVs never become zero by preset",
  );
  guide.plaintext[targets[6].logicalNibble] = -1;
  assert.equal(guidePlaintext(guide, targets[6]), undefined);
  guide.plaintext[targets[7].logicalNibble] = 9;
  assert.equal(guidePlaintext(guide, targets[7]), 9);
});

test("Origins, move IDs, PP and packed IV target nibbles agree with the established stored-data engine", () => {
  for (const [level, lo] of [
    [14, 0x8e],
    [15, 0x8f],
    [16, 0x90],
  ])
    for (const otGender of ["male", "female"] as const) {
      const facts: KnownFacts = {
          metGame: 3,
          metLevel: level,
          ball: 4,
          otGender,
        },
        p = knownPlaintext(facts),
        expected = lo | ((otGender === "male" ? 0x21 : 0xa1) << 8);
      for (const digit of [1, 2, 3, 4] as const) {
        const t = spindaSidTargets(0x12345678, digit).find((t) =>
          t.field.startsWith("Origins"),
        )!;
        assert.deepEqual(allowedValues(p[t.logicalNibble]), [
          (expected >>> ((4 - digit) * 4)) & 15,
        ]);
      }
    }
  const p = knownPlaintext({
    moves: [33, 253, 185, 60],
    pp: [35, 10, 20, 20],
    ivs: [1, 2, 3, 4, 5, 6],
    isEgg: 0,
  });
  for (const digit of [1, 2, 3, 4] as const) {
    const targets = spindaSidTargets(0, digit);
    assert.deepEqual(
      allowedValues(p[targets[3].logicalNibble]),
      [[0], [0], [15], [13]][digit - 1],
    );
    assert.deepEqual(
      allowedValues(p[targets[4].logicalNibble]),
      [[0], [0], [3], [12]][digit - 1],
    );
    assert.deepEqual(
      allowedValues(p[targets[5].logicalNibble]),
      [[1], [4], [1], [4]][digit - 1],
    );
  }
  assert.deepEqual(
    allowedValues(p[spindaSidTargets(0, 3)[10].logicalNibble]),
    [5],
    "SpAtk low nibble",
  );
  assert.deepEqual(
    allowedValues(p[spindaSidTargets(0, 4)[10].logicalNibble]),
    [2],
    "Speed bits 1–4",
  );
});

test("testing another permutation retains physical answers and logical plaintext without relabeling them", () => {
  const guide = newSpindaSidGuide(0),
    t = spindaSidTargets(0, 1)[0];
  guide.observations[t.nibble] = 0;
  guide.plaintext[t.logicalNibble] = 9;
  const next = { ...guide, pid: 6 },
    changed = spindaSidTargets(next.pid, 1)[0];
  assert.notEqual(changed.nibble, t.nibble);
  assert.equal(next.observations[t.nibble], 0);
  assert.equal(next.observations[changed.nibble], undefined);
  assert.equal(guidePlaintext(next, changed), 9);
  assert.deepEqual(validateSpindaSidGuide(next), next);
  for (const bad of [
    { digit: 0 },
    { pid: -1 },
    { observations: { 16: 0 } },
    { observations: { 84: 2 } },
    { plaintext: { 4: 16 } },
    { plaintext: [] },
  ])
    assert.throws(
      () => validateSpindaSidGuide({ ...next, ...bad }),
      /Invalid Spinda SID guide/,
    );
});

test("estimated PID transfer needs no trainer or summary facts and preserves supplied evidence", () => {
  assert.deepEqual(spindaEstimatedFacts({}, 0xfedcba98), {
    species: 308,
    pid: 0xfedcba98,
  });
  const facts: KnownFacts = {
      species: 308,
      pid: 1,
      evs: [0, null, 3, 4, 5, 6],
      notes: "Existing evidence",
    },
    before = structuredClone(facts);
  assert.deepEqual(spindaEstimatedFacts(facts, 2), { ...facts, pid: 2 });
  assert.deepEqual(facts, before);
  assert.equal(spindaEstimatedFacts({ species: 25 }, 2), undefined);
  assert.equal(spindaEstimatedFacts({}, -1), undefined);
});

test("SID guide renders useful pixel locations immediately with no Pokémon fields filled", () => {
  const html = renderToStaticMarkup(
    createElement(SpindaSidGuide, {
      value: newSpindaSidGuide(0x12345678),
      onChange: () => {},
    }),
  );
  assert.ok(html.includes("0 useful pixels"));

  assert.match(html, /row \d+, column \d+/);
  assert.equal((html.match(/class="target/g) || []).length, 0);
  assert.ok(!html.includes(">Transparent</button>"));
});

test("Pokémon info automatically supplies all 48 SID plaintext nibbles across every permutation", () => {
  const facts: KnownFacts = {
      species: 308,
      heldItem: 0x1234,
      experience: 0x56789abc,
      growthPadding: 0xbeef,
      moves: [33, 253, 185, 60],
      pp: [35, 10, 20, 20],
      evs: [1, 2, 3, 4, 5, 6],
      contest: [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc],
      metGame: 3,
      metLevel: 16,
      ball: 4,
      otGender: "male",
      ivs: [31, 0, 17, 4, 5, 6],
      isEgg: 0,
      ability: 20,
      ribbons: 0x01234567,
      ribbonTail: 26,
    },
    before = structuredClone(facts),
    bytes = new Uint8Array(48),
    view = new DataView(bytes.buffer);
  view.setUint16(2, 0x1234, true);
  view.setUint32(4, 0x56789abc, true);
  view.setUint16(10, 0xbeef, true);
  [33, 253, 185, 60].forEach((n, i) => view.setUint16(12 + i * 2, n, true));
  bytes.set([35, 10, 20, 20], 20);
  bytes.set([1, 2, 3, 4, 5, 6], 24);
  bytes.set([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc], 30);
  view.setUint16(38, 0x2190, true);
  view.setUint32(
    40,
    [31, 0, 17, 4, 5, 6].reduce((v, n, i) => v | (n << (i * 5)), 0),
    true,
  );
  view.setUint32(44, (0x01234567 | (26 << 27)) >>> 0, true);
  const info = spindaInfoPlaintext(facts);
  for (let pid = 0; pid < 24; pid++)
    for (const digit of [1, 2, 3, 4] as const) {
      const guide = newSpindaSidGuide(pid);
      for (const target of spindaSidTargets(pid, digit)) {
        const expected =
          (bytes[target.logicalNibble >>> 1] >>>
            ((target.logicalNibble % 2) * 4)) &
          15;
        assert.deepEqual(guidePlaintextDetails(guide, target, info), {
          value: expected,
          source: "info",
        });
      }
      assert.deepEqual(
        guide.plaintext,
        {},
        "derived info must never become a saved manual override",
      );
    }
  assert.deepEqual(facts, before);
});

test("automatic packed nibbles retain unknown bits and known info takes precedence over zero presets", () => {
  const guide = newSpindaSidGuide(0),
    high = spindaSidTargets(0, 1),
    low = spindaSidTargets(0, 2);
  let info = spindaInfoPlaintext({
    species: 308,
    metGame: 3,
    ball: 4,
    isEgg: 0,
    ribbons: 0,
    evs: [null, null, null, 19, null, null],
  });
  assert.equal(
    guidePlaintext(guide, high[9], info),
    undefined,
    "OT gender is missing from the Origins high nibble",
  );
  assert.equal(
    guidePlaintext(guide, low[9], info),
    1,
    "lower Origins nibble is exact without OT gender or met level",
  );
  assert.equal(
    guidePlaintext(guide, high[10], info),
    undefined,
    "non-Egg flag does not establish the IV/ability nibble",
  );
  assert.equal(
    guidePlaintext(guide, high[11], info),
    undefined,
    "upper ribbon flags are unknown",
  );
  assert.equal(
    guidePlaintext(guide, low[11], info),
    undefined,
    "the unused ribbon bit remains unknown",
  );
  guide.freshZeros = true;
  assert.equal(
    guidePlaintext(guide, high[6], info),
    1,
    "entered Speed EV 19 overrides the fresh-zero preset",
  );
  assert.equal(guidePlaintext(guide, low[6], info), 3);
  info = spindaInfoPlaintext({ species: 308, ribbons: 1 << 24 });
  assert.equal(
    guidePlaintext(guide, low[11], info),
    undefined,
    "partial known nonzero bits prevent a contradictory zero preset",
  );
  assert.equal(
    spindaInfoPlaintext({ species: 25, heldItem: 0x1234 }),
    undefined,
  );
  assert.equal(
    spindaInfoPlaintext({ moves: [0, 0, 0, 0] }),
    undefined,
    "blank-form default slots are not Spinda evidence",
  );
});

test("live Pokémon info updates guide SID implications without replacing manual values or observations", () => {
  const guide = newSpindaSidGuide(0xabcd0000);
  for (const d of [1, 2, 3, 4] as const)
    guide.observations[spindaSidTargets(guide.pid, d)[0].nibble] = 0;
  const before = structuredClone(guide),
    first = spindaInfoPlaintext({ species: 308, heldItem: 0x1234 }),
    changed = spindaInfoPlaintext({ species: 308, heldItem: 0x5678 });
  assert.deepEqual(spindaSidMasks(guide, first).map(allowedValues), [
    [11],
    [9],
    [15],
    [9],
  ]);
  assert.deepEqual(spindaSidMasks(guide, changed).map(allowedValues), [
    [15],
    [13],
    [11],
    [5],
  ]);
  assert.deepEqual(guide, before);
  const target = spindaSidTargets(guide.pid, 1)[0];
  guide.plaintext[target.logicalNibble] = 0;
  assert.deepEqual(guidePlaintextDetails(guide, target, changed), {
    value: 0,
    source: "manual",
  });
  assert.deepEqual(allowedValues(spindaSidMasks(guide, changed)[0]), [10]);
  guide.plaintext[target.logicalNibble] = -1;
  assert.equal(
    spindaSidMasks(guide, changed)[0],
    65535,
    "explicit Unknown suppresses automatic info",
  );
  delete guide.plaintext[target.logicalNibble];
  assert.equal(
    guidePlaintext(guide, target, changed),
    5,
    "reset resumes automatic info",
  );
  assert.equal(
    guidePlaintext(guide, target, spindaInfoPlaintext({ species: 308 })),
    undefined,
    "clearing info clears its automatic nibble",
  );
  assert.deepEqual(guide.observations, before.observations);
});

test("matcher reuses the guide with live known plaintext, manual overrides and invalid-input feedback", () => {
  const state = defaultSpindaMatcher();
  state.guide = newSpindaSidGuide(state.pid);
  const lab = {
    spindaMatcher: state,
    facts: { species: 308, heldItem: 0x1234 },
    setSpindaMatcher: () => {},
  } as unknown as CurtainLab;
  const render = () =>
    renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
  assert.ok(render().includes("Plaintext <code>1</code>"));
  lab.facts = { ...lab.facts, heldItem: 0xabcd };
  assert.ok(render().includes("Plaintext <code>A</code>"));
  state.guide.plaintext[7] = 9;
  assert.ok(render().includes("Plaintext <code>9</code>"));
  lab.factError = "Invalid input";
  assert.ok(render().includes("or summary stats before checking pixels"));
});
