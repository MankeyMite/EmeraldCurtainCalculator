import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fixture from "../research/fixtures/dewford-maractite.json";
import {
  DEWFORD_WORDS,
  answerDewfordTest,
  generateDewfordTrends,
  phraseKey,
  phraseName,
  rankDewfordTests,
  searchDewford,
  validateDewford,
  validateDewfordPhrase,
  type DewfordEvidence,
  type DewfordCase,
} from "../src/core/dewford";
import { advanceSeed } from "../src/core/rng";
import {
  generateSidRng,
  intersectSidCandidates,
  validateSidRng,
  widenSidRng,
} from "../src/core/sidRng";
import { decodePokemon } from "../src/core/pokemon";
import { emptyObservations } from "../src/core/constraints";
import { solveSids } from "../src/core/sid";
import {
  loadInvestigation,
  newSnapshot,
  saveInvestigation,
} from "../src/core/investigation";
import { DewfordPanel } from "../src/components/DewfordPanel";
import type { CurtainLab } from "../src/hooks/useCurtainLab";

const base: DewfordEvidence = {
  currentPhrase: fixture.currentPhrase as [number, number],
  tests: [],
  minGap: 3,
  maxGap: 3,
};

// Separate arithmetic, integer group encoding and literal source counts; does
// not call the production RNG or catalog when choosing a word.
function oracle(seed: number, call: number, gap: number) {
  let state = BigInt(seed);
  const random = () => {
    state = (state * 0x41c64e6dn + 0x6073n) & 0xffffffffn;
    call++;
    return Number(state >> 16n);
  };
  for (let i = 0; i < gap; i++) random();
  return Array.from({ length: 5 }, () => {
    const firstAdvance = call + 1,
      first = 0x1400 + (random() % 69);
    const life = random() % 2,
      second = (life ? 0x1800 : 0x1a00) + (random() % (life ? 45 : 54));
    const gaining = random() % 2 === 1;
    let max = random() % 98;
    if (max >= 51) {
      max = random() % 98;
      if (max >= 81) max = random() % 98;
    }
    const trendiness = 30 + (random() % (max + 1)),
      rand = random();
    return {
      phrase: [first, second],
      firstAdvance,
      lastAdvance: call,
      gaining,
      maxTrendiness: max + 30,
      trendiness,
      rand,
    };
  });
}
test("English Dewford words retain source group/index IDs, independent order and multiword segments", () => {
  assert.deepEqual(
    [
      DEWFORD_WORDS.conditions.length,
      DEWFORD_WORDS.lifestyle.length,
      DEWFORD_WORDS.hobbies.length,
    ],
    [69, 45, 54],
  );
  assert.equal(phraseName([0x140b, 0x1a03]), "TOGETHER · MOVIE");
  assert.equal(phraseName([0x1422, 0x1a06]), "OVERWHELMING · CHILD'S PLAY");
  assert.throws(() => validateDewfordPhrase([0x1a03, 0x140b]));
  assert.throws(() => validateDewfordPhrase([0x1400, 0x1aff]));
  assert.equal(
    DEWFORD_WORDS.commit,
    JSON.parse(readFileSync("src/data/mapping.json", "utf8")).commit,
  );
});
test("five-trend source generation agrees with an independent BigInt oracle, including variable 7/8/9-call branches", () => {
  const lengths = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const seed = (i * 1234567) >>> 0,
      gap = i % 5;
    const actual = generateDewfordTrends(seed, 100, gap);
    assert.deepEqual(actual, oracle(seed, 100, gap));
    actual.forEach((t) => lengths.add(t.lastAdvance - t.firstAdvance + 1));
  }
  assert.deepEqual([...lengths].sort(), [7, 8, 9]);
});
test("published retail example reproduces all five phrases/seeds and resolves reported SID without supplying it", () => {
  const generated = generateDewfordTrends(
    advanceSeed(fixture.tid, fixture.calculatorSidCall),
    fixture.calculatorSidCall,
  );
  assert.deepEqual(
    generated.map((t) => ({
      name: phraseName(t.phrase),
      firstCall: t.firstAdvance,
      lastCall: t.lastAdvance,
      rand: t.rand,
    })),
    fixture.trends,
  );
  const initial = searchDewford(fixture.tid, 100, 2000, base);
  assert.equal(new Set(initial.map((c) => c.sid)).size, 7);
  let evidence = {
    ...base,
    pending: fixture.tests[0].phrase as [number, number],
  };
  const unchanged = generateSidRng(fixture.tid, {
    minAdvance: 100,
    maxAdvance: 2000,
    dewford: evidence,
  });
  assert.equal(unchanged.length, 7, "pending tests are not observations");
  evidence = {
    ...answerDewfordTest(evidence, true),
    pending: fixture.tests[1].phrase as [number, number],
  };
  const final = answerDewfordTest(evidence, false);
  assert.deepEqual(final.tests, fixture.tests);
  const rows = generateSidRng(fixture.tid, {
    minAdvance: 100,
    maxAdvance: 2000,
    dewford: final,
  });
  assert.deepEqual(rows, [
    { sid: fixture.sid, advances: [fixture.calculatorSidCall] },
  ]);
  assert.equal(
    rankDewfordTests(searchDewford(fixture.tid, 100, 2000, final)).length,
    0,
    "resolved/constant tests are not recommended again",
  );
});
test("Dewford windows, gaps and optional disabling retain actual advancing witnesses and allow corrections", () => {
  const settings = { minAdvance: 831, maxAdvance: 831, dewford: base };
  assert.deepEqual(generateSidRng(fixture.tid, settings), [
    { sid: fixture.sid, advances: [831] },
  ]);
  assert.equal(
    generateSidRng(fixture.tid, {
      ...settings,
      minAdvance: 832,
      maxAdvance: 832,
    }).some((r) => r.sid === fixture.sid),
    false,
  );
  const wrong = { ...settings, dewford: { ...base, minGap: 0, maxGap: 0 } };
  assert.deepEqual(generateSidRng(fixture.tid, wrong), []);
  assert.equal(
    generateSidRng(fixture.tid, {
      ...settings,
      dewford: { ...base, minGap: 1, maxGap: 5 },
    })[0].sid,
    fixture.sid,
  );
  assert.deepEqual(
    generateSidRng(fixture.tid, {
      ...wrong,
      dewford: { ...wrong.dewford, enabled: false },
    }),
    generateSidRng(fixture.tid, { minAdvance: 831, maxAdvance: 831 }),
  );
  assert.deepEqual(widenSidRng(settings).dewford, base);
  assert.throws(
    () => validateSidRng({ minAdvance: 1, maxAdvance: 100001, dewford: base }),
    /100,000/,
  );
  assert.throws(
    () =>
      validateDewford({
        ...base,
        tests: [
          { phrase: base.currentPhrase, present: true },
          { phrase: base.currentPhrase, present: false },
        ],
      }),
    /more than once/,
  );
  assert.throws(
    () => validateDewford({ ...base, minGap: 0, maxGap: 6 }),
    /five offsets/,
  );
  assert.throws(() => answerDewfordTest(base, true), /Select/);
});
test("ranked phrase outcomes count overlapping SID sets rather than incorrectly partitioning duplicate advances", () => {
  const candidates = searchDewford(fixture.tid, 100, 2000, base);
  candidates.push({
    ...candidates[1],
    sid: candidates[0].sid,
    advance: 9999,
  } as DewfordCase);
  const recommendations = rankDewfordTests(candidates);
  for (const r of recommendations) {
    const has = (c: DewfordCase) =>
      c.trends.some((t) => phraseKey(t.phrase) === phraseKey(r.phrase));
    assert.equal(
      r.acceptedSids,
      new Set(candidates.filter((c) => !has(c)).map((c) => c.sid)).size,
    );
    assert.equal(
      r.rejectedSids,
      new Set(candidates.filter(has).map((c) => c.sid)).size,
    );
    assert.equal(r.worstCase, Math.max(r.acceptedSids, r.rejectedSids));
  }
  assert.ok(
    recommendations.some(
      (r) =>
        r.acceptedSids + r.rejectedSids >
        new Set(candidates.map((c) => c.sid)).size,
    ),
  );
});
test("phrase-filtered SIDs intersect real known-PID curtain constraints, not candidate-count estimates", () => {
  const record = new Uint8Array(
      readFileSync("research/fixtures/poochyena-test.ek3"),
    ),
    actual = decodePokemon(record),
    snapshot = newSnapshot("s", "Baseline");
  snapshot.observations = emptyObservations();
  record.forEach((b, i) => {
    snapshot.observations[16 + i * 2] = b & 15 ? 1 : 0;
    snapshot.observations[17 + i * 2] = b >>> 4 ? 1 : 0;
  });
  const identity = {
    pid: actual.pid,
    tid: actual.tid,
    species: actual.species,
  };
  const analysis = solveSids(identity, [snapshot], [actual.pid]);
  const trends = generateDewfordTrends(advanceSeed(actual.tid, 1736), 1736);
  const settings = {
    minAdvance: 1,
    maxAdvance: 20000,
    dewford: { ...base, currentPhrase: trends[2].phrase },
  };
  const rows = generateSidRng(actual.tid, settings);
  const expected = analysis.candidates.filter((c) =>
    rows.some((r) => r.sid === c.sid),
  );
  assert.ok(expected.some((c) => c.sid === actual.sid));
  assert.ok(
    new Set(expected.map((c) => c.sid)).size < rows.length,
    "the curtain must remove at least one phrase-compatible SID",
  );
  assert.deepEqual(
    intersectSidCandidates(analysis, rows).analysis!.candidates,
    expected,
  );
});
test("saved Dewford evidence, pending answers and disabled state round-trip without editing Pokémon facts", () => {
  const dewford = {
    ...base,
    enabled: false,
    tests: fixture.tests,
    pending: base.currentPhrase,
  } as DewfordEvidence;
  const investigation = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: "pret-school-v1-zero-aslr" as const,
    origin: "unknown" as const,
    identity: { tid: fixture.tid },
    snapshots: [newSnapshot("s", "Original")],
    activeId: "s",
    ownedItems: [],
    sidRng: { minAdvance: 1, maxAdvance: 3600, dewford },
  };
  const loaded = loadInvestigation(saveInvestigation(investigation));
  assert.deepEqual(loaded.sidRng!.dewford, dewford);
  assert.deepEqual(loaded.identity, { tid: fixture.tid });
  assert.ok(loaded.snapshots[0].observations.every((n) => n === -1));
  const html = renderToStaticMarkup(
    createElement(DewfordPanel, {
      lab: {
        facts: loaded.identity,
        sidRngSettings: loaded.sidRng,
      } as unknown as CurtainLab,
    }),
  );
  assert.match(html, /Dewford evidence is disabled/);
  assert.match(html, /Never changed the phrase or mixed records/);
  assert.match(html, /Re-enable saved Dewford evidence/);
});
