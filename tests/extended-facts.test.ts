import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeConstraints } from "../src/core/inference";
import {
  genderForPid,
  genderPidCases,
  speciesTraits,
} from "../src/core/traits";
import { draftToFacts, factsToDraft, freshCatchFacts } from "../src/core/facts";
import {
  compareCandidate,
  emptyObservations,
  observeMemory,
  recordMasks,
  type KnownFacts,
} from "../src/core/constraints";
import { assembleMemory } from "../src/core/memory";
import { decodePokemon, SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import { loadSession, saveSession, validateFacts } from "../src/core/session";
import { testHypothesis } from "../src/core/hypotheses";
import species from "../src/data/species.json";

const unknown = () => Array<number>(160).fill(0xffff);
const exactMasks = (bytes: Uint8Array) =>
  Array.from(
    { length: 160 },
    (_, n) => 1 << ((bytes[n >> 1] >>> ((n % 2) * 4)) & 15),
  );
const whismur = new Uint8Array(
  fs.readFileSync("research/fixtures/whismur-test.ek3"),
);

test("pret species traits cover every species and exact gender thresholds, with disjoint cases", () => {
  assert.equal(species.length, 386);
  assert.equal(speciesTraits(1)!.genderRatio, 31);
  assert.equal(speciesTraits(370)!.genderRatio, 127);
  assert.equal(genderForPid(370, 126), "female");
  assert.equal(genderForPid(370, 127), "male");
  assert.equal(genderForPid(408, 0), "male");
  assert.equal(genderForPid(113, 255), "female");
  assert.equal(genderForPid(81, 127), "genderless");
  assert.deepEqual(
    speciesTraits(298)!.abilities.map((a) => a.id),
    [34, 48],
  );
  for (const s of species)
    for (const gender of ["male", "female", "genderless"] as const) {
      const cases = genderPidCases(s.id, gender);
      for (let low = 0; low < 256; low++) {
        const aliases = cases.filter(
          ([lo, hi]) => lo & (1 << (low & 15)) && hi & (1 << (low >>> 4)),
        ).length;
        assert.equal(aliases, Number(genderForPid(s.id, low) === gender));
      }
    }
});

test("gender counts and byte projections preserve the 0x7F boundary and nature correlation", () => {
  for (const gender of ["male", "female"] as const) {
    const lows = Array.from({ length: 256 }, (_, n) => n).filter((n) =>
      gender === "female" ? n < 127 : n >= 127,
    );
    const result = analyzeConstraints(unknown(), { species: 370, gender });
    assert.equal(result.pidCount, BigInt(lows.length) * (1n << 24n));
    assert.equal(result.headerPairCount, result.pidCount * (1n << 32n));
    assert.deepEqual(result.byteValues[0], lows);
    assert.equal(new Set(result.orders).size, result.orders.length);
    const withNature = analyzeConstraints(unknown(), {
      species: 370,
      gender,
      nature: 7,
    });
    let count = 0n;
    for (const low of lows) {
      const first = (((((7 - low) % 25) + 25) % 25) * 21) % 25; // inverse of 256 modulo 25.
      count += BigInt(Math.floor((0xffffff - first) / 25) + 1);
    }
    assert.equal(withNature.pidCount, count);
  }
  assert.equal(
    analyzeConstraints(unknown(), { species: 408, gender: "male" }).pidCount,
    1n << 32n,
  );
  assert.equal(
    analyzeConstraints(unknown(), { species: 408, gender: "female" })
      .consistent,
    false,
  );
});

test("known IVs/condition/ability retain exact Whismur ciphertext and reject wrong stored facts", () => {
  const p = decodePokemon(whismur);
  const facts: KnownFacts = {
    pid: p.pid,
    tid: p.tid,
    sid: p.sid,
    species: p.species,
    gender: "male",
    ability: 43,
    evs: p.evs,
    ivs: p.ivs,
    contest: p.contest,
    pokerus: p.pokerus,
    markings: p.markings,
    isEgg: Number(p.isEgg),
    heldItem: p.heldItem,
    friendship: p.friendship,
    ppBonuses: p.ppBonuses,
    ribbons: p.ribbons,
  };
  const observed = observeMemory(assembleMemory({ 5: whismur }));
  const result = analyzeConstraints(recordMasks(observed, 5), facts);
  assert.ok(result.consistent);
  for (let byte = 0; byte < 80; byte++)
    assert.ok(
      result.byteValues[byte].includes(whismur[byte]),
      `Retain byte ${byte}`,
    );
  assert.ok(compareCandidate(observed, { 5: whismur }, facts).possible);
  for (const field of ["ivs", "contest", "evs"] as const) {
    const wrong = {
      ...facts,
      [field]: facts[field]!.map((v, i) => (i === 1 ? v! ^ 1 : v)),
    };
    assert.equal(
      analyzeConstraints(exactMasks(whismur), wrong).consistent,
      false,
    );
    assert.ok(
      compareCandidate(observed, { 5: whismur }, wrong).factContradictions
        .length,
    );
  }
  assert.equal(
    analyzeConstraints(exactMasks(whismur), { ...facts, ability: 48 })
      .consistent,
    false,
  );
  assert.equal(
    analyzeConstraints(exactMasks(whismur), { ...facts, gender: "female" })
      .consistent,
    false,
  );
  assert.equal(
    testHypothesis(
      recordMasks(observed, 5),
      { ...facts, pid: undefined },
      { pid: p.pid },
    ).status,
    "invalid",
    "Explicit undefined is rejected by the strict schema",
  );
  const { pid: _, ...known } = facts;
  assert.equal(
    testHypothesis(recordMasks(observed, 5), known, { pid: p.pid }).status,
    "possible",
  );
  assert.equal(
    testHypothesis(recordMasks(observed, 5), known, {
      ivs: [p.ivs[0] ^ 1, null, null, null, null, null],
    }).status,
    "impossible",
  );
});

test("partial IVs constrain only their bits across all 24 orders; stored ability never assumes PID parity", () => {
  for (let pid = 0; pid < 24; pid++) {
    const facts: KnownFacts = {
      pid,
      tid: 0,
      sid: 0,
      species: 298,
      ability: 48,
      ivs: [null, 17, null, 31, null, 0],
      isEgg: 0,
    };
    const r = analyzeConstraints(unknown(), facts);
    assert.ok(
      r.consistent,
      "Early Bird remains possible even with an even PID",
    );
    const expected: (number | null)[] = Array(32).fill(null);
    facts.ivs!.forEach((value, i) => {
      if (value !== null)
        for (let b = 0; b < 5; b++) expected[i * 5 + b] = (value >>> b) & 1;
    });
    expected[30] = 0;
    expected[31] = 1;
    for (let byte = 0; byte < 4; byte++) {
      const values = Array.from({ length: 256 }, (_, n) => n).filter((n) =>
        expected
          .slice(byte * 8, byte * 8 + 8)
          .every((v, b) => v === null || ((n >>> b) & 1) === v),
      );
      assert.deepEqual(r.plaintextByteValues[40 + byte], values);
      const physical = 32 + SUBSTRUCT_POSITIONS[pid % 24][3] * 12 + 4 + byte;
      const keyByte = (pid >>> (byte * 8)) & 255;
      assert.deepEqual(
        r.byteValues[physical],
        values.map((v) => v ^ keyByte).sort((a, b) => a - b),
      );
    }
  }
});

test("new defaults are labeled assumptions, cleared independently, and old sessions acquire no new facts", () => {
  const defaults = freshCatchFacts(),
    draft = factsToDraft(defaults);
  assert.equal(defaults.assumed!.length, 17);
  assert.equal(defaults.ivs, undefined);
  assert.equal(defaults.friendship, undefined);
  assert.equal(defaults.heldItem, undefined);
  const r = analyzeConstraints(unknown(), defaults);
  assert.deepEqual(
    r.plaintextByteValues[8],
    [0],
    "PP Up counters default to zero",
  );
  assert.deepEqual(
    r.plaintextByteValues[47],
    Array.from({ length: 32 }, (_, i) => i * 8),
    "Unused and fateful bits are not invented as zero by ribbon defaults",
  );
  assert.deepEqual(draftToFacts(draft, defaults.assumed), defaults);
  const edited = draftToFacts(
    { ...draft, ev_0: "", iv_1: "31", contest_0: "42" },
    defaults.assumed!.filter((k) => k !== "contest_0"),
  );
  assert.equal(edited.evs![0], null);
  assert.equal(edited.ivs![1], 31);
  assert.equal(edited.contest![0], 42);
  assert.ok(!edited.assumed!.includes("ev_0"));
  const old = loadSession(saveSession(emptyObservations(), { species: 370 }));
  assert.deepEqual(old.knownFacts, { species: 370 });
  assert.throws(
    () => validateFacts({ pokerus: 1, assumed: ["pokerus"] }),
    /active zero/,
  );
  assert.deepEqual(
    loadSession(saveSession(emptyObservations(), defaults)).knownFacts,
    defaults,
  );
  for (const facts of [
    { ivs: [32, null, null, null, null, null] },
    { gender: "unknown" },
    { ability: 43 },
    { pokerus: 256 },
    { isEgg: 2 },
    { assumed: ["pid"] },
  ])
    assert.throws(() => validateFacts(facts));
});

test("joint gender, IV and condition inference matches an independent small exhaustive header oracle", () => {
  // Independent bit masks in logical secure bytes. No engine nibble helper is used.
  for (const actualPid of [124, 127]) {
    const input = unknown();
    for (let i = 2; i < 16; i++) input[i] = 1;
    input[8] = 15; // four possible trainer IDs; 256 * 4 oracle headers.
    const knownMask = Array<number>(48).fill(0),
      knownValue = Array<number>(48).fill(0);
    const set = (at: number, width: number, value: number) => {
      for (let b = 0; b < width; b++) {
        const bit = at + b,
          byte = bit >> 3,
          shift = bit % 8;
        knownMask[byte] |= 1 << shift;
        knownValue[byte] |= ((value >>> b) & 1) << shift;
      }
    };
    set(0, 16, 370);
    set(320 + 5, 5, 17);
    set(320 + 15, 5, 3);
    set(351, 1, 0);
    set(240, 8, 42);
    const facts: KnownFacts = {
      species: 370,
      gender: actualPid === 124 ? "female" : "male",
      ability: 43,
      ivs: [null, 17, null, 3, null, null],
      contest: [42, null, null, null, null, null],
    };
    const positions = SUBSTRUCT_POSITIONS[actualPid % 24];
    for (let logical = 0; logical < 48; logical++) {
      const physical =
        positions[Math.floor(logical / 12)] * 12 + (logical % 12);
      const plain =
        ((logical * 19) & ~knownMask[logical]) | knownValue[logical];
      const cipher = plain ^ (((actualPid ^ 2) >>> ((physical % 4) * 8)) & 255);
      for (let nibble = 0; nibble < 2; nibble++) {
        const at = (32 + physical) * 2 + nibble,
          value = (cipher >>> (nibble * 4)) & 15;
        input[at] = at % 3 === 0 ? 0xffff : value === 0 ? 1 : 0xfffe;
      }
    }
    const headers: [number, number][] = [];
    const byteSets = Array.from({ length: 80 }, () => new Set<number>());
    for (let pid = 0; pid < 256; pid++)
      for (let ot = 0; ot < 4; ot++) {
        if ((pid < 127 ? "female" : "male") !== facts.gender) continue;
        const order = SUBSTRUCT_POSITIONS[pid % 24],
          key = pid ^ ot;
        const domains: number[][] = Array.from({ length: 80 }, () => []);
        for (let b = 0; b < 80; b++) {
          if (b < 8) {
            domains[b] = [((b < 4 ? pid : ot) >>> ((b % 4) * 8)) & 255];
            continue;
          }
          for (let value = 0; value < 256; value++) {
            if (
              !(input[b * 2] & (1 << (value & 15))) ||
              !(input[b * 2 + 1] & (1 << (value >>> 4)))
            )
              continue;
            if (b >= 32) {
              const physical = b - 32,
                logical =
                  order.indexOf(Math.floor(physical / 12)) * 12 +
                  (physical % 12);
              const plain = value ^ ((key >>> ((physical % 4) * 8)) & 255);
              if ((plain & knownMask[logical]) !== knownValue[logical])
                continue;
            }
            domains[b].push(value);
          }
        }
        if (domains.some((d) => d.length === 0)) continue;
        headers.push([pid, ot]);
        domains.forEach((values, b) =>
          values.forEach((v) => byteSets[b].add(v)),
        );
      }
    assert.ok(headers.length > 0);
    const r = analyzeConstraints(input, facts);
    assert.equal(r.headerPairCount, BigInt(headers.length));
    assert.equal(r.pidCount, BigInt(new Set(headers.map(([pid]) => pid)).size));
    for (let byte = 0; byte < 80; byte++)
      assert.deepEqual(
        r.byteValues[byte],
        [...byteSets[byte]].sort((a, b) => a - b),
        `Byte ${byte}, PID ${actualPid}`,
      );
  }
});
