import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  exampleRecord,
  decodePokemon,
  SUBSTRUCT_POSITIONS,
} from "../src/core/pokemon";
import {
  emptyObservations,
  compareCandidate,
  type KnownFacts,
  type Observations,
} from "../src/core/constraints";
import {
  solveSids,
  makeHypothesis,
  projectRecord,
  diagnoseHypothesis,
} from "../src/core/sid";
import {
  itemPixels,
  rankItemExperiments,
  ITEM_CATALOG,
} from "../src/core/experiments";
import {
  loadInvestigation,
  saveInvestigation,
  splitFacts,
  newSnapshot,
  type Snapshot,
} from "../src/core/investigation";
import { saveSession, validateFacts } from "../src/core/session";
import { draftToFacts, factsToDraft } from "../src/core/facts";
import { PROFILE } from "../src/core/memory";
import { knownPlaintext } from "../src/core/inference";

function observe(bytes: Uint8Array): Observations {
  const obs = emptyObservations();
  bytes.forEach((b, i) => {
    obs[16 + i * 2] = b & 15 ? 1 : 0;
    obs[17 + i * 2] = b >>> 4 ? 1 : 0;
  });
  return obs;
}
function changeItem(bytes: Uint8Array, item: number) {
  const b = bytes.slice(),
    v = new DataView(b.buffer),
    d = decodePokemon(b);
  for (let i = 32; i < 80; i += 4)
    v.setUint32(i, v.getUint32(i, true) ^ d.key, true);
  v.setUint16(32 + SUBSTRUCT_POSITIONS[d.pid % 24][0] * 12 + 2, item, true);
  let sum = 0;
  for (let i = 32; i < 80; i += 2) sum = (sum + v.getUint16(i, true)) & 65535;
  v.setUint16(28, sum, true);
  for (let i = 32; i < 80; i += 4)
    v.setUint32(i, v.getUint32(i, true) ^ d.key, true);
  return b;
}
// Independent exhaustive oracle: encrypt only the supplied known bits, enumerate
// all allowed plaintext digits, compare pixels directly. Does not call inference.
function bruteSids(
  pid: number,
  tid: number,
  observations: Observations,
  fields: { logicalByte: number; value: number; mask: number }[],
) {
  const result: number[] = [];
  const order = SUBSTRUCT_POSITIONS[pid % 24];
  for (let sid = 0; sid < 65536; sid++) {
    const otId = ((sid << 16) | tid) >>> 0,
      key = (pid ^ otId) >>> 0;
    let valid = true;
    for (let n = 0; n < 16; n++) {
      const value =
        n < 8 ? (pid >>> (4 * n)) & 15 : (otId >>> (4 * (n - 8))) & 15;
      const pixel = observations[16 + n];
      if (pixel !== -1 && pixel !== (value ? 1 : 0)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    for (const f of fields) {
      const byte =
        32 + order[Math.floor(f.logicalByte / 12)] * 12 + (f.logicalByte % 12);
      for (let side = 0; side < 2; side++) {
        const pixel = observations[16 + byte * 2 + side];
        if (pixel === -1) continue;
        const mask = (f.mask >>> (side * 4)) & 15,
          value = (f.value >>> (side * 4)) & 15;
        const digit = (key >>> ((((byte - 32) % 4) * 2 + side) * 4)) & 15;
        let possible = false;
        for (let plain = 0; plain < 16; plain++)
          if (
            (plain & mask) === (value & mask) &&
            (plain ^ digit ? 1 : 0) === pixel
          )
            possible = true;
        if (!possible) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
    }
    if (valid) result.push(sid);
  }
  return result;
}

test("exact SID enumeration matches independent 65,536-SID oracle for all 24 orders and partial IV bits", () => {
  for (let pid = 0x10203040; pid < 0x10203040 + 24; pid++) {
    const bytes = exampleRecord("pokemon", pid),
      d = decodePokemon(bytes);
    const obs = observe(bytes);
    // Hide checksum for this independent XOR-only comparison.
    obs.fill(-1, 16 + 28 * 2, 16 + 30 * 2);
    const facts: KnownFacts = {
      species: 25,
      heldItem: 0,
      moves: [33, null, null, null],
      ivs: [31, null, null, null, null, null],
    };
    const { identity, mutable } = splitFacts({ ...facts, pid, tid: d.tid });
    const snapshot = {
      ...newSnapshot("a", "First", mutable),
      observations: obs,
    };
    const actual = solveSids(identity, [snapshot], [pid]);
    const oracle = bruteSids(pid, d.tid, obs, [
      { logicalByte: 0, value: 25, mask: 255 },
      { logicalByte: 1, value: 0, mask: 255 },
      { logicalByte: 2, value: 0, mask: 255 },
      { logicalByte: 3, value: 0, mask: 255 },
      { logicalByte: 12, value: 33, mask: 255 },
      { logicalByte: 13, value: 0, mask: 255 },
      { logicalByte: 40, value: 31, mask: 31 },
    ]);
    assert.deepEqual(actual.sidValues, oracle, `PID order ${pid % 24}`);
    assert.ok(actual.sidValues.includes(d.sid));
    assert.ok(
      actual.sidValues.length > 1,
      "ambiguous evidence stays ambiguous",
    );
  }
});

test("independent item snapshots narrow the same SID without intersecting changed ciphertext or checksum", () => {
  const base = exampleRecord("pokemon"),
    d = decodePokemon(base);
  const identity = { pid: d.pid, tid: d.tid, species: d.species };
  const snapshots: Snapshot[] = [];
  let previous = 65536;
  for (const item of [0, 86, 137, 85, 13]) {
    const bytes = changeItem(base, item);
    assert.ok(decodePokemon(bytes).checksumValid);
    const s = {
      ...newSnapshot(String(item), `Item ${item}`, { heldItem: item }),
      observations: observe(bytes),
    };
    snapshots.push(s);
    const result = solveSids(identity, snapshots, [d.pid]);
    assert.ok(result.sidValues.includes(d.sid));
    assert.ok(result.sidValues.length <= previous);
    previous = result.sidValues.length;
    assert.equal(
      diagnoseHypothesis(identity, s, makeHypothesis(d.pid, d.tid, d.sid)),
      null,
    );
  }
  assert.ok(
    previous <
      solveSids(identity, snapshots.slice(0, 1), [d.pid]).sidValues.length,
  );
  assert.equal(decodePokemon(changeItem(base, 86)).pid, d.pid);
  assert.equal(decodePokemon(changeItem(base, 86)).otId, d.otId);
});

test("item ranks and target coordinates agree with real encrypted bytes; inaccessible items excluded", () => {
  const base = exampleRecord("pokemon"),
    d = decodePokemon(base);
  const candidates = Array.from({ length: 256 }, (_, sid) =>
    makeHypothesis(d.pid, d.tid, sid),
  );
  const ranked = rankItemExperiments(candidates, [86, 137, 259, 5]);
  assert.ok(ranked.length >= 2);
  assert.ok(!ranked.some((e) => e.item.id === 259 || e.item.id === 5));
  for (const e of ranked) {
    const groups = new Map<string, number>();
    for (const h of candidates) {
      const bytes = base.slice(),
        v = new DataView(bytes.buffer);
      // Retain the original plaintext, reencrypt under this hypothetical OTID.
      for (let i = 32; i < 80; i += 4)
        v.setUint32(i, v.getUint32(i, true) ^ d.key ^ h.key, true);
      v.setUint32(4, h.otId, true);
      const changed = changeItem(bytes, e.item.id),
        obs = observe(changed);
      const predicted = itemPixels(h, e.item.id);
      predicted.forEach((p) => assert.equal(p.value, obs[p.index]));
      const signature = predicted.map((p) => obs[p.index]).join("");
      groups.set(signature, (groups.get(signature) ?? 0) + 1);
    }
    assert.equal(e.groups, groups.size);
    assert.equal(e.worstCase, Math.max(...groups.values()));
    assert.equal(
      e.expectedRemaining,
      [...groups.values()].reduce((s, n) => s + (n * n) / candidates.length, 0),
    );
  }
  assert.ok(ITEM_CATALOG.find((i) => i.id === 86)?.name.includes("REPEL"));
  assert.ok(ITEM_CATALOG.find((i) => i.id === 137)?.name.includes("ASPEAR"));
  assert.deepEqual(
    rankItemExperiments([
      makeHypothesis(0, d.tid, 0),
      makeHypothesis(6, d.tid, 1),
    ]),
    [],
  );
  const sharedGrowth = rankItemExperiments([
    makeHypothesis(0, d.tid, 0),
    makeHypothesis(1, d.tid, 1),
  ]);
  assert.ok(
    sharedGrowth.length > 0,
    "different PIDs and block orders can share the item's Growth-block position",
  );
});

function completeFacts(bytes: Uint8Array): KnownFacts {
  const d = decodePokemon(bytes),
    v = new DataView(bytes.buffer, bytes.byteOffset);
  const decrypted = bytes.slice(32),
    pv = new DataView(decrypted.buffer);
  for (let i = 0; i < 48; i += 4)
    pv.setUint32(i, pv.getUint32(i, true) ^ d.key, true);
  const p = SUBSTRUCT_POSITIONS[d.pid % 24].map((n) => n * 12);
  return {
    pid: d.pid,
    tid: d.tid,
    sid: d.sid,
    species: d.species,
    heldItem: d.heldItem,
    experience: d.experience,
    ppBonuses: d.ppBonuses,
    friendship: d.friendship,
    growthPadding: pv.getUint16(p[0] + 10, true),
    moves: d.moves,
    pp: Array.from(decrypted.slice(p[1] + 8, p[1] + 12)),
    evs: d.evs,
    contest: d.contest,
    pokerus: d.pokerus,
    metLocation: decrypted[p[3] + 1],
    metLevel: decrypted[p[3] + 2] & 127,
    metGame: (pv.getUint16(p[3] + 2, true) >>> 7) & 15,
    ball: (pv.getUint16(p[3] + 2, true) >>> 11) & 15,
    otGender: d.otGender as "male" | "female",
    ivs: d.ivs,
    isEgg: d.isEgg ? 1 : 0,
    ribbons: d.ribbons,
    ribbonTail: pv.getUint32(p[3] + 8, true) >>> 27,
    ability: 9,
    language: bytes[18],
    headerFlags: bytes[19],
    headerPadding: v.getUint16(30, true),
    markings: bytes[27],
    otName: "LAB",
  };
}

test("full-record supplied-information validation is separate from blind SID inference; checksum is derived", () => {
  const bytes = exampleRecord("pokemon"),
    facts = completeFacts(bytes);
  const { identity, mutable } = splitFacts(facts),
    obs = observe(bytes);
  // Nickname/OT trailing bytes are actually zero or FF: black FF values cannot
  // be guessed. Keep the result partial despite a known secure payload and SID.
  const snapshot = {
    ...newSnapshot("full", "Known payload", mutable),
    observations: obs,
  };
  const result = solveSids(identity, [snapshot], [facts.pid!]);
  assert.deepEqual(result.sidValues, [facts.sid]);
  const projected = projectRecord(identity, snapshot, result.candidates);
  assert.equal(
    projected.record,
    null,
    "unknown header bytes prohibit guessed export",
  );
  assert.deepEqual(projected.bytes.slice(32), Array.from(bytes.slice(32)));
  assert.equal(projected.bytes[28], bytes[28]);
  const wrong = {
    ...snapshot,
    knownFacts: {
      ...mutable,
      checksum: (decodePokemon(bytes).checksum + 1) & 65535,
    },
  };
  assert.equal(solveSids(identity, [wrong], [facts.pid!]).sidValues.length, 0);
});

test("uniquely reconstructable 80-byte records export only checksum-valid originals; unknown-SID inference tested separately", () => {
  const bytes = exampleRecord("pokemon", 0xabcd1234);
  // A synthetic zero header makes genuinely observed transparency sufficient
  // for those bytes. No hidden header bytes are supplied to the solver.
  bytes.fill(0, 8, 18);
  bytes.fill(0, 24, 27);
  const facts = completeFacts(bytes);
  delete facts.sid; // Separate blind SID recovery goal, not known-SID validation.
  const { identity, mutable } = splitFacts(facts);
  const snapshot = {
    ...newSnapshot("exact", "Exact synthetic", mutable),
    observations: observe(bytes),
  };
  const result = solveSids(identity, [snapshot], [facts.pid!]);
  assert.deepEqual(result.sidValues, [decodePokemon(bytes).sid]);
  const projection = projectRecord(identity, snapshot, result.candidates);
  assert.equal(projection.exactByteCount, 80);
  assert.deepEqual(projection.record, bytes);
  const before = snapshot.observations.slice();
  projectRecord(identity, snapshot, result.candidates);
  assert.deepEqual(
    snapshot.observations,
    before,
    "predictions never become evidence",
  );
});

test("partial plaintext checksum DP matches independent enumeration across nibble carries and overflow", () => {
  const base = exampleRecord("pokemon"),
    facts = completeFacts(base);
  // Hide a low and high nibble in the two-byte Growth filler. Construct expected
  // checksums by brute force over all 256 payload alternatives, independently.
  delete facts.growthPadding;
  const { identity, mutable } = splitFacts(facts);
  const obs = emptyObservations(),
    start = 32 + SUBSTRUCT_POSITIONS[facts.pid! % 24][0] * 12 + 10;
  const d = decodePokemon(base);
  const encrypted = [base[start], base[start + 1]];
  // Set two ciphertext observations, leaving the middle digits unknown.
  const secure = start * 2 + 16;
  const k = (d.key >>> (((start - 32) % 4) * 8)) & 65535;
  // For this test constrain only one plaintext value via zero ciphertext digits
  // where it is possible, and compare directly enumerated alternatives.
  obs[secure] = 1;
  obs[secure + 3] = 0;
  const expected = new Set<number>();
  for (let value = 0; value < 65536; value++) {
    const cipher = value ^ k;
    if (!(cipher & 15) || cipher & 0xf000) continue;
    expected.add((d.checksum + value) & 65535);
  }
  for (const checksum of [0, 1, 15, 16, 255, 256, 4095, 65535, d.checksum]) {
    const s = {
      ...newSnapshot("sum", "Partial checksum", { ...mutable, checksum }),
      observations: obs,
    };
    const survived = solveSids(identity, [s], [d.pid]).sidValues.length === 1;
    assert.equal(survived, expected.has(checksum), `checksum ${checksum}`);
  }
  assert.deepEqual([base[start], base[start + 1]], encrypted);
});

test("investigation JSON round-trips identity, snapshots and resources and imports old observations without defaults", () => {
  const old = saveSession(emptyObservations(), {
    species: 25,
    tid: 123,
    heldItem: 86,
  });
  const loaded = loadInvestigation(old);
  assert.equal(loaded.identity.tid, 123);
  assert.equal(loaded.snapshots[0].knownFacts.heldItem, 86);
  assert.equal(loaded.snapshots[0].knownFacts.evs, undefined);
  loaded.ownedItems = [86, 137];
  loaded.snapshots.push({
    ...newSnapshot("b", "After swap", { heldItem: 137 }),
    targets: [104, 105],
    notes: "Only item changed",
  });
  assert.deepEqual(loadInvestigation(saveInvestigation(loaded)), loaded);
  const malformed = structuredClone(loaded);
  malformed.snapshots[1].knownFacts.pid = 5;
  assert.throws(() => loadInvestigation(JSON.stringify(malformed)), /Identity/);
  malformed.snapshots[1].knownFacts = {};
  malformed.snapshots[1].id = malformed.snapshots[0].id;
  assert.throws(
    () => loadInvestigation(JSON.stringify(malformed)),
    /Invalid observation/,
  );
  assert.throws(
    () =>
      loadInvestigation(JSON.stringify({ ...loaded, mappingVersion: "other" })),
    /mapping/,
  );
  assert.equal(loaded.mappingVersion, PROFILE.id);
});

test("all supported mutable facts survive draft and JSON round-trip; packed field boundaries stay partial", () => {
  const facts = validateFacts({
    moves: [33, null, 0, 237],
    pp: [35, null, 0, 15],
    metLevel: 3,
    metGame: 3,
    ball: 4,
  });
  assert.deepEqual(draftToFacts(factsToDraft(facts)), facts);
  const plain = knownPlaintext(facts);
  assert.equal(plain[24], 1 << 1); // Tackle low nibble.
  assert.equal(plain[28], 65535); // Unknown second move.
  assert.throws(() => validateFacts({ pp: [1, 2, 3] }));
  assert.throws(() => validateFacts({ metLevel: 128 }));
});

test("ambiguous PID/SID hypotheses are retained jointly without choosing an earliest candidate", () => {
  const identity = { tid: 40492, species: 286 };
  const snapshot = newSnapshot("ambiguous", "No drawing yet");
  const result = solveSids(identity, [snapshot], [132, 133]);
  assert.equal(result.candidates.length, 131072);
  assert.equal(result.sidValues.length, 65536);
  const projected = projectRecord(identity, snapshot, result.candidates);
  assert.equal(projected.record, null);
  assert.equal(projected.predictions[0], 1); // Both PID low digits are nonzero.
  assert.equal(projected.predictions[12], -1); // Every SID digit remains possible.
  assert.equal(snapshot.observations.filter((n) => n !== -1).length, 0);
});

test("candidate comparison applies new move, PP, met and reserved fields consistently", () => {
  const bytes = exampleRecord("pokemon"),
    p = decodePokemon(bytes);
  assert.equal(p.pp[0], 35);
  assert.equal(p.metLevel, 0);
  // Comparison is imported here to keep its implementation independent of SID.
  const facts = validateFacts({ pp: [34, null, null, null], metLevel: 1 });
  const result = compareCandidate(emptyObservations(), { 5: bytes }, facts);
  assert.equal(result.possible, false);
  assert.ok(result.factContradictions.some((reason) => reason.includes("pp")));
  assert.ok(
    result.factContradictions.some((reason) => reason.includes("metLevel")),
  );
});

test("existing research fixtures retain their genuine SID under blind supplied PID/TID investigations", () => {
  for (const file of [
    "dots-seedot.ek3",
    "skarmory-test.ek3",
    "latios-test-box.ek3",
  ]) {
    const bytes = new Uint8Array(fs.readFileSync(`research/fixtures/${file}`)),
      d = decodePokemon(bytes);
    // Only PID, TID and visible species/item are supplied. Never borrow hidden
    // payload or SID from the fixture into the investigation.
    const identity = { pid: d.pid, tid: d.tid, species: d.species };
    const snapshot = {
      ...newSnapshot(file, file, { heldItem: d.heldItem }),
      observations: observe(bytes),
    };
    assert.ok(
      solveSids(identity, [snapshot], [d.pid]).sidValues.includes(d.sid),
      file,
    );
  }
});
