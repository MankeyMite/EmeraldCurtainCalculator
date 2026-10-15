import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  parseHex,
  parseRecord,
  decodePokemon,
  exampleRecord,
  recordHex,
  fieldAt,
  SUBSTRUCT_POSITIONS,
} from "../src/core/pokemon";
import {
  assembleMemory,
  sourceAt,
  storageOffset,
  PROFILE,
} from "../src/core/memory";
import {
  decodeTile,
  pixelAddress,
  ROOM_PLACEMENTS,
  MAPPING,
  VISIBLE_NIBBLES,
} from "../src/core/tiles";
import {
  emptyObservations,
  allowedMask,
  allowedValues,
  recordMasks,
  applyFacts,
  constraintHex,
  compareCandidate,
  observeMemory,
  summarizeField,
  possibleResidues,
} from "../src/core/constraints";
import { saveSession, loadSession, validateFacts } from "../src/core/session";
import { windowLayout, curtainHit, backgroundColor } from "../src/core/window";
import dots from "../src/data/dots-reference.json";

test("supplied DOTS fixture: trade properties, 20 known rows and mirrored aliases", () => {
  const b = parseRecord(
    new Uint8Array(fs.readFileSync("research/fixtures/dots-seedot.ek3")),
  );
  assert.deepEqual(Array.from(b), dots.bytes);
  const p = decodePokemon(b);
  assert.equal(p.checksumValid, true);
  assert.equal(p.pid, 132);
  assert.equal(p.tid, 38726);
  assert.equal(p.species, 298);
  assert.equal(p.experience, 96);
  assert.deepEqual(p.ivs, [5, 4, 5, 4, 4, 4]);
  assert.deepEqual(p.evs, [0, 0, 0, 0, 0, 0]);
  const m = assembleMemory({ 5: b });
  const rows = [791, 792, 793].flatMap((t) => {
    const pixels = decodeTile(m, t);
    return Array.from({ length: 8 }, (_, y) =>
      pixels
        .slice(y * 8, y * 8 + 8)
        .map((n) => (n === null ? "?" : n === 0 ? "." : "#"))
        .join(""),
    );
  });
  assert.deepEqual(rows, [
    "????????",
    "????????",
    "##......",
    "####....",
    "########",
    "##......",
    "....#.#.",
    "########",
    "##......",
    "####....",
    "####....",
    "#######.",
    "#####.#.",
    "######..",
    "####....",
    "####....",
    "######..",
    "####....",
    "####....",
    "########",
    "########",
    "####....",
    "????????",
    "????????",
  ]);
  const layout = windowLayout("both");
  for (let y = 16; y < 40; y++)
    for (let x = 0; x < 8; x++) {
      const left = curtainHit(layout.placements, 16 + x, y)!;
      assert.equal(
        left.nibble,
        curtainHit(layout.placements, 47 - x, y)!.nibble,
      );
      assert.equal(
        left.nibble,
        curtainHit(layout.placements, 144 + x, y)!.nibble,
      );
      assert.equal(
        left.nibble,
        curtainHit(layout.placements, 175 - x, y)!.nibble,
      );
    }
});
test("window artwork stays separate from observations; frames and panes are not paintable", () => {
  const left = windowLayout("left");
  assert.deepEqual(left.bounds, { x: 16, y: 8, w: 32, h: 32 });
  assert.equal(left.placements.length, 6);
  assert.equal(curtainHit(left.placements, 16, 8), null);
  assert.equal(curtainHit(left.placements, 28, 24), null);
  assert.equal(curtainHit(left.placements, 16, 18)!.offset, 0);
  assert.equal(curtainHit(left.placements, 47, 18)!.offset, 0);
  assert.notEqual(backgroundColor(28, 25), "#ffffff");
  const observation = emptyObservations(),
    hit = curtainHit(left.placements, 16, 18)!;
  observation[hit.nibble] = 1;
  assert.equal(observation[curtainHit(left.placements, 47, 18)!.nibble], 1);
  assert.equal(
    compareCandidate(observation, { 5: Uint8Array.from(dots.bytes) }).matches
      .length,
    1,
  );
});

test("slot 5 editing scope starts at PID, links mirrors and excludes all neighboring nibbles", () => {
  const { placements, bounds } = windowLayout("both");
  const main = new Set<number>();
  for (let y = bounds.y; y < bounds.y + bounds.h; y++)
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const full = curtainHit(placements, x, y);
      const focused = curtainHit(placements, x, y, true);
      if (full?.slot === 5) {
        assert.deepEqual(focused, full);
        main.add(focused!.nibble);
      } else assert.equal(focused, null);
    }
  assert.deepEqual(
    [...main].sort((a, b) => a - b),
    Array.from({ length: 160 }, (_, i) => i + 16),
  );
  assert.equal(curtainHit(placements, 16, 18, true)!.offset, 0);
  assert.equal(curtainHit(placements, 47, 18, true)!.nibble, 16);
  assert.equal(curtainHit(placements, 16, 16, true), null);
  assert.equal(curtainHit(placements, 16, 38, true), null);
  assert.equal(curtainHit(placements, 16, 16)!.slot, 4);
  assert.equal(curtainHit(placements, 16, 38)!.slot, 6);
});

test("80-byte parsing copies and preserves ciphertext, including buffer offsets", () => {
  const b = exampleRecord(),
    original = b.slice(),
    parsed = parseRecord(b);
  assert.deepEqual(parsed, original);
  parsed[0] ^= 255;
  assert.deepEqual(b, original);
  const bigger = new Uint8Array(100);
  bigger.set(b, 10);
  assert.deepEqual(parseRecord(bigger.subarray(10, 90)), b);
  for (const n of [0, 79, 81, 100])
    assert.throws(() => parseRecord(new Uint8Array(n)), /80/);
});
test("hex accepts continuous / whitespace; rejects odd lengths and invalid input", () => {
  const b = exampleRecord("pattern");
  assert.deepEqual(parseHex(recordHex(b)), b);
  assert.deepEqual(parseHex(recordHex(b).replaceAll(" ", "")), b);
  assert.deepEqual(parseHex(recordHex(b).replaceAll(" ", "\n\t")), b);
  for (const s of [
    "",
    "00".repeat(79),
    "0".repeat(159),
    "00".repeat(81),
    "GG".repeat(80),
    "0x" + "00".repeat(79),
  ])
    assert.throws(() => parseHex(s));
});
test("GBA nibble order: 00 FF 01 10 A0 0A; rows and tile boundaries", () => {
  const m = Array<number | null>(96).fill(0);
  m.splice(0, 6, 0x00, 0xff, 0x01, 0x10, 0xa0, 0x0a);
  m[31] = 0x21;
  m[32] = 0x43;
  m[64] = 0x65;
  assert.deepEqual(
    decodeTile(m, 791).slice(0, 12),
    [0, 0, 15, 15, 1, 0, 0, 1, 0, 10, 10, 0],
  );
  assert.deepEqual(decodeTile(m, 791).slice(62), [1, 2]);
  assert.deepEqual(decodeTile(m, 792).slice(0, 2), [3, 4]);
  assert.deepEqual(decodeTile(m, 793).slice(0, 2), [5, 6]);
  assert.deepEqual(pixelAddress(791, 4, 1), {
    tile: 791,
    x: 4,
    y: 1,
    byte: 6,
    side: 0,
    nibble: 12,
    slot: 4,
    offset: 78,
  });
  assert.throws(() => pixelAddress(790, 0, 0));
  assert.throws(() => pixelAddress(791, 8, 0));
});
test("horizontal and vertical flip map to the same canonical nibble", () => {
  const m = Array<number | null>(96).fill(0);
  m[0] = 0x01;
  m[31] = 0xa0;
  assert.equal(decodeTile(m, 791, true)[7], 1);
  assert.equal(decodeTile(m, 791, true)[0], 0);
  assert.equal(decodeTile(m, 791, false, true)[7], 10);
  assert.equal(
    pixelAddress(791, 7, 0, true).nibble,
    pixelAddress(791, 0, 0).nibble,
  );
});
test("storage indexing and documented zero-ASLR region arithmetic", () => {
  assert.equal(storageOffset(1, 1), 4);
  assert.equal(storageOffset(8, 4), 0x4294);
  assert.equal(storageOffset(8, 5), 0x42e4);
  assert.equal(PROFILE.storageBase + storageOffset(8, 4) + 72, PROFILE.start);
  assert.equal(PROFILE.storageBase + storageOffset(8, 5), PROFILE.start + 8);
  assert.equal(PROFILE.storageBase + storageOffset(8, 6) + 7, PROFILE.end);
  for (const pair of [
    [0, 1],
    [15, 1],
    [8, 0],
    [8, 31],
  ])
    assert.throws(() => storageOffset(...(pair as [number, number])));
});
test("96-byte assembly: tail 8 / main 80 / head 8; no fabricated neighbors", () => {
  const a = Uint8Array.from({ length: 80 }, (_, i) => i),
    b = Uint8Array.from({ length: 80 }, (_, i) => i + 80),
    c = new Uint8Array(80).fill(0xff);
  const m = assembleMemory({ 4: a, 5: b, 6: c });
  assert.equal(m.length, 96);
  assert.deepEqual(m.slice(0, 8), Array.from(a.slice(72)));
  assert.deepEqual(m.slice(8, 88), Array.from(b));
  assert.deepEqual(m.slice(88), Array.from(c.slice(0, 8)));
  assert.deepEqual(assembleMemory({ 5: b }).slice(0, 8), Array(8).fill(null));
  assert.deepEqual(assembleMemory({ 5: b }).slice(88), Array(8).fill(null));
  assert.deepEqual(sourceAt(7), { slot: 4, offset: 79 });
  assert.deepEqual(sourceAt(8), { slot: 5, offset: 0 });
  assert.deepEqual(sourceAt(87), { slot: 5, offset: 79 });
  assert.deepEqual(sourceAt(88), { slot: 6, offset: 0 });
  assert.deepEqual(decodeTile(assembleMemory({}), 791), Array(64).fill(null));
});
test("zero / nonzero / unobserved remain distinct constraints", () => {
  assert.deepEqual(allowedValues(allowedMask(0)), [0]);
  assert.deepEqual(
    allowedValues(allowedMask(1)),
    Array.from({ length: 15 }, (_, i) => i + 1),
  );
  assert.equal(allowedValues(allowedMask(-1)).length, 16);
  const o = emptyObservations();
  assert.equal(o.length, 192);
  assert.equal(o.filter((v) => v === -1).length, 192);
  o[16] = 1;
  o[17] = 0;
  o[18] = 1;
  o[19] = 1;
  o[20] = 0;
  o[21] = 0;
  assert.deepEqual(constraintHex(recordMasks(o, 5)).split(" ").slice(0, 4), [
    "0+",
    "++",
    "00",
    "??",
  ]);
  assert.equal(recordMasks(o, 4)[0], 0xffff);
  assert.equal(summarizeField(recordMasks(o, 5), 0, 1).count, 15n);
});
test("candidate comparison works with one pixel and keeps absent neighbors unresolved", () => {
  const b = new Uint8Array(80);
  b[0] = 0x10;
  const o = emptyObservations();
  o[16] = 0;
  assert.equal(compareCandidate(o, { 5: b }).matches.length, 1);
  o[17] = 0;
  assert.deepEqual(compareCandidate(o, { 5: b }).contradictions, [17]);
  o[0] = 1;
  const r = compareCandidate(o, { 5: b });
  assert.equal(r.observed, 3);
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.possible, false);
  const none = compareCandidate(emptyObservations(), { 5: b });
  assert.equal(none.observed, 0);
  assert.equal(none.possible, true);
});
test("known Pokémon -> renderer -> observations -> candidate has no contradictions", () => {
  const b = exampleRecord(),
    m = assembleMemory({ 5: b }),
    observations = observeMemory(m),
    c = compareCandidate(observations, { 5: b });
  assert.equal(c.observed, 160);
  assert.equal(c.matches.length, 160);
  assert.equal(c.contradictions.length, 0);
  assert.equal(c.unresolved.length, 0);
  assert.equal(c.possible, true);
  const changed = b.slice();
  changed[0] = 0;
  assert.ok(
    compareCandidate(observations, { 5: changed }).contradictions.length > 0,
  );
});
test("all three records render and compare 192 unique pixels", () => {
  const records = {
    4: exampleRecord("pattern"),
    5: exampleRecord(),
    6: exampleRecord("pattern"),
  };
  const o = observeMemory(assembleMemory(records));
  assert.equal(compareCandidate(o, records).matches.length, 192);
});
test("Gen 3 decryption / checksum / substructures for every PID % 24", () => {
  for (let pid = 0; pid < 24; pid++) {
    const b = exampleRecord("pokemon", pid),
      before = b.slice(),
      p = decodePokemon(b);
    assert.equal(p.pid, pid);
    assert.equal(p.species, 25);
    assert.equal(p.tid, 0x1234);
    assert.equal(p.sid, 0xabcd);
    assert.deepEqual(p.evs, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(p.moves, [33, 0, 0, 0]);
    assert.deepEqual(p.ivs, [31, 31, 31, 31, 31, 15]);
    assert.equal(p.checksumValid, true);
    assert.deepEqual(b, before);
  }
  const b = exampleRecord();
  b[32] ^= 1;
  assert.equal(decodePokemon(b).checksumValid, false);
  assert.equal(SUBSTRUCT_POSITIONS.length, 24);
  assert.match(fieldAt(19), /Flags/);
  assert.match(fieldAt(32), /Encrypted/);
});
test("checksum-valid fixed independent encrypted fixture (key 0, PID order 0)", () => {
  const b = parseHex(
    "00 00 00 00 00 00 00 00 " +
      "FF ".repeat(10) +
      "02 02 " +
      "FF ".repeat(7) +
      "00 4E 56 00 00 " +
      "19 00 00 00 E8 03 00 00 00 46 00 00 " + // growth: 25 species, 1000 exp, friendship70
      "21 00 00 00 00 00 00 00 23 00 00 00 " + // move33, pp35
      "01 02 03 04 05 06 00 00 00 00 00 00 " + // EVs
      "00 00 00 00 00 00 00 00 00 00 00 00",
  );
  // Literal checksum 0x564E = sum of these 24 little-endian secure words.
  const p = decodePokemon(b);
  assert.equal(p.checksumValid, true);
  assert.equal(p.species, 25);
  assert.deepEqual(p.ivs, [0, 0, 0, 0, 0, 0]);
});
test("observations JSON round trip and strict malformed input rejection", () => {
  const o = emptyObservations();
  o[0] = 0;
  o[191] = 1;
  const facts = { tid: 1234, nature: 3, notes: "A capture" };
  const saved = saveSession(o, facts),
    loaded = loadSession(saved);
  assert.deepEqual(loaded.observations, o);
  assert.deepEqual(loaded.knownFacts, facts);
  assert.ok(!saved.includes("candidate"));
  for (const mutate of [
    (s: any) => (s.mappingVersion = "other"),
    (s: any) => s.observations.pop(),
    (s: any) => (s.observations[0] = null),
    (s: any) => (s.observations[0] = 2),
    (s: any) => (s.knownFacts.tid = -1),
    (s: any) => (s.knownFacts.pid = "123"),
  ]) {
    const s = JSON.parse(saved);
    mutate(s);
    assert.throws(() => loadSession(JSON.stringify(s)));
  }
  assert.throws(() => loadSession("null"));
  assert.throws(() => validateFacts({ nature: 25 }));
});
test("user-supplied header constraints never change observation masks", () => {
  const m = recordMasks(emptyObservations(), 5),
    before = m.slice(),
    c = applyFacts(m, { pid: 0x12345678, tid: 1234 });
  assert.deepEqual(m, before);
  assert.equal(summarizeField(c, 0, 4).exact, 0x12345678n);
  assert.deepEqual(possibleResidues(c, 24), [0x12345678 % 24]);
  assert.deepEqual(possibleResidues(c, 25), [0x12345678 % 25]);
  m[0] = 1;
  assert.equal(applyFacts(m, { pid: 1 })[0], 0);
  assert.equal(summarizeField(applyFacts(m, { pid: 1 }), 0, 4).count, 0n);
  assert.equal(
    compareCandidate(
      emptyObservations(),
      { 5: exampleRecord() },
      { species: 26 },
    ).possible,
    false,
  );
});

// These tests use actual checked-in pret binaries and hand-derived anchors,
// independently of the renderer/solver round trip.
test("pret binary fixture: exact metatile words, palette, layers and map positions", () => {
  const m = fs.readFileSync("research/fixtures/pokemon_school-metatiles.bin"),
    attrs = fs.readFileSync(
      "research/fixtures/pokemon_school-metatile_attributes.bin",
    ),
    map = fs.readFileSync(
      "research/fixtures/RustboroCity_PokemonSchool-map.bin",
    );
  assert.equal(m.readUInt16LE(17 * 16 + 8), 0x8317);
  assert.equal(m.readUInt16LE(17 * 16 + 12), 0x8318);
  assert.equal(m.readUInt16LE(18 * 16 + 10), 0x8717);
  assert.equal(m.readUInt16LE(26 * 16 + 10), 0x8719);
  for (const mid of [17, 18, 25, 26])
    assert.equal(attrs.readUInt16LE(mid * 2) >> 12, 1);
  for (const [x, y, mid] of [
    [1, 1, 17],
    [2, 1, 18],
    [9, 1, 17],
    [10, 1, 18],
    [1, 2, 25],
    [2, 2, 26],
    [9, 2, 25],
    [10, 2, 26],
  ])
    assert.equal(map.readUInt16LE((y * 12 + x) * 2) & 1023, 512 + mid);
  assert.equal(ROOM_PLACEMENTS.length, 12);
  assert.ok(MAPPING.palette8.every((c) => c.every((n) => n === 0)));
  assert.ok(MAPPING.topBackgroundTile0Transparent);
  assert.ok(
    MAPPING.occurrences.every((p) => p.blackUnderlay.every((v) => v === false)),
  );
  assert.equal(VISIBLE_NIBBLES.size, 192);
  assert.equal(
    createHash("sha256").update(m).digest("hex"),
    MAPPING.hashes["data/tilesets/secondary/pokemon_school/metatiles.bin"],
  );
});
test("independent sparse curtain golden pattern: screen anchors and horizontal flips", () => {
  const record = new Uint8Array(80);
  record[0] = 0x01;
  record[1] = 0x10;
  record[24] = 0xa0;
  record[56] = 0x0a;
  const memory = assembleMemory({
      4: new Uint8Array(80),
      5: record,
      6: new Uint8Array(80),
    }),
    screen: string[] = [];
  for (const p of ROOM_PLACEMENTS)
    decodeTile(memory, p.tile, p.hflip, p.vflip).forEach((v, i) => {
      if (v) screen.push(`${p.x + (i % 8)},${p.y + Math.floor(i / 8)}`);
    });
  // Slot5 offsets 0/1 live in tile791 row2, 24 in tile792 row0,
  // 56 in tile793 row0. Right window edges mirror x around 47 / 175.
  const expected = [
    "16,18",
    "19,18",
    "17,24",
    "16,32",
    "47,18",
    "44,18",
    "46,24",
    "47,32",
    "144,18",
    "147,18",
    "145,24",
    "144,32",
    "175,18",
    "172,18",
    "174,24",
    "175,32",
  ];
  assert.deepEqual(screen.sort(), expected.sort());
  assert.equal(ROOM_PLACEMENTS.filter((p) => p.hflip).length, 6);
  for (const p of ROOM_PLACEMENTS.filter((p) => p.tile === 791))
    assert.equal(pixelAddress(p.tile, p.hflip ? 7 : 0, 2, p.hflip).offset, 0);
});
