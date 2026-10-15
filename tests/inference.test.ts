import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  analyzeConstraints,
  fieldPossibilities,
  ivPossibilities,
} from "../src/core/inference";
import {
  allowedValues,
  applyFacts,
  recordMasks,
  emptyObservations,
  compareCandidate,
  type KnownFacts,
} from "../src/core/constraints";
import {
  SUBSTRUCT_POSITIONS,
  exampleRecord,
  decodePokemon,
} from "../src/core/pokemon";
import { loadSession, saveSession, validateFacts } from "../src/core/session";
import species from "../src/data/species.json";

test("unknown pixels never create a guessed digit; nature DP gives exact PID count", () => {
  const masks = recordMasks(emptyObservations(), 5),
    r = analyzeConstraints(masks);
  assert.equal(r.pidCount, 1n << 32n);
  assert.equal(r.headerPairCount, 1n << 64n);
  assert.ok(r.masks.every((m) => m === 0xffff));
  assert.ok(r.plaintextMasks.every((m) => m === 0xffff));
  for (const nature of [0, 7, 24]) {
    const a = analyzeConstraints(masks, { nature });
    const count = BigInt(Math.floor((0xffffffff - nature) / 25) + 1);
    assert.equal(a.pidCount, count);
    assert.equal(a.headerPairCount, count * (1n << 32n));
    assert.deepEqual(a.natures, [nature]);
  }
});
test("known species and partial EVs encrypt exact bytes with an exact supplied header", () => {
  const masks = recordMasks(emptyObservations(), 5),
    before = masks.slice();
  const pid = 0x12345678,
    tid = 0x1234,
    sid = 0xabcd,
    key = (pid ^ ((sid << 16) | tid)) >>> 0;
  const r = analyzeConstraints(masks, {
    pid,
    tid,
    sid,
    species: 408,
    evs: [null, 0, null, null, 255, null],
  });
  assert.ok(r.consistent);
  assert.equal(r.pidCount, 1n);
  assert.equal(r.headerPairCount, 1n);
  const positions = SUBSTRUCT_POSITIONS[pid % 24],
    g = 32 + positions[0] * 12,
    e = 32 + positions[2] * 12;
  const expected = new Map([
    [g, (408 & 255) ^ (key & 255)],
    [g + 1, (408 >>> 8) ^ ((key >>> 8) & 255)],
    [e + 1, (key >>> 8) & 255],
    [e + 4, 255 ^ (key & 255)],
  ]);
  for (const [offset, value] of expected)
    assert.deepEqual(r.byteValues[offset], [value]);
  assert.equal(r.byteValues[e].length, 256, "Blank EV does not become zero");
  assert.equal(r.plaintextByteValues[25].length, 1);
  assert.equal(r.plaintextByteValues[25][0], 0);
  assert.equal(r.plaintextByteValues[28][0], 255);
  assert.deepEqual(masks, before);
});
test("inference matches a small exhaustive independent PID/OT oracle, including joint projections", () => {
  // Enumerate at most 128 headers in the oracle, not the engine. Ciphertext
  // domains include zero/nonzero/unknown; known plaintext is independently
  // checked against candidate keys and permutations.
  let sawMultipleHeaders = false;
  for (let seed = 0; seed < 8; seed++) {
    const input = Array(160).fill(0xffff);
    for (let n = 0; n < 16; n++) input[n] = 1;
    input[0] = 0xffff;
    input[1] = 3;
    input[8] = 15;
    const actualPid = seed * 3 + 1,
      actualOt = seed % 4,
      actualKey = actualPid ^ actualOt;
    const facts: KnownFacts = {
      species: seed * 19,
      evs: [seed, null, null, null, seed + 1, null],
      ...(seed % 2 ? { nature: actualPid % 25 } : {}),
    };
    const expectedHeaders: { p: number; q: number }[] = [];
    const byteSets = Array.from({ length: 80 }, () => new Set<number>()),
      plainSets = Array.from({ length: 48 }, () => new Set<number>());
    const plainKnown = Array<number | null>(48).fill(null);
    plainKnown[0] = facts.species! & 255;
    plainKnown[1] = facts.species! >>> 8;
    plainKnown[24] = seed;
    plainKnown[28] = seed + 1;
    const actualPositions = SUBSTRUCT_POSITIONS[actualPid % 24];
    const cipher = Array.from(
      { length: 48 },
      (_, i) => (i * 13 + seed * 17) & 255,
    );
    plainKnown.forEach((value, logical) => {
      if (value !== null) {
        const physical =
          actualPositions[Math.floor(logical / 12)] * 12 + (logical % 12);
        cipher[physical] = value ^ ((actualKey >>> ((physical % 4) * 8)) & 255);
      }
    });
    for (let n = 64; n < 160; n++) {
      const value = (cipher[(n - 64) >> 1] >> ((n % 2) * 4)) & 15;
      input[n] = (n + seed) % 3 === 0 ? 0xffff : value === 0 ? 1 : 0xfffe;
    }
    for (let p = 0; p < 32; p++)
      for (let q = 0; q < 4; q++) {
        if (facts.nature !== undefined && p % 25 !== facts.nature) continue;
        const positions = SUBSTRUCT_POSITIONS[p % 24],
          key = (p ^ q) >>> 0;
        let possible = true;
        for (let byte = 0; byte < 48; byte++) {
          const known = plainKnown[byte];
          if (known === null) continue;
          const physical =
            positions[Math.floor(byte / 12)] * 12 + (byte % 12) + 32;
          const cipher = known ^ ((key >>> ((physical % 4) * 8)) & 255);
          if (
            !(input[physical * 2] & (1 << (cipher & 15))) ||
            !(input[physical * 2 + 1] & (1 << (cipher >>> 4)))
          )
            possible = false;
        }
        if (!possible) continue;
        expectedHeaders.push({ p, q });
        for (let i = 0; i < 4; i++) {
          byteSets[i].add((p >>> (i * 8)) & 255);
          byteSets[i + 4].add((q >>> (i * 8)) & 255);
        }
        for (let byte = 8; byte < 32; byte++)
          for (let value = 0; value < 256; value++)
            if (
              input[byte * 2] & (1 << (value & 15)) &&
              input[byte * 2 + 1] & (1 << (value >>> 4))
            )
              byteSets[byte].add(value);
        for (let byte = 0; byte < 48; byte++) {
          const physical =
              positions[Math.floor(byte / 12)] * 12 + (byte % 12) + 32,
            known = plainKnown[byte];
          for (let cipher = 0; cipher < 256; cipher++) {
            if (
              !(input[physical * 2] & (1 << (cipher & 15))) ||
              !(input[physical * 2 + 1] & (1 << (cipher >>> 4)))
            )
              continue;
            const decrypted = cipher ^ ((key >>> ((physical % 4) * 8)) & 255);
            if (known !== null && decrypted !== known) continue;
            byteSets[physical].add(cipher);
            plainSets[byte].add(decrypted);
          }
        }
      }
    const r = analyzeConstraints(input, facts);
    assert.ok(
      expectedHeaders.length > 0,
      "Oracle case retains its constructing header",
    );
    if (expectedHeaders.length > 1) sawMultipleHeaders = true;
    assert.equal(r.headerPairCount, BigInt(expectedHeaders.length));
    assert.equal(
      r.pidCount,
      BigInt(new Set(expectedHeaders.map((h) => h.p)).size),
    );
    assert.deepEqual(
      r.pidValues,
      [...new Set(expectedHeaders.map((h) => h.p))].sort((a, b) => a - b),
    );
    assert.equal(r.consistent, expectedHeaders.length > 0);
    for (let i = 0; i < 80; i++)
      assert.deepEqual(
        r.byteValues[i],
        [...byteSets[i]].sort((a, b) => a - b),
      );
    for (let i = 0; i < 48; i++)
      assert.deepEqual(
        r.plaintextByteValues[i],
        [...plainSets[i]].sort((a, b) => a - b),
      );
  }
  assert.ok(
    sawMultipleHeaders,
    "Oracle exercised correlations across multiple possible headers",
  );
});
test("guaranteed digits and plaintext domains retain actual DOTS/Latios under progressive facts", () => {
  for (const reference of ["emulator-ss8", "emulator-latios-ss9"]) {
    const b = new Uint8Array(
        fs.readFileSync(`research/fixtures/${reference}/slot5.ek3`),
      ),
      p = decodePokemon(b);
    const observations = loadSession(
      fs.readFileSync(
        `research/fixtures/${reference}/observations.json`,
        "utf8",
      ),
    ).observations;
    const masks = recordMasks(observations, 5);
    let previous: ReturnType<typeof analyzeConstraints> | null = null;
    for (const facts of [
      {},
      { species: p.species },
      { species: p.species, evs: p.evs },
      {
        species: p.species,
        evs: p.evs,
        tid: p.tid,
        sid: p.sid,
        nature: p.nature,
      },
    ]) {
      const r = analyzeConstraints(masks, facts);
      assert.ok(r.consistent);
      for (let n = 0; n < 160; n++)
        assert.ok(
          r.masks[n] & (1 << ((b[n >> 1] >> ((n % 2) * 4)) & 15)),
          "Actual record retained",
        );
      if (previous) {
        assert.ok(r.pidCount <= previous.pidCount);
        assert.ok(r.headerPairCount <= previous.headerPairCount);
        r.masks.forEach((m, n) => assert.equal(m & previous!.masks[n], m));
      }
      const positions = SUBSTRUCT_POSITIONS[p.pid % 24];
      for (let logical = 0; logical < 48; logical++) {
        const physical =
          32 + positions[Math.floor(logical / 12)] * 12 + (logical % 12);
        const value = b[physical] ^ ((p.key >>> ((physical % 4) * 8)) & 255);
        assert.ok(r.plaintextByteValues[logical].includes(value));
      }
      p.ivs.forEach((iv, i) => assert.ok(ivPossibilities(r, i).includes(iv)));
      previous = r;
    }
  }
});
test("conflicting facts produce no reconstruction; no legality defaults are silently added", () => {
  const b = exampleRecord("pokemon", 17),
    exact = Array.from(
      { length: 160 },
      (_, n) => 1 << ((b[n >> 1] >> ((n % 2) * 4)) & 15),
    );
  for (const facts of [
    { species: 26 },
    { nature: 18 },
    { evs: [2, null, null, null, null, null] },
  ]) {
    const r = analyzeConstraints(exact, facts);
    assert.equal(r.consistent, false);
    assert.equal(r.pidCount, 0n);
    assert.ok(r.masks.every((m) => m === 0));
  }
  assert.ok(
    analyzeConstraints(exact, { species: 25, evs: [1, 2, 3, 4, 5, 6] })
      .consistent,
  );
  const masks = recordMasks(emptyObservations(), 5);
  assert.ok(
    analyzeConstraints(masks, {
      species: 65535,
      evs: [255, 255, 255, 255, 255, 255],
    }).consistent,
    "No unrequested legality/EV-total filter",
  );
});
test("byte counts are exact while correlated multi-byte products are marked as bounds", () => {
  const r = analyzeConstraints(recordMasks(emptyObservations(), 5), {
    species: 408,
  });
  assert.equal(
    fieldPossibilities(r.plaintextMasks, r.plaintextByteValues, 24, 1)
      .countExact,
    true,
  );
  assert.equal(
    fieldPossibilities(r.plaintextMasks, r.plaintextByteValues, 4, 4)
      .countExact,
    false,
  );
  const species = fieldPossibilities(
    r.plaintextMasks,
    r.plaintextByteValues,
    0,
    2,
  );
  assert.equal(species.exact, 408n);
  assert.equal(species.count, 1n);
  assert.ok(species.countExact);
});
test("partial EV facts round-trip as null/zero, validate bounds and filter candidates", () => {
  const facts = { evs: [null, 0, 255, null, null, 1] };
  const s = loadSession(saveSession(emptyObservations(), facts));
  assert.deepEqual(s.knownFacts, facts);
  for (const evs of [
    [],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 256],
    [0, 0, 0, 0, 0, "0"],
    [0, 0, 0, 0, 0, -1],
  ])
    assert.throws(() => validateFacts({ evs }));
  const candidate = exampleRecord();
  assert.ok(
    compareCandidate(
      emptyObservations(),
      { 5: candidate },
      { evs: [1, null, null, null, null, null] },
    ).possible,
  );
  assert.equal(
    compareCandidate(
      emptyObservations(),
      { 5: candidate },
      { evs: [0, null, null, null, null, null] },
    ).possible,
    false,
  );
});
test("source-derived species names use original internal IDs", () => {
  assert.equal(species.length, 386);
  assert.equal(new Set(species.map((s) => s.id)).size, 386);
  assert.equal(species.find((s) => s.name === "Latios")!.id, 408);
  assert.equal(species.find((s) => s.name === "Seedot")!.id, 298);
});
test("real research fixtures have deterministic remaining counts without borrowed candidate PIDs", () => {
  const dots = recordMasks(
    loadSession(
      fs.readFileSync(
        "research/fixtures/emulator-ss8/observations.json",
        "utf8",
      ),
    ).observations,
    5,
  );
  assert.equal(
    analyzeConstraints(dots, { species: 298, evs: [0, 0, 0, 0, 0, 0] })
      .pidCount,
    110n,
  );
  assert.equal(
    analyzeConstraints(dots, {
      species: 298,
      evs: [0, 0, 0, 0, 0, 0],
      tid: 38726,
    }).pidCount,
    84n,
  );
  const five = analyzeConstraints(dots, {
    species: 298,
    evs: [0, 0, 0, 0, 0, 0],
    tid: 38726,
    nature: 7,
  });
  assert.equal(five.pidCount, 5n);
  assert.deepEqual(five.pidValues, [57, 132, 157, 207, 232]);
  const exported = loadSession(
    fs.readFileSync("research/fixtures/solver-example-dots.json", "utf8"),
  );
  assert.deepEqual(exported.knownFacts.evs, [0, 0, 0, 0, 0, 0]);
  assert.equal(
    exported.knownFacts.pid,
    undefined,
    "Browser export does not borrow the candidate PID",
  );
  assert.equal(
    analyzeConstraints(
      recordMasks(exported.observations, 5),
      exported.knownFacts,
    ).pidCount,
    5n,
  );
  const latios = recordMasks(
    loadSession(
      fs.readFileSync(
        "research/fixtures/emulator-latios-ss9/observations.json",
        "utf8",
      ),
    ).observations,
    5,
  );
  const result = analyzeConstraints(latios, {
    species: 408,
    evs: [30, 8, 4, 90, 32, 2],
    tid: 27292,
    sid: 18230,
    nature: 22,
  });
  assert.equal(result.pidCount, 5703n);
  assert.deepEqual(result.orders, [12]);
  assert.equal(summarize(result), "??3?6??C");
  function summarize(r: ReturnType<typeof analyzeConstraints>) {
    return Array.from({ length: 8 }, (_, i) => r.masks[7 - i])
      .map((m) => {
        const values = allowedValues(m);
        return values.length === 1 ? values[0].toString(16).toUpperCase() : "?";
      })
      .join("");
  }
});
