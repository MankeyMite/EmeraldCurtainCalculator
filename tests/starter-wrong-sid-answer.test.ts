import test from "node:test";
import assert from "node:assert/strict";
import saved from "./fixtures/starter-wrong-sid-answer.json";
import { solveSids } from "../src/core/sid";
import { generateSidRng } from "../src/core/sidRng";
import { isEvidence } from "../src/core/itemTests";
import type { Snapshot } from "../src/core/investigation";
import { curtainLocation } from "../src/components/SidPixelQuestion";
import { validateFacts } from "../src/core/session";

test("the saved Torchic's final Black answer excludes its true SID; correcting only that answer recovers it", () => {
  const pk3 = Buffer.from(saved.actualPk3Hex, "hex");
  const pid = pk3.readUInt32LE(0),
    tid = pk3.readUInt16LE(4),
    sid = pk3.readUInt16LE(6);
  assert.equal(pid, 0x882ef4af);
  assert.equal(tid, 48734);
  assert.equal(sid, 49423);
  // PKHeX's .pk3 is decrypted in canonical G/A/E/M order.
  let sum = 0;
  for (let i = 32; i < 80; i += 2) sum = (sum + pk3.readUInt16LE(i)) & 65535;
  assert.equal(sum, pk3.readUInt16LE(28));
  assert.equal(pk3.readUInt16LE(48), 52); // Ember in slot 3 before swapping.
  assert.equal(pk3[54], 25); // Ember full PP follows it into slot 4.
  const key = (pid ^ pk3.readUInt32LE(4)) >>> 0;
  // This PID stores Attacks first. Slot 4 PP is physical record byte 43.
  const ciphertext = 25 ^ (key >>> 24);
  assert.equal(ciphertext, 0x50);
  assert.equal(ciphertext & 15, 0, "low nibble must render Transparent");
  assert.equal(curtainLocation(102), "row 11, column 7");
  assert.notEqual(
    (30 ^ (key >>> 24)) & 15,
    0,
    "without the swap this pixel is Black",
  );

  const rows = generateSidRng(tid, saved.sidRng);
  assert.deepEqual(rows.find((r) => r.sid === sid)?.advances, [1246]);
  const candidates = rows.map((r) => r.sid);
  const snapshots = structuredClone(saved.snapshots) as Snapshot[];
  const solve = (ss: Snapshot[]) =>
    solveSids(
      validateFacts(saved.identity),
      ss.filter(isEvidence),
      [pid],
      undefined,
      Infinity,
      candidates,
    ).sidValues;
  assert.deepEqual(solve(snapshots.slice(0, 2)), [17412, 21263, 49423]);
  assert.deepEqual(solve(snapshots.slice(0, 3)), [21263, 49423]);
  assert.deepEqual(solve(snapshots), [21263]);
  assert.equal(snapshots[3].observations[102], 1);
  snapshots[3].observations[102] = 0;
  assert.deepEqual(solve(snapshots), [49423]);
});
