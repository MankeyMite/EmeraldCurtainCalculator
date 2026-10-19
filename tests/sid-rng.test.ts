import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_SID_RNG,
  generateSidRng,
  intersectSidCandidates,
  searchUnknownPidSids,
  sidWindowFromSeconds,
  validateSidRng,
  widenSidRng,
} from "../src/core/sidRng";
import {
  compileHypothesisValidator,
  diagnoseHypothesis,
  makeHypothesis,
  solveSids,
} from "../src/core/sid";
import {
  loadInvestigation,
  newSnapshot,
  saveInvestigation,
  splitFacts,
} from "../src/core/investigation";
import { emptyObservations, type Observations } from "../src/core/constraints";
import { decodePokemon, exampleRecord } from "../src/core/pokemon";

function oracle(tid: number, min: number, max: number) {
  let seed = BigInt(tid);
  const result = new Map<number, number[]>();
  for (let n = 1; n <= max; n++) {
    seed = (seed * 0x41c64e6dn + 0x6073n) & 0xffffffffn;
    if (n < min) continue;
    const sid = Number(seed >> 16n);
    result.set(sid, [...(result.get(sid) ?? []), n]);
  }
  return [...result]
    .map(([sid, advances]) => ({ sid, advances }))
    .sort((a, b) => a.sid - b.sid);
}
function observe(bytes: Uint8Array): Observations {
  const obs = emptyObservations();
  bytes.forEach((b, i) => {
    obs[16 + i * 2] = b & 15 ? 1 : 0;
    obs[17 + i * 2] = b >>> 4 ? 1 : 0;
  });
  return obs;
}
const review = () =>
  loadInvestigation(
    fs.readFileSync(
      "research/fixtures/poochyena-review-investigation.json",
      "utf8",
    ),
  );
const actual = decodePokemon(
  new Uint8Array(fs.readFileSync("research/fixtures/poochyena-test.ek3")),
);

test("TID-seeded SID calls match an independent BigInt oracle, first call and inclusive boundaries", () => {
  assert.deepEqual(generateSidRng(0, { minAdvance: 1, maxAdvance: 1 }), [
    { sid: 0, advances: [1] },
  ]);
  for (const tid of [0, 1, 40492, 65535])
    for (const [minAdvance, maxAdvance] of [
      [1, 250],
      [250, 250],
      [1999, 2050],
    ])
      assert.deepEqual(
        generateSidRng(tid, { minAdvance, maxAdvance }),
        oracle(tid, minAdvance, maxAdvance),
      );
  assert.deepEqual(sidWindowFromSeconds(0, 60), DEFAULT_SID_RNG);
  assert.deepEqual(sidWindowFromSeconds(10, 60), {
    minAdvance: 600,
    maxAdvance: 3600,
  });
  assert.throws(
    () => validateSidRng({ minAdvance: 0, maxAdvance: 3600 }),
    /positive/,
  );
  assert.throws(
    () => validateSidRng({ minAdvance: 10, maxAdvance: 9 }),
    /positive/,
  );
  assert.throws(
    () => validateSidRng({ minAdvance: 1, maxAdvance: 1000001 }),
    /1,000,000/,
  );
  assert.throws(() => generateSidRng(65536, DEFAULT_SID_RNG), /TID/);
  assert.deepEqual(widenSidRng(DEFAULT_SID_RNG), {
    minAdvance: 1,
    maxAdvance: 7200,
  });
  for (const original of [
    { minAdvance: 0xffffffff - 3599, maxAdvance: 0xffffffff },
    { minAdvance: 500000, maxAdvance: 1499998 },
    { minAdvance: 1, maxAdvance: 1000000 },
  ]) {
    const wider = validateSidRng(widenSidRng(original));
    assert.ok(
      wider.minAdvance <= original.minAdvance &&
        wider.maxAdvance >= original.maxAdvance,
      "widening must never remove the old window, even at numeric limits",
    );
  }
});
test("duplicate SID outputs retain every generating advance without inflating distinct candidates", () => {
  const rows = generateSidRng(40492, DEFAULT_SID_RNG);
  assert.equal(rows.length, 3506);
  assert.equal(
    rows.reduce((sum, r) => sum + r.advances.length, 0),
    3600,
  );
  assert.ok(rows.some((r) => r.advances.length > 1));
  assert.deepEqual(rows, oracle(40492, 1, 3600));
  assert.deepEqual(rows.find((r) => r.sid === actual.sid)?.advances, [1736]);
});
test("exact SID intersection retains joint PID/IV hypotheses and can exclude the genuine SID outside the window", () => {
  const inv = review(),
    identity = { ...inv.identity, pid: actual.pid };
  const full = solveSids(identity, inv.snapshots, [actual.pid]);
  assert.equal(full.sidValues.length, 4394);
  const rng = generateSidRng(identity.tid!, DEFAULT_SID_RNG),
    combined = intersectSidCandidates(full, rng);
  const expected = full.sidValues.filter((sid) =>
    rng.some((r) => r.sid === sid),
  );
  assert.equal(expected.length, 237);
  assert.equal(expected.length, 237);
  assert.deepEqual(combined.analysis!.sidValues, expected);
  assert.deepEqual(
    combined.rows.map((r) => r.sid),
    expected,
  );
  assert.ok(expected.includes(actual.sid));
  assert.ok(expected.length < full.sidValues.length);
  const restricted = solveSids(
    identity,
    inv.snapshots,
    [actual.pid],
    undefined,
    Infinity,
    rng.map((r) => r.sid),
  );
  assert.deepEqual(restricted.sidValues, expected);
  const exact = solveSids({ ...identity, sid: actual.sid }, inv.snapshots, [
    actual.pid,
  ]);
  assert.equal(
    intersectSidCandidates(
      exact,
      generateSidRng(identity.tid!, { minAdvance: 1, maxAdvance: 1735 }),
    ).rows.length,
    0,
  );
  assert.equal(
    intersectSidCandidates(
      exact,
      generateSidRng(identity.tid!, { minAdvance: 1736, maxAdvance: 1736 }),
    ).rows[0].sid,
    actual.sid,
  );
  assert.equal(
    intersectSidCandidates(
      exact,
      generateSidRng(identity.tid!, { minAdvance: 1737, maxAdvance: 3600 }),
    ).rows.length,
    0,
  );
  const h = {
    ...makeHypothesis(5, 123, 9),
    rng: { ivs: [1, 2, 3, 4, 5, 6], abilitySlot: 1 },
  };
  assert.deepEqual(
    intersectSidCandidates({ ...full, candidates: [h], sidValues: [9] }, [
      { sid: 9, advances: [3, 7] },
    ]).analysis!.candidates,
    [h],
  );
});
test("unknown-PID SID recovery retains genuine compatibility without promoting a witness to a known PID", () => {
  const inv = review(),
    before = saveInvestigation(inv);
  const result = searchUnknownPidSids(
    inv.identity,
    inv.snapshots,
    generateSidRng(actual.tid, { minAdvance: 1730, maxAdvance: 1740 }),
  );
  assert.ok(result.rows.some((r) => r.sid === actual.sid));
  assert.equal(
    result.pidValues,
    null,
    "a witness is not an exhaustive PID candidate pool",
  );
  for (const row of result.rows)
    if (row.witnessPid !== undefined)
      assert.equal(
        diagnoseHypothesis(
          inv.identity,
          inv.snapshots[0],
          makeHypothesis(row.witnessPid, actual.tid, row.sid),
        ),
        null,
      );
  assert.equal(saveInvestigation(inv), before);
  const impossible = { ...inv.identity, pid: actual.pid, sid: actual.sid };
  assert.deepEqual(
    searchUnknownPidSids(
      impossible,
      inv.snapshots,
      generateSidRng(actual.tid, { minAdvance: 1, maxAdvance: 1 }),
    ).rows,
    [],
  );
});
test("compiled dynamic-PID validation matches the direct solver diagnostics across all 24 orders and conflicting snapshots", () => {
  for (let order = 0; order < 24; order++) {
    const pid = 0x10203040 + order,
      bytes = exampleRecord("pokemon", pid),
      d = decodePokemon(bytes);
    const { identity, mutable } = splitFacts({
      tid: d.tid,
      species: d.species,
      nature: pid % 25,
      heldItem: 0,
      ivs: [31, null, null, null, null, null],
    });
    const snapshot = {
      ...newSnapshot("a", "Original", mutable),
      observations: observe(bytes),
    };
    const fits = compileHypothesisValidator(identity, [snapshot]);
    assert.ok(
      fits(makeHypothesis(pid, d.tid, d.sid)),
      "genuine fixture hypothesis must survive",
    );
    for (const trialPid of [pid, pid + 24, pid ^ 0x10000])
      for (const sid of [d.sid, 0, 1, 65535, d.sid ^ 1]) {
        const h = makeHypothesis(trialPid, d.tid, sid);
        assert.equal(
          fits(h),
          diagnoseHypothesis(identity, snapshot, h) === null,
          `order ${pid % 24}, PID ${trialPid}, SID ${sid}`,
        );
      }
    const bad = {
      ...snapshot,
      id: "bad",
      knownFacts: { ...mutable, heldItem: 999 },
    };
    assert.equal(
      compileHypothesisValidator(identity, [snapshot, bad])(
        makeHypothesis(pid, d.tid, d.sid),
      ),
      false,
    );
  }
});
test("SID RNG configuration round trips as optional evidence scope, disabling it leaves original facts intact", () => {
  const inv = review(),
    original = saveInvestigation(inv);
  const scoped = loadInvestigation(
    saveInvestigation({
      ...inv,
      sidRng: { minAdvance: 600, maxAdvance: 3600 },
    }),
  );
  assert.deepEqual(scoped.sidRng, { minAdvance: 600, maxAdvance: 3600 });
  delete scoped.sidRng;
  assert.equal(saveInvestigation(scoped), original);
  assert.throws(
    () =>
      loadInvestigation(
        JSON.stringify({ ...inv, sidRng: { minAdvance: 0, maxAdvance: 2 } }),
      ),
    /positive/,
  );
});
