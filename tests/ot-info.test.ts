import test from "node:test";
import assert from "node:assert/strict";
import { encodeOtName, matchesOtName } from "../src/core/names";
import {
  applyFacts,
  emptyObservations,
  compareCandidate,
} from "../src/core/constraints";
import { analyzeConstraints } from "../src/core/inference";
import { validateFacts, saveSession, loadSession } from "../src/core/session";
import { factsToDraft, draftToFacts } from "../src/core/facts";
import {
  exampleRecord,
  SUBSTRUCT_POSITIONS,
  decodePokemon,
} from "../src/core/pokemon";
import { loadResearchExample } from "../src/core/examples";

const all = () => Array<number>(160).fill(0xffff);
test("OT names use Gen 3 text bytes, a bounded EOS and unknown trailing storage", () => {
  assert.deepEqual(encodeOtName("KOBE"), [0xc5, 0xc9, 0xbc, 0xbf, 0xff]);
  assert.deepEqual(encodeOtName("A a0"), [0xbb, 0, 0xd5, 0xa1, 0xff]);
  assert.deepEqual(encodeOtName("e\u0301"), [0x1b, 0xff]);
  assert.deepEqual(encodeOtName("\u2642\u2640'"), [0xb5, 0xb6, 0xb4, 0xff]);
  assert.equal(encodeOtName("ABCDEFG").length, 7);
  for (const name of ["", "ABCDEFGH", "$", "\u{1f600}", "\n"])
    assert.throws(() => encodeOtName(name));
  const input = all(),
    masks = applyFacts(input, { otName: "KOBE" });
  for (const [i, byte] of encodeOtName("KOBE").entries()) {
    assert.equal(masks[(20 + i) * 2], 1 << (byte & 15));
    assert.equal(masks[(20 + i) * 2 + 1], 1 << (byte >>> 4));
  }
  assert.ok(masks.slice(50, 54).every((n) => n === 0xffff));
  assert.ok(masks.slice(0, 40).every((n) => n === 0xffff));
  assert.ok(input.every((n) => n === 0xffff));
  const full = applyFacts(all(), { otName: "ABCDEFG" });
  assert.ok(full.slice(40, 54).every((n) => (n & (n - 1)) === 0));
  assert.equal(full[54], 0xffff);
});

test("OT name and either trainer gender validate and save independently of species", () => {
  for (const otGender of ["male", "female"] as const) {
    const facts = validateFacts({ otName: "KOBE", otGender });
    assert.deepEqual(draftToFacts(factsToDraft(facts)), facts);
    assert.deepEqual(
      loadSession(saveSession(emptyObservations(), facts)).knownFacts,
      facts,
    );
  }
  assert.deepEqual(draftToFacts({ otName: "", otGender: "" }), {});
  assert.deepEqual(draftToFacts({ otName: " A " }), { otName: " A " });
  assert.throws(() => validateFacts({ otGender: "genderless" }));
  assert.throws(() => validateFacts({ otName: 7 }));
  assert.equal(
    loadSession(saveSession(emptyObservations(), {})).knownFacts.otName,
    undefined,
  );
});

test("known OT names participate in inference and candidate checks without inventing padding", () => {
  const record = loadResearchExample("dots").records[5]!;
  assert.ok(matchesOtName(record, "KOBE"));
  const changedTail = record.slice();
  changedTail[25] = 0x12;
  changedTail[26] = 0x34;
  assert.ok(matchesOtName(changedTail, "KOBE"));
  const compared = compareCandidate(
    emptyObservations(),
    { 5: changedTail },
    { otName: "KOBE", otGender: "male" },
  );
  assert.deepEqual(compared.factContradictions, []);
  assert.ok(
    !compareCandidate(emptyObservations(), { 5: record }, { otName: "Kobe" })
      .possible,
  );
  assert.ok(
    !compareCandidate(
      emptyObservations(),
      { 5: record },
      { otGender: "female" },
    ).possible,
  );
  const exactA = all();
  exactA[40] = 1 << 0xb;
  exactA[41] = 1 << 0xb;
  assert.equal(analyzeConstraints(exactA, { otName: "B" }).consistent, false);
  assert.equal(
    analyzeConstraints(all(), { otName: "KOBE" }).pidCount,
    2n ** 32n,
  );
});

test("male and female OT constrain only the correct encrypted bit across all 24 orders", () => {
  for (let pid = 0; pid < 24; pid++) {
    const record = exampleRecord("pokemon", pid);
    const otId = new DataView(record.buffer).getUint32(4, true);
    const facts = { pid, tid: otId & 0xffff, sid: otId >>> 16 };
    const byte = 32 + SUBSTRUCT_POSITIONS[pid % 24][3] * 12 + 3;
    const keyNibble = ((pid ^ otId) >>> 28) & 15;
    for (const otGender of ["male", "female"] as const) {
      const gender = otGender === "female" ? 1 : 0;
      const r = analyzeConstraints(all(), { ...facts, otGender });
      assert.ok(r.consistent);
      assert.deepEqual(r.orders, [pid % 24]);
      let expected = 0;
      for (let value = 0; value < 16; value++)
        if ((value ^ keyNibble) >>> 3 === gender) expected |= 1 << value;
      assert.equal(r.masks[byte * 2 + 1], expected);
      assert.equal(r.plaintextMasks[79], gender ? 0xff00 : 0x00ff);
      assert.equal(r.plaintextMasks[78], 0xffff);
      const independent = record.slice();
      const plainGenderByte = independent[byte] ^ (((pid ^ otId) >>> 24) & 255);
      independent[byte] ^= (plainGenderByte & 128) ^ (gender << 7);
      assert.equal(decodePokemon(independent).otGender, otGender);
      const observed = all();
      observed[byte * 2 + 1] = 1 << (independent[byte] >>> 4);
      assert.ok(
        analyzeConstraints(observed, { ...facts, otGender }).consistent,
      );
      assert.equal(
        analyzeConstraints(observed, {
          ...facts,
          otGender: otGender === "male" ? "female" : "male",
        }).consistent,
        false,
      );
    }
  }
});
