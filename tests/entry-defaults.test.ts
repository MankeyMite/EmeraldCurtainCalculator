import test from "node:test";
import assert from "node:assert/strict";
import {
  newPokemonFacts,
  freshCapturePreset,
  refreshCaptureDefaults,
  wildStoragePreset,
  factsToDraft,
  draftToFacts,
  speciesNickname,
} from "../src/core/facts";
import { encodeNickname } from "../src/core/names";
import {
  applyFacts,
  emptyObservations,
  observeMemory,
  recordMasks,
  compareCandidate,
} from "../src/core/constraints";
import { assembleMemory } from "../src/core/memory";
import { validateFacts } from "../src/core/session";
import {
  newSnapshot,
  splitFacts,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { PROFILE } from "../src/core/memory";
import { exampleRecord, decodePokemon } from "../src/core/pokemon";
import { solveSids, projectRecord } from "../src/core/sid";

test("new-test defaults are editable, tracked and preserve manual PP/nickname exceptions", () => {
  const initial = validateFacts(newPokemonFacts());
  assert.equal(initial.metGame, 3);
  assert.equal(initial.language, 2);
  assert.equal(initial.headerFlags, 2);
  assert.deepEqual(initial.moves, [0, 0, 0, 0]);
  assert.deepEqual(initial.pp, [0, 0, 0, 0]);
  let next = refreshCaptureDefaults({ ...initial, species: 301 }, "species");
  assert.equal(next.nickname, "NINCADA");
  assert.equal(
    next.friendship,
    undefined,
    "entry defaults alone do not imply fresh-catch friendship",
  );
  next = refreshCaptureDefaults(
    {
      ...next,
      moves: [10, 0, 0, 0],
      assumed: next.assumed!.filter((k) => k !== "move_0"),
    },
    "move_0",
  );
  assert.deepEqual(next.pp, [35, 0, 0, 0]);
  next = refreshCaptureDefaults(
    {
      ...next,
      ppBonuses: 1,
      assumed: next.assumed!.filter((k) => k !== "ppBonuses"),
    },
    "ppBonuses",
  );
  assert.equal(next.pp![0], 42);
  const manual = {
    ...next,
    nickname: "Bug",
    pp: [7, 0, 0, 0],
    assumed: next.assumed!.filter((k) => k !== "nickname" && k !== "pp_0"),
  };
  assert.equal(
    refreshCaptureDefaults({ ...manual, species: 25 }, "species").nickname,
    "Bug",
  );
  assert.equal(
    refreshCaptureDefaults({ ...manual, moves: [33, 0, 0, 0] }, "move_0")
      .pp![0],
    7,
  );
  const egg = refreshCaptureDefaults({ ...initial, isEgg: 1 }, "isEgg");
  assert.equal(egg.headerFlags, 6);
  assert.equal(freshCapturePreset(egg).headerFlags, 2);
  assert.equal(
    freshCapturePreset(next).pp![0],
    35,
    "fresh preset resets assumed PP after clearing PP Ups",
  );
  assert.equal(
    refreshCaptureDefaults({ ...next, language: 1 }, "language").nickname,
    undefined,
  );
  assert.equal(speciesNickname(122), "MR. MIME");
  assert.deepEqual(draftToFacts(factsToDraft(next), next.assumed), next);
  const { identity, mutable } = splitFacts(next),
    snapshot = newSnapshot("s", "Defaulted", next);
  assert.deepEqual(snapshot.knownFacts, mutable);
  const session = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: PROFILE.id,
    origin: "wild" as const,
    identity,
    snapshots: [snapshot],
    activeId: "s",
    ownedItems: [],
  };
  assert.deepEqual(loadInvestigation(saveInvestigation(session)), session);
  assert.deepEqual(
    loadInvestigation(
      saveInvestigation({
        ...session,
        identity: {},
        snapshots: [newSnapshot("s", "Old empty")],
      }),
    ).identity,
    {},
    "imports acquire no defaults",
  );
});

test("nickname encoding fixes only the visible 10-character field and first EOS, never trailing memory", () => {
  assert.deepEqual(
    encodeNickname("NINCADA"),
    [0xc8, 0xc3, 0xc8, 0xbd, 0xbb, 0xbe, 0xbb, 0xff],
  );
  assert.equal(encodeNickname("ABCDEFGHIJ").length, 10);
  assert.throws(() => encodeNickname("ABCDEFGHIJK"), /1 to 10/);
  assert.throws(() => encodeNickname("😀"), /Unsupported/);
  const masks = applyFacts(Array(160).fill(0xffff), { nickname: "NINCADA" });
  assert.equal(masks[30], 1 << 15);
  assert.deepEqual(masks.slice(32, 36), Array(4).fill(0xffff));
  assert.equal(masks[36], 0xffff, "language is separate");
  assert.deepEqual(validateFacts({ nickname: "Bug" }), { nickname: "Bug" });
});

test("Is egg constrains both independent stored Egg bits without fixing unrelated header flags", () => {
  for (const isEgg of [0, 1]) {
    const header = applyFacts(Array(160).fill(0xffff), { isEgg });
    for (let n = 0; n < 16; n++)
      assert.equal(!!(header[38] & (1 << n)), ((n >>> 2) & 1) === isEgg);
    assert.equal(header[39], 0xffff);
  }
  const normal = applyFacts(Array(160).fill(0xffff), {
    isEgg: 0,
    headerFlags: 2,
  });
  assert.equal(normal[38], 1 << 2);
  assert.equal(
    applyFacts(Array(160).fill(0xffff), { isEgg: 1, headerFlags: 2 })[38],
    0,
  );
  const bytes = exampleRecord();
  bytes[19] = 6;
  assert.ok(
    compareCandidate(
      emptyObservations(),
      { 5: bytes },
      { isEgg: 0 },
    ).factContradictions.some((x) => /Header Egg/.test(x)),
  );
});

test("normal-wild storage assumptions close secure data and derive checksum without fabricating nickname trash", () => {
  const bytes = exampleRecord(),
    p = decodePokemon(bytes);
  bytes.set(encodeNickname("NINCADA"), 8);
  bytes[16] = 0x91;
  bytes[17] = 0;
  const facts = wildStoragePreset({
    pid: p.pid,
    tid: p.tid,
    sid: p.sid,
    nickname: "NINCADA",
    species: p.species,
    heldItem: p.heldItem,
    experience: p.experience,
    friendship: p.friendship,
    ppBonuses: p.ppBonuses,
    moves: p.moves,
    pp: p.pp,
    evs: p.evs,
    contest: p.contest,
    pokerus: p.pokerus,
    metLocation: p.metLocation,
    metLevel: p.metLevel,
    metGame: p.metGame,
    ball: p.ball,
    otGender: p.otGender as "male" | "female",
    ivs: p.ivs,
    isEgg: Number(p.isEgg),
    ribbons: p.ribbons,
  });
  const { identity } = splitFacts(facts),
    s = newSnapshot("s", "Synthetic", facts);
  s.observations = observeMemory(assembleMemory({ 5: bytes }));
  const analysis = solveSids(identity, [s], [p.pid]);
  assert.equal(analysis.sidValues.length, 1);
  const result = projectRecord(
    identity,
    s,
    analysis.candidates.map((h) => ({
      ...h,
      rng: { ivs: p.ivs, abilitySlot: p.ability },
    })),
  );
  assert.deepEqual(result.bytes.slice(28, 30), [
    p.checksum & 255,
    p.checksum >>> 8,
  ]);
  assert.equal(result.bytes[16], null);
  assert.equal(
    result.record,
    null,
    "unknown trailing nickname memory blocks exact export",
  );
  assert.equal(result.masks[32], recordMasks(s.observations, 5)[32]);
  const manual = wildStoragePreset({
    growthPadding: 123,
    ribbonTail: 16,
    headerFlags: 6,
    headerPadding: 42,
    isEgg: 1,
  });
  assert.equal(manual.growthPadding, 123);
  assert.equal(manual.ribbonTail, 16);
  assert.equal(manual.headerFlags, 6);
  assert.deepEqual(manual.assumed, []);
});
