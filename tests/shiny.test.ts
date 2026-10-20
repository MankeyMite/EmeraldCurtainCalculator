import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConstraints } from "../src/core/inference";
import {
  makeHypothesis,
  solveSids,
  compileHypothesisValidator,
} from "../src/core/sid";
import {
  newSnapshot,
  saveInvestigation,
  loadInvestigation,
  splitFacts,
} from "../src/core/investigation";
import { newPokemonFacts, factsToDraft, draftToFacts } from "../src/core/facts";
import { PROFILE } from "../src/core/memory";
import { saveSession } from "../src/core/session";
import { emptyObservations, compareCandidate } from "../src/core/constraints";
import { exampleRecord, decodePokemon } from "../src/core/pokemon";
import { readAutosave } from "../src/core/autosave";
import { searchUnknownPidSids } from "../src/core/sidRng";
import fs from "node:fs";
import { observeMemory } from "../src/core/constraints";
import { assembleMemory } from "../src/core/memory";

test("genuine fixture candidates survive their observed shiny status", () => {
  for (const name of [
    "skarmory-test.ek3",
    "poochyena-test.ek3",
    "latios-test-box.ek3",
  ]) {
    const bytes = new Uint8Array(fs.readFileSync(`research/fixtures/${name}`)),
      d = decodePokemon(bytes);
    const shiny = (d.tid ^ d.sid ^ (d.pid & 65535) ^ (d.pid >>> 16)) < 8;
    const snapshot = newSnapshot("base", "Fixture", { heldItem: d.heldItem });
    snapshot.observations = observeMemory(assembleMemory({ 5: bytes }));
    const identity = { pid: d.pid, tid: d.tid, species: d.species, shiny };
    assert.equal(
      solveSids(identity, [snapshot], [d.pid], undefined, Infinity, [d.sid])
        .candidates.length,
      1,
      name,
    );
    assert.equal(
      solveSids(
        { ...identity, shiny: !shiny },
        [snapshot],
        [d.pid],
        undefined,
        Infinity,
        [d.sid],
      ).candidates.length,
      0,
      name,
    );
  }
});

test("shiny paired factors retain exact PID nature and order correlations", () => {
  for (const shiny of [true, false]) {
    const pid = 0x12345678,
      tid = 54321;
    const compatible = analyzeConstraints(Array(160).fill(65535), {
      pid,
      tid,
      shiny,
      nature: pid % 25,
    });
    assert.equal(compatible.pidCount, 1n);
    assert.deepEqual(compatible.natures, [pid % 25]);
    assert.deepEqual(compatible.orders, [pid % 24]);
    assert.equal(compatible.headerPairCount, shiny ? 8n : 65528n);
    assert.equal(
      analyzeConstraints(Array(160).fill(65535), {
        pid,
        tid,
        shiny,
        nature: (pid + 1) % 25,
      }).consistent,
      false,
    );
  }
});

test("shiny constrains unknown PID/SID/OT pairs without defaulting to non-shiny", () => {
  const masks = Array(160).fill(65535);
  const yes = analyzeConstraints(masks, { shiny: true }),
    no = analyzeConstraints(masks, { shiny: false });
  assert.equal(yes.pidCount, 1n << 32n);
  assert.equal(yes.headerPairCount, 1n << 51n);
  assert.equal(no.headerPairCount, (1n << 64n) - (1n << 51n));
  assert.equal(no.pidCount, 1n << 32n);
  assert.equal(newPokemonFacts().shiny, undefined);
});

test("paired shiny digit DP matches exhaustive small PID/OT cases and preserves all visible projections", () => {
  for (let order = 0; order < 24; order++)
    for (const shiny of [true, false]) {
      const pid = 24 * 0x101 + order,
        tid = pid & 65535;
      const masks = Array(160).fill(65535);
      for (let n = 0; n < 16; n++)
        masks[n] =
          1 <<
          (((n < 8 ? pid : n < 12 ? tid : 0) >>> ((n < 8 ? n : n - 8) * 4)) &
            15);
      masks[0] |= 1 << ((pid + 1) & 15);
      masks[12] = 0xffff;
      masks[13] = 3;
      const result = analyzeConstraints(masks, { shiny });
      const survivors: { pid: number; sid: number }[] = [];
      for (let p = 0; p < 16; p++)
        if (masks[0] & (1 << p))
          for (let sid = 0; sid < 32; sid++) {
            const value = (pid & ~15) | p,
              key = value ^ tid ^ (sid << 16);
            if (((key & 65535) ^ (key >>> 16)) < 8 === shiny)
              survivors.push({ pid: value, sid });
          }
      assert.equal(result.headerPairCount, BigInt(survivors.length));
      assert.equal(
        result.pidCount,
        BigInt(new Set(survivors.map((h) => h.pid)).size),
      );
      assert.deepEqual(
        result.pidValues,
        [...new Set(survivors.map((h) => h.pid))].sort((a, b) => a - b),
      );
      for (let n = 0; n < 16; n++) {
        const expected = survivors.reduce(
          (m, h) =>
            m |
            (1 <<
              (((n < 8 ? h.pid : n < 12 ? tid : h.sid) >>>
                ((n < 8 ? n : n < 12 ? n - 8 : n - 12) * 4)) &
                15)),
          0,
        );
        assert.equal(result.masks[n], expected, `${order}/${shiny}/${n}`);
      }
    }
});

test("known-PID joint searches, generated IV variants and dynamic unknown-PID validation use the same shiny formula", () => {
  const pid = 0x12345678,
    tid = 43210,
    snapshot = newSnapshot("base", "Base");
  const spreads = [{ pid, ivs: [1, 2, 3, 4, 5, 6], abilitySlot: 0 }] as any;
  for (const shiny of [true, false]) {
    const identity = { tid, shiny },
      expected = Array.from({ length: 65536 }, (_, sid) => sid).filter(
        (sid) => (tid ^ sid ^ (pid & 65535) ^ (pid >>> 16)) < 8 === shiny,
      );
    assert.deepEqual(
      solveSids(identity, [snapshot], [pid]).sidValues,
      expected,
    );
    assert.deepEqual(
      solveSids(identity, [snapshot], [pid], spreads).sidValues,
      expected,
    );
    const fits = compileHypothesisValidator(identity, [snapshot]);
    for (const sid of [expected[0], expected.at(-1)!, 0, 65535])
      assert.equal(fits(makeHypothesis(pid, tid, sid)), expected.includes(sid));
    const result = searchUnknownPidSids(
      { ...identity, pid },
      [snapshot],
      [{ sid: expected[0], advances: [1] }],
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].witnessPid, pid);
  }
  assert.equal(solveSids({ tid }, [snapshot], [pid]).candidates.length, 65536);
});

test("shiny identity round trips through JSON, legacy sessions, drafts, autosave and snapshot changes", () => {
  for (const shiny of [true, false, undefined]) {
    const facts = shiny === undefined ? {} : { shiny };
    assert.deepEqual(draftToFacts(factsToDraft(facts)), facts);
    const inv = {
      format: "emerald-curtain-investigation" as const,
      schemaVersion: 1 as const,
      mappingVersion: PROFILE.id,
      origin: "unknown" as const,
      identity: facts,
      snapshots: [newSnapshot("a", "A"), newSnapshot("b", "B")],
      activeId: "a",
      ownedItems: [],
    };
    const text = saveInvestigation(inv),
      before = structuredClone(inv);
    assert.equal(loadInvestigation(text).identity.shiny, shiny);
    assert.equal(readAutosave({ getItem: () => text })!.identity.shiny, shiny);
    assert.equal(
      loadInvestigation(saveSession(emptyObservations(), facts)).identity.shiny,
      shiny,
    );
    assert.deepEqual(inv, before);
    assert.equal(splitFacts(facts).mutable.shiny, undefined);
  }
  const b = exampleRecord(),
    d = decodePokemon(b),
    shiny = ((d.key & 65535) ^ (d.key >>> 16)) < 8;
  assert.equal(
    compareCandidate(emptyObservations(), { 5: b }, { shiny }).possible,
    true,
  );
  assert.equal(
    compareCandidate(emptyObservations(), { 5: b }, { shiny: !shiny }).possible,
    false,
  );
});
