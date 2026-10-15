import test from "node:test";
import assert from "node:assert/strict";
import { describeByte } from "../src/core/inspection";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";

test("inspector identifies header fields without a PID and keeps encrypted fields unresolved", () => {
  assert.equal(describeByte(0).name, "PID / personality");
  assert.equal(describeByte(7).name, "Secret trainer ID (SID)");
  assert.equal(describeByte(17).byteInField, 9);
  assert.equal(describeByte(28).name, "Checksum");
  assert.equal(describeByte(0x3c).name, "Encrypted data");
  assert.equal(describeByte(0x3c).encrypted, true);
  assert.throws(() => describeByte(80));
  assert.throws(() => describeByte(32, -1));
});

test("inspector resolves all 24 permutations without mixing ciphertext and plaintext", () => {
  for (let pid = 0; pid < 24; pid++) {
    const [g, a, e, m] = SUBSTRUCT_POSITIONS[pid].map((p) => 32 + p * 12);
    assert.equal(describeByte(g, pid).name, "Species");
    assert.equal(describeByte(g + 1, pid).byteInField, 1);
    assert.equal(describeByte(a + 6, pid).name, "Move 4");
    assert.equal(describeByte(e + 4, pid).name, "Special Attack EV");
    assert.equal(describeByte(e + 5, pid).name, "Special Defense EV");
    assert.equal(describeByte(m + 1, pid).name, "Met location");
    assert.equal(describeByte(m + 7, pid).name, "IVs, egg and ability flags");
    assert.equal(describeByte(m + 7, pid).byteInField, 3);
    for (let offset = 32; offset < 80; offset++)
      assert.match(describeByte(offset, pid).detail, /ciphertext/);
  }
  assert.equal(describeByte(0x3c, 0xa53fefe8).name, "Special Attack EV");
  assert.equal(describeByte(0x45, 0xa53fefe8).name, "Met location");
});
