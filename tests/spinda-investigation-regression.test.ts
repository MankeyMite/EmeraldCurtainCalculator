import test from "node:test";
import assert from "node:assert/strict";
import { decodePokemon, parseHex } from "../src/core/pokemon";
import {
  defaultSpindaMatcher,
  generateSpindaCandidates,
} from "../src/core/spindaMatcher";
import {
  newSpindaSidGuide,
  spindaInfoPlaintext,
  spindaRngEvidence,
  spindaSidTargets,
  guidePlaintextDetails,
} from "../src/core/spindaSidGuide";
import {
  sidCandidateMasks,
  spindaStatCandidate,
  usefulSpindaTargets,
} from "../src/core/spindaUsefulness";
import { freshCapturePreset } from "../src/core/facts";
import { newSnapshot } from "../src/core/investigation";
import { computeDeduction } from "../src/core/deduction";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpindaSidGuide } from "../src/components/SpindaSidGuide";

// Real reported case. Reference bytes are an audit oracle, never solver input.
const reference = parseHex(
  "f53a9bbebe26d6a2cdcac3c8bebbff0038000202c7dde7e8d5dfd900b8e200004b00c20d7828653f4b1c4d1c6a1cb01cf21c4d1c6816591c4b1c4d1c4b1c4d1c4b1c4d1c7f1d4d1cc7164d1c4b5a4d1c",
);
const identity = {
  species: 308,
  metGame: 3,
  tid: 9918,
  otGender: "male" as const,
  pid: 0xbe9b3af5,
  ball: 2,
};
const source = newSnapshot("base", "Spinda", freshCapturePreset({ isEgg: 0 }));
source.summaryStats = { level: 15, stats: [45, 23, 24, 27, 22, 25] };
const settings = defaultSpindaMatcher().settings;
const guide = {
  ...newSpindaSidGuide(identity.pid),
  freshZeros: true,
  paddingZero: true,
  observations: { 87: 1 as const, 135: 1 as const },
};
const sids = [0x62d6, 0x72d6, 0xa2d6, 0xb2d6];
const tested = [59694, 29426, 4, 62262];
const input = {
  identity,
  snapshots: [source],
  activeId: source.id,
  sidCandidates: sids,
  spindaGuide: { guide, settings },
};
const pixel = (n: number) =>
  ((reference[(n - 16) >>> 1] >>> (((n - 16) % 2) * 4)) & 15) === 0 ? 0 : 1;

test("guide and main RNG answers use the same IV spread", () => {
  const baseline = { ...source, summaryStats: undefined };
  const ivGuide = { ...guide, observations: { 94: 0 as const } };
  const result = computeDeduction({
    ...input,
    snapshots: [baseline],
    rng: settings,
    sidCandidates: [0x06d6, 0x0dd6],
    spindaGuide: { guide: ivGuide, settings },
  });
  assert.deepEqual(result.sidAnalysis?.sidValues, [0x06d6, 0x0dd6]);
  assert.ok(result.sidAnalysis!.candidates.length > 1);
  for (const h of result.sidAnalysis!.candidates) {
    const ivWord = h.rng!.ivs.reduce((word, iv, n) => word | (iv << (n * 5)), 0);
    assert.equal((ivWord >>> 24) & 15, (h.key >>> 24) & 15);
  }
});

test("reported shiny Spinda: a wrong origins answer excluded the true SID; skipped move digit was solved", () => {
  const decoded = decodePokemon(reference);
  assert.ok(decoded.checksumValid);
  assert.equal(decoded.sid, 41686);
  assert.equal(decoded.pid, identity.pid);
  assert.equal(decoded.heldItem, 0);
  assert.equal(pixel(87), 0);
  assert.equal(pixel(135), 1);
  assert.equal(pixel(108), 0);
  const info = spindaInfoPlaintext({
    ...source.knownFacts,
    ...identity,
    moves: decoded.moves,
  });
  const move = spindaSidTargets(identity.pid, 4).find((t) => t.nibble === 108)!;
  assert.equal(
    guidePlaintextDetails(guide, move, info).value! ^ move.pidDigit,
    6,
  );
  const candidate = spindaStatCandidate(
    generateSpindaCandidates(defaultSpindaMatcher()).find(
      (c) => c.pid === identity.pid,
    ),
    { ...source.knownFacts, ...identity },
    source.summaryStats,
  )!;
  assert.ok(candidate.encounters.length);
  assert.ok(candidate.encounters.every((e) => e.methods.includes("H4")));
  assert.ok(
    candidate.encounters.every((e) => e.ivs.join() === decoded.ivs.join()),
  );
  const rng = spindaRngEvidence(identity.pid, candidate, info)!;
  assert.ok(
    !usefulSpindaTargets(
      guide,
      sidCandidateMasks(sids),
      tested,
      info,
      rng.masks,
    ).some((t) => t.nibble === 108),
  );
});

test("main planner uses current guide immediately, and editing/clearing answers restores candidates", () => {
  const result = computeDeduction(input);
  assert.deepEqual(result.spindaBaseSidValues, sids);
  assert.deepEqual(result.sidAnalysis?.sidValues, [0x62d6, 0x72d6]);
  const corrected = {
    ...guide,
    observations: { 87: 0 as const, 135: 1 as const },
  };
  const fixed = computeDeduction({
    ...input,
    spindaGuide: { guide: corrected, settings },
  });
  assert.deepEqual(fixed.sidAnalysis?.sidValues, [0xa2d6]);
  assert.deepEqual(fixed.spindaGuideProgress?.remainingSids, [0xa2d6]);
  const clear = computeDeduction({
    ...input,
    spindaGuide: { guide: { ...guide, observations: {} }, settings },
  });
  assert.deepEqual(clear.sidAnalysis?.sidValues, sids);
  assert.deepEqual(
    guide.observations,
    { 87: 1, 135: 1 },
    "do not silently repair supplied answers",
  );
  const html = renderToStaticMarkup(
    createElement(SpindaSidGuide, {
      value: guide,
      onChange: () => {},
      facts: { ...source.knownFacts, ...identity },
      baseSids: sids,
      tested,
    }),
  );
  assert.match(html, /Answer for row 9, column 8/);
});

test("an active item experiment never reinterprets baseline guide pixels using its changed item", () => {
  const item = {
    ...newSnapshot("item", "Different item", {
      ...source.knownFacts,
      assumed: source.knownFacts.assumed?.filter((a) => a !== "heldItem"),
      heldItem: 13,
    }),
    itemTest: {
      sourceId: source.id,
      phase: "editing" as const,
      mode: "pixels" as const,
    },
    targets: [100],
  };
  const baselineGuide = {
    ...guide,
    observations: { 87: 0 as const, 135: 1 as const, 156: 1 as const },
  };
  const args = { ...input, spindaGuide: { guide: baselineGuide, settings } };
  const before = computeDeduction(args);
  const active = computeDeduction({
    ...args,
    snapshots: [source, item],
    activeId: item.id,
  });
  assert.deepEqual(active.spindaGuideProgress, before.spindaGuideProgress);
  assert.deepEqual(
    active.sidAnalysis?.sidValues,
    before.sidAnalysis?.sidValues,
  );
});
