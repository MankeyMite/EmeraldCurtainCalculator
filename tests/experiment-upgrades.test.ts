import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  controlledActions,
  createControlledTest,
} from "../src/core/controlledExperiments";
import { pokeblockConditions } from "../src/core/consumableEffects";
import { rankPixelDomains } from "../src/core/experimentOutcomes";
import {
  rankDomainExperiments,
  type ExperimentDomain,
} from "../src/core/domainExperiments";
import { knownPlaintext } from "../src/core/inference";
import { makeHypothesis } from "../src/core/sid";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
  investigationFileName,
} from "../src/core/investigation";
import {
  targetExperiment,
  answerExperimentPixel,
  finishPixelExperiment,
} from "../src/core/itemTests";
import { experimentChecksumDelta } from "../src/core/checksumExperiments";
import { PROFILE } from "../src/core/memory";
import { ItemTestControls } from "../src/components/ItemTestControls";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

function spinda(level = 14) {
  return {
    ...newSnapshot("base", "Spinda", {
      moves: [33, 253, 185, 0],
      pp: [35, 10, 20, 0],
      ppBonuses: 0,
      friendship: 70,
      experience: 2195,
      contest: [0, 0, 0, 0, 0, 0],
    }),
    summaryStats: { level, stats: Array(6).fill(null) },
  };
}

test("Spinda's empty slot stays empty at 15 and automatically learns Psybeam at 16", () => {
  const source = spinda();
  const candy = controlledActions(source, 308).find((a) => a.kind === "candy")!;
  assert.equal(candy.level, 15);
  assert.equal(candy.changes.experience, 2700);
  assert.equal(candy.changes.moves, undefined);
  const target = createControlledTest(source, "candy", candy, [88]);
  assert.equal(target.knownFacts.friendship, undefined);
  assert.equal(experimentChecksumDelta(source, target), null);
  const next = controlledActions(spinda(15), 308).find(
    (a) => a.kind === "candy",
  )!;
  assert.deepEqual(next.changes.moves, [33, 253, 185, 60]);
  assert.deepEqual(next.changes.pp, [35, 10, 20, 20]);
  assert.ok(next.logical.includes(36) && next.logical.includes(46));
  assert.ok(
    !controlledActions(
      { ...source, knownFacts: { moves: [33, null, 185, 0] } },
      308,
    ).some((a) => a.kind === "candy"),
  );
});

test("PP actions preserve unrelated packed counters, heal boxed PP, and exclude Sketch", () => {
  const source = spinda();
  source.knownFacts.ppBonuses = 0x84;
  source.knownFacts.pp![1] = 12; // One existing PP Up on Uproar; boxed PP is full.
  const up = controlledActions(source).find((a) => a.id === "pp-up-1")!;
  assert.equal(up.changes.ppBonuses, 0x88);
  assert.equal(up.changes.pp![1], 14);
  const max = controlledActions(source).find((a) => a.id === "pp-max-1")!;
  assert.equal(max.changes.ppBonuses, 0x8c);
  assert.equal(max.changes.pp![1], 16);
  assert.equal(
    createControlledTest(source, "pp", up, [96]).knownFacts.friendship,
    undefined,
  );
  source.knownFacts.friendship = 255;
  const stable = controlledActions(source).find((a) => a.id === "pp-max-1")!;
  const target = createControlledTest(source, "pp", stable, [96]);
  assert.equal(experimentChecksumDelta(source, target), 8 + (16 - 12) * 256);
  assert.ok(
    !controlledActions({
      ...source,
      knownFacts: { moves: [166, 0, 0, 0], ppBonuses: 0 },
    }).some((a) => a.kind === "pp"),
  );
});

test("Pokéblock effects use Emerald's net-flavor direction, nearest rounding and caps", () => {
  // Lonely likes spicy and dislikes sour. Only the net direction is adjusted.
  assert.deepEqual(
    pokeblockConditions([250, 0, 0, 0, 0, 250], [25, 0, 0, 0, 15, 20], 1),
    [255, 0, 0, 0, 15, 255],
  );
  assert.deepEqual(
    pokeblockConditions([0, 0, 0, 0, 0, 0], [15, 0, 0, 0, 25, 20], 1),
    [15, 0, 0, 0, 22, 20],
  );
  assert.deepEqual(
    pokeblockConditions([0, 0, 0, 0, 0, 0], [15, 0, 0, 0, 15, 20], 1),
    [15, 0, 0, 0, 15, 20],
  );
  assert.equal(
    pokeblockConditions([0, 0, 0, 0, null, 0], [1, 0, 0, 0, 0, 1], 1),
    null,
  );
  assert.equal(
    pokeblockConditions([0, 0, 0, 0, 0, 255], [1, 0, 0, 0, 0, 1], 1),
    null,
  );
  const source = { ...spinda(), experimentPokeblock: [25, 0, 0, 0, 15, 20] };
  const block = controlledActions(source, 308, { nature: 1 }).find(
    (a) => a.kind === "pokeblock",
  )!;
  const target = createControlledTest(source, "block", block, [140]);
  assert.equal(experimentChecksumDelta(source, target), 28 + 15 + 20 * 256);
  assert.ok(
    !controlledActions(source, 308).some((a) => a.kind === "pokeblock"),
  );
});

test("joint item ranking retains multiple digits and suppresses previously verified questions", () => {
  const source = newSnapshot("base", "Base", { heldItem: 0 });
  const candidates = [0, 1, 16, 17].map((sid) => makeHypothesis(0, 0, sid));
  const counts = Array.from({ length: 24 }, () =>
    Array.from({ length: 8 }, () => Array(16).fill(0)),
  );
  for (const h of candidates)
    for (let n = 0; n < 8; n++) counts[0][n][(h.key >>> (4 * n)) & 15]++;
  const domain: ExperimentDomain = {
    consistent: true,
    orders: [0],
    headerPairCount: 4n,
    orderKeyCounts: counts,
  };
  const ranked = rankDomainExperiments({ tid: 0 }, [source], source, domain, {
    candidates,
  });
  const item = ranked.experiments.find((e) => e.item.id === 1)!;
  assert.ok(item.pixels.length >= 2);
  assert.equal(item.worstCase, 1);
  const pixels = item.pixels.map((p) => p.index);
  const plain = knownPlaintext({ heldItem: 1 });
  const reduced = rankPixelDomains(candidates.slice(0, 2), plain, pixels)!;
  assert.equal(reduced.pixels.length, 1, "the second key digit is now fixed");
  const prior = {
    ...newSnapshot("prior", "Prior", { heldItem: 1 }),
    itemTest: {
      sourceId: source.id,
      phase: "recorded" as const,
      changed: true,
    },
  };
  pixels.forEach((n) => (prior.observations[n] = 1));
  assert.ok(
    !rankDomainExperiments(
      { tid: 0 },
      [source, prior],
      source,
      domain,
    ).experiments.some((e) => e.item.id === 1),
  );
});

test("overlapping unknown-plaintext outcomes are conservative across all 24 orders", () => {
  const candidates = Array.from({ length: 24 }, (_, pid) =>
    makeHypothesis(pid, 0, 0),
  );
  const plain = Array.from({ length: 96 }, (_, n) => 1 << (n % 16));
  plain[4] = 3; // Unknown plaintext: a genuine identity may support both outcomes.
  const positions = [84, 108, 132, 156];
  const actual = new Map<string, Set<number>>();
  candidates.forEach((h, id) => {
    for (const unknown of [0, 1]) {
      const physical = new Uint8Array(48);
      plain.forEach((mask, n) => {
        const digit = n === 4 ? unknown : Math.log2(mask);
        const at =
          SUBSTRUCT_POSITIONS[h.pid % 24][Math.floor(n / 24)] * 24 + (n % 24);
        physical[at >>> 1] |= digit << ((at % 2) * 4);
      });
      for (let i = 0; i < 48; i++)
        physical[i] ^= (h.key >>> ((i % 4) * 8)) & 255;
      const signature = positions
        .map((n) =>
          ((physical[(n - 80) >>> 1] >>> (((n - 80) % 2) * 4)) & 15) === 0
            ? 0
            : 1,
        )
        .join("");
      const group = actual.get(signature) ?? new Set<number>();
      group.add(id);
      actual.set(signature, group);
    }
  });
  const ranked = rankPixelDomains(candidates, plain, positions)!;
  assert.equal(
    ranked.worstCase,
    Math.max(...[...actual.values()].map((s) => s.size)),
  );
  assert.equal(ranked.groups, actual.size);
  assert.equal(
    rankPixelDomains(
      candidates,
      Array(96).fill(65535),
      positions,
      undefined,
      null,
      new Set(),
      1,
    ),
    null,
  );
  const nuisance = rankPixelDomains(
    candidates.slice(0, 2),
    Array(96).fill(65535),
    [84],
  )!;
  assert.equal(nuisance.worstCase, 2);
  assert.deepEqual(nuisance.pixels, []);
  const wrapped = rankPixelDomains(
    candidates.slice(0, 2),
    plain,
    [],
    [[65535], [0]],
    1,
  )!;
  assert.equal(wrapped.worstCase, 1);
  assert.ok(wrapped.pixels.some((p) => p.index === 72));
});

test("partial multi-pixel answers and Pokéblock configuration round-trip without predicted evidence", () => {
  const source = { ...spinda(), experimentPokeblock: [25, 0, 0, 0, 0, 20] };
  const action = controlledActions(source).find((a) => a.id === "pp-up-0")!;
  const draft = targetExperiment(
    createControlledTest(source, "test", action, [96, 97]),
  );
  const answered = answerExperimentPixel(draft, 96, 1);
  assert.equal(answered.itemTest!.phase, "editing");
  assert.equal(answered.observations[97], -1);
  const saved = finishPixelExperiment(answered);
  const restored = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "wild",
      identity: { species: 308 },
      snapshots: [source, saved],
      activeId: source.id,
      ownedItems: [],
    }),
  );
  assert.equal(
    restored.snapshots[1].observations.filter((v) => v !== -1).length,
    1,
  );
  assert.deepEqual(
    restored.snapshots[0].experimentPokeblock,
    source.experimentPokeblock,
  );
  assert.equal(investigationFileName(308), "Spinda-Curtain.json");
  assert.equal(investigationFileName(), "Pokemon-Curtain.json");
  const lab = {
    activeSnapshot: draft,
    pendingItemTest: draft,
    itemTestBaseline: source,
    currentSnapshots: [source, draft],
    experimentTargets: [96, 97],
    investigationInference: { headerPairCount: 4n },
  } as unknown as CurtainLab;
  const markup = renderToStaticMarkup(
    createElement(ItemTestControls, { lab, openEditor() {}, openResults() {} }),
  );
  assert.match(markup, /Checking pixel 1 of 2/);
  assert.equal((markup.match(/>Black<\/button>/g) ?? []).length, 1);
  assert.equal((markup.match(/>Transparent<\/button>/g) ?? []).length, 1);
});

test("attached Spinda import permits level 15 without any candidate search", () => {
  const path = "C:/Users/augus/Downloads/curtain-investigation (9).json";
  if (!fs.existsSync(path)) return;
  const input = loadInvestigation(fs.readFileSync(path, "utf8"));
  assert.equal(input.identity.species, 308);
  const action = controlledActions(
    input.snapshots[0],
    input.identity.species,
    input.identity,
  ).find((a) => a.kind === "candy")!;
  assert.equal(action.level, 15);
  assert.equal(action.changes.experience, 2700);
  assert.equal(input.identity.pid, undefined);
  assert.equal(input.identity.sid, undefined);
});
