import test from "node:test";
import { newSpindaJourney } from "../src/core/spindaJourney";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { inflateSync } from "node:zlib";
import { pngChunks } from "../scripts/capture-lib.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SPINDA_ASSETS,
  SPINDA_SPECIES,
  renderSpinda,
  spindaPattern,
  spindaPositions,
  moveSpindaSpot,
  patternSimilarity,
  SPINDA_REGION,
} from "../src/core/spinda";
import {
  defaultSpindaMatcher,
  validateSpindaMatcher,
  generateSpindaCandidates,
  prepareSpindaCandidates,
  rankSpindaCandidates,
} from "../src/core/spindaMatcher";
import { scanWildSpreads, MAX_RNG_SPREADS } from "../src/core/rng";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { PROFILE } from "../src/core/memory";
import { readAutosave, AUTOSAVE_KEY } from "../src/core/autosave";
import { SpindaMatcher } from "../src/components/SpindaMatcher";
import type { CurtainLab } from "../src/hooks/useCurtainLab";
import { newSpindaSidGuide } from "../src/core/spindaSidGuide";
import {
  createSpindaWorkerHandler,
  type SpindaWorkerResponse,
} from "../src/core/spindaWorker";

// Independent packed-4bpp oracle following pret's DRAW_SPINDA_SPOTS macro.
// Masks are literal u16 output of gbagfx -plain -data_width 2, not the app's
// row-major renderer. GBA tile-byte addressing detects orientation mistakes.
// The base image is decoded independently from the original battle-sheet PNG
// fixture rather than taking the application's template as reference truth.
const battlePng = fs.readFileSync("research/fixtures/spinda-battle-front.png");
const battleChunks = pngChunks(battlePng);
const battlePacked = inflateSync(
  Buffer.concat(
    battleChunks
      .filter((c: { type: string }) => c.type === "IDAT")
      .map((c: { data: Buffer }) => c.data),
  ),
);
const referenceBasePixels = Uint8Array.from({ length: 4096 }, (_, n) => {
  const row = Math.floor(n / 64),
    x = n % 64;
  assert.equal(
    battlePacked[row * 33],
    0,
    "canonical PNG scanlines use filter 0",
  );
  return (
    (battlePacked[row * 33 + 1 + Math.floor(x / 2)] >>> (x % 2 ? 0 : 4)) & 15
  );
});
const referenceSpots = [
  {
    x: 16,
    y: 7,
    rows: [
      112, 508, 1022, 2046, 2047, 4095, 4095, 4095, 2046, 2046, 1020, 480, 0, 0,
      0, 0,
    ],
  },
  {
    x: 40,
    y: 8,
    rows: [
      480, 1016, 2044, 4094, 4094, 8191, 8191, 8191, 4094, 4094, 2044, 2040,
      224, 0, 0, 0,
    ],
  },
  {
    x: 22,
    y: 25,
    rows: [28, 62, 127, 127, 127, 127, 127, 62, 28, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    x: 34,
    y: 26,
    rows: [60, 126, 255, 255, 255, 255, 255, 126, 60, 0, 0, 0, 0, 0, 0, 0],
  },
];
function emeraldReference(pid: number) {
  const packed = new Uint8Array(0x4000); // Allow the macro's off-frame writes.
  const address = (x: number, y: number) =>
    Math.floor(x / 8) * 32 +
    Math.floor((x % 8) / 2) +
    Math.floor(y / 8) * 256 +
    (y % 8) * 4;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      packed[address(x, y)] |= referenceBasePixels[y * 64 + x] << ((x & 1) * 4);
  for (const s of referenceSpots) {
    const x = (s.x + (pid & 15) - 8) & 255;
    let y = (s.y + ((pid & 240) >>> 4) - 8) & 255;
    for (let r = 0; r < 16; r++, y = (y + 1) & 255) {
      let bits = s.rows[r];
      for (let column = x; column < x + 16; column++, bits >>= 1)
        if (bits & 1) {
          const at = address(column, y),
            shift = (column & 1) * 4,
            color = (packed[at] >>> shift) & 15;
          if (color >= 1 && color <= 3) packed[at] += 4 << shift;
        }
    }
    pid >>>= 8;
  }
  return Uint8Array.from(
    { length: 4096 },
    (_, n) =>
      (packed[address(n % 64, Math.floor(n / 64))] >>> ((n & 1) * 4)) & 15,
  );
}

test("Emerald Spinda assets and rendering match the packed GBA macro, including all spot bytes and wrapped Y", () => {
  assert.equal(
    SPINDA_ASSETS.revision,
    "731ad5bfd6e6f265508d0efcca0ba42f9dcf5881",
  );
  assert.deepEqual(SPINDA_ASSETS.spots, referenceSpots);
  for (const pid of [
    0, 0xffffffff, 0x87654321, 0x88888888, 0xffd00f00, 0x10203040,
  ])
    assert.deepEqual(
      renderSpinda(pid),
      emeraldReference(pid),
      pid.toString(16),
    );
  for (let b = 0; b < 256; b++)
    for (let spot = 0; spot < 4; spot++) {
      const pid =
        ((0x88888888 & ~(255 << (spot * 8))) | (b << (spot * 8))) >>> 0;
      assert.deepEqual(renderSpinda(pid), emeraldReference(pid));
    }
});

test("Spinda uses battle animation frame zero so maximum-Y spots reach the lower face", () => {
  assert.equal(SPINDA_ASSETS.frontAsset, "anim_front.png");
  assert.equal(SPINDA_ASSETS.frontFrame, 0);
  assert.equal(
    SPINDA_ASSETS.hashes["anim_front.png"],
    createHash("sha256").update(battlePng).digest("hex"),
  );
  assert.deepEqual(Uint8Array.from(SPINDA_ASSETS.pixels), referenceBasePixels);
  // User-reported maximum-down positions: spot bytes FA / F3 / FD / F7.
  const pid = 0xf7fdf3fa;
  assert.deepEqual(renderSpinda(pid), emeraldReference(pid));
  const pattern = spindaPattern(pid);
  assert.ok(
    pattern.some((value, n) => value && Math.floor(n / 64) >= 39),
    "face spots reach below the eye line at the legal Y=F limit",
  );
});

test("each PID byte controls exactly one spot; dragging snaps and clamps each nibble independently", () => {
  const initial = 0x87654321,
    positions = spindaPositions(initial);
  assert.deepEqual(positions, [
    { x: 9, y: 1 },
    { x: 35, y: 4 },
    { x: 19, y: 23 },
    { x: 33, y: 26 },
  ]);
  for (let i = 0; i < 4; i++) {
    const p = positions[i],
      right = moveSpindaSpot(initial, i, p.x + 0.6, p.y),
      down = moveSpindaSpot(initial, i, p.x, p.y + 1);
    assert.equal((right >>> (i * 8)) & 255, ((initial >>> (i * 8)) & 255) + 1);
    assert.equal((down >>> (i * 8)) & 255, ((initial >>> (i * 8)) & 255) + 16);
    for (let j = 0; j < 4; j++)
      if (j !== i) assert.deepEqual(spindaPositions(right)[j], positions[j]);
    assert.equal(moveSpindaSpot(initial, i, p.x + 0.49, p.y), initial);
    assert.equal((moveSpindaSpot(initial, i, -100, -100) >>> (i * 8)) & 255, 0);
    assert.equal(
      (moveSpindaSpot(initial, i, 1000, 1000) >>> (i * 8)) & 255,
      255,
    );
  }
  assert.throws(() => renderSpinda(-1), /32-bit/);
});

test("Spinda spots clip to body colors, preserve fixed markings and overlaps never recolor twice", () => {
  let sawOverlap = false;
  for (const pid of [
    0x808f8888,
    ...Array.from({ length: 256 }, (_, b) => (b * 0x01010101) >>> 0),
  ]) {
    const result = renderSpinda(pid),
      positions = spindaPositions(pid),
      hits = new Uint8Array(4096);
    for (let s = 0; s < 4; s++)
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const px = positions[s].x + x,
            py = positions[s].y + y;
          if (
            px >= 0 &&
            px < 64 &&
            py >= 0 &&
            py < 64 &&
            referenceSpots[s].rows[y] & (1 << x)
          )
            hits[py * 64 + px]++;
        }
    result.forEach((color, n) => {
      const original = SPINDA_ASSETS.pixels[n];
      if (original < 1 || original > 3) assert.equal(color, original);
      else assert.ok(color === original || color === original + 4);
      if (hits[n] > 1 && original >= 1 && original <= 3) {
        sawOverlap = true;
        assert.equal(color, original + 4);
      }
      if (color !== original) assert.equal(SPINDA_REGION[n], 1);
    });
  }
  assert.ok(sawOverlap);
});

test("Spinda pre-catch search shares the wild engine, includes both range endpoints and retains exact occurrences", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 300;
  const before = structuredClone(state),
    candidates = generateSpindaCandidates(state),
    expected = scanWildSpreads(state.settings, { species: SPINDA_SPECIES }, []);
  assert.deepEqual(
    new Set(candidates.map((c) => c.pid)),
    new Set(expected.map((c) => c.pid)),
  );
  assert.deepEqual(state, before);
  assert.ok(candidates.length > 10);
  assert.equal(new Set(candidates.map((c) => c.pid)).size, candidates.length);
  const occurrences = candidates.flatMap((c) => c.encounters),
    advances = occurrences.map((e) => e.advance);
  assert.ok(advances.every((a) => a >= 0 && a <= 300));
  assert.ok(occurrences.some((e) => e.advance === 0));
  const last = Math.max(...advances),
    single = generateSpindaCandidates({
      ...state,
      settings: { ...state.settings, minAdvance: last, maxAdvance: last },
    });
  assert.deepEqual(
    single.flatMap((c) => c.encounters),
    occurrences.filter((e) => e.advance === last),
  );
  assert.ok(
    candidates.some(
      (c) => new Set(c.encounters.map((e) => e.advance)).size > 1,
    ),
  );
  for (const c of candidates)
    for (const e of c.encounters) {
      assert.deepEqual(e.methods.length, 1);
      assert.equal(e.lastAdvance, e.advance);
      assert.equal(e.ivs.length, 6);
      assert.equal(c.pid, e.pid);
    }
  const chosen = candidates[0],
    level = chosen.encounters[0].level;
  assert.ok(
    generateSpindaCandidates({
      ...state,
      level,
      nature: chosen.pid % 25,
    }).every(
      (c) =>
        c.pid % 25 === chosen.pid % 25 &&
        c.encounters.every((e) => e.level === level),
    ),
  );
});

test("observed Spinda gender partitions RNG candidates without changing the dragged PID", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 300;
  const all = generateSpindaCandidates(state);
  for (const gender of ["male", "female"] as const) {
    const filtered = generateSpindaCandidates({ ...state, gender });
    assert.ok(filtered.length > 0 && filtered.length < all.length);
    assert.deepEqual(
      filtered.map((c) => c.pid),
      all
        .filter((c) => ((c.pid & 255) < 127 ? "female" : "male") === gender)
        .map((c) => c.pid),
    );
  }
  assert.equal(state.pid, 0x88888888);
  const lab = {
    spindaMatcher: {
      ...state,
      gender: "female",
      journey: { ...newSpindaJourney(), step: "draw" },
    },
    facts: {},
    setSpindaMatcher: () => {},
  } as unknown as CurtainLab;
  const html = renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
  assert.ok(
    html.indexOf("Observed Spinda gender") <
      html.indexOf("Spinda pattern PID hexadecimal"),
  );
  assert.match(
    html,
    /This dragged pattern’s PID is male, but you selected female/,
  );
});

test("Spinda ranking puts the exact PID first and recovers it among close imperfect patterns", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 1000;
  const prepared = prepareSpindaCandidates(generateSpindaCandidates(state)),
    original = prepared[Math.floor(prepared.length / 2)].candidate.pid;
  const exact = rankSpindaCandidates(prepared, spindaPattern(original));
  assert.equal(exact[0].score, 100);
  assert.ok(
    exact.filter((m) => m.score === 100).some((m) => m.pid === original),
  );
  const positions = spindaPositions(original),
    imperfect = moveSpindaSpot(
      original,
      2,
      positions[2].x + 1,
      positions[2].y + 1,
    );
  const ranked = rankSpindaCandidates(prepared, spindaPattern(imperfect));
  assert.ok(ranked.slice(0, 10).some((m) => m.pid === original));
  assert.ok(ranked.find((m) => m.pid === original)!.score > 75);
  assert.equal(
    patternSimilarity(spindaPattern(original), spindaPattern(original)),
    100,
  );
  assert.ok(
    patternSimilarity(spindaPattern(original), spindaPattern(imperfect)) < 100,
  );
  const outside = spindaPattern(original);
  outside[4095] = 1;
  assert.deepEqual(rankSpindaCandidates(prepared, outside), exact);
});

test("hidden Spinda spots preserve visibly identical PIDs and tied rankings", () => {
  const groups = new Map<string, number>();
  let pair: number[] = [];
  for (let b = 0; b < 256 && !pair.length; b++) {
    const pid = (0x88888800 | b) >>> 0,
      signature = createHash("sha256").update(spindaPattern(pid)).digest("hex"),
      previous = groups.get(signature);
    if (previous !== undefined) pair = [previous, pid];
    else groups.set(signature, pid);
  }
  assert.equal(pair.length, 2, "clipping hides distinct offsets");
  const ranked = rankSpindaCandidates(
    prepareSpindaCandidates(pair.map((pid) => ({ pid, encounters: [] }))),
    spindaPattern(pair[0]),
  );
  assert.deepEqual(
    ranked.map((m) => m.score),
    [100, 100],
  );
  assert.deepEqual(
    ranked.map((m) => m.identicalPatterns),
    [2, 2],
  );
});

test("Spinda filters, snapped pattern and advisory estimates round trip through JSON/autosave without changing curtain evidence", () => {
  const state = defaultSpindaMatcher();
  state.pid = 0xffd00f00;
  state.level = 15;
  state.nature = 7;
  state.gender = "female";
  state.shortlist = [0x12345678, 0x87654321];
  state.appliedPid = state.shortlist[0];
  state.guide = newSpindaSidGuide(state.pid);
  state.guide.digit = 3;
  state.guide.freshZeros = true;
  state.guide.observations[100] = 0;
  state.guide.plaintext[84] = 5;
  const snapshot = newSnapshot("first", "Original");
  snapshot.observations[100] = 1;
  const investigation = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: PROFILE.id,
    origin: "unknown" as const,
    identity: {},
    snapshots: [snapshot],
    activeId: snapshot.id,
    ownedItems: [],
    spindaMatcher: state,
  };
  const original = structuredClone(investigation),
    text = saveInvestigation(investigation);
  assert.deepEqual(loadInvestigation(text), investigation);
  assert.deepEqual(
    readAutosave({ getItem: (key) => (key === AUTOSAVE_KEY ? text : null) }),
    investigation,
  );
  assert.deepEqual(investigation, original);
  assert.equal(
    loadInvestigation(text).identity.pid,
    undefined,
    "shortlist and provenance are not facts",
  );
  const { spindaMatcher, ...legacy } = investigation;
  assert.equal(
    loadInvestigation(saveInvestigation(legacy)).spindaMatcher,
    undefined,
  );
  assert.throws(
    () =>
      validateSpindaMatcher({
        ...state,
        settings: { ...state.settings, maxAdvance: 1_000_000 },
      }),
    /1,000,000/,
  );
  assert.throws(
    () =>
      validateSpindaMatcher({
        ...state,
        settings: { ...state.settings, methods: ["Method1"] },
      }),
    /H1/,
  );
  assert.throws(() => validateSpindaMatcher({ ...state, level: 0 }), /level/);
  assert.throws(() => validateSpindaMatcher({ ...state, pid: -1 }), /PID/);
});

test("broad Spinda scopes obey the shared spread limit without returning a silently truncated pool", () => {
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 30000;
  assert.throws(
    () => generateSpindaCandidates(state),
    /More than 5,000 distinct spreads/,
  );
  assert.equal(MAX_RNG_SPREADS, 5000);
});

test("Spinda worker reranks a complete cached pool and never reports success after failed generation", () => {
  const messages: SpindaWorkerResponse[] = [],
    handle = createSpindaWorkerHandler((data) => messages.push(data));
  const state = defaultSpindaMatcher();
  state.settings.maxAdvance = 100;
  handle({ type: "rank", pid: state.pid });
  assert.equal(messages.length, 0, "no cached pool yet");
  handle({ type: "generate", state, pid: state.pid });
  assert.ok(
    messages.some(
      (m) => m.type === "progress" && m.done === m.total && m.total === 101,
    ),
  );
  const first = messages.find((m) => m.type === "result");
  assert.ok(first && first.type === "result" && first.matches.length > 0);
  messages.length = 0;
  handle({ type: "rank", pid: state.pid + 1 });
  assert.equal(messages.length, 1, "reranking does not regenerate RNG");
  assert.equal(messages[0].type, "result");
  if (messages[0].type === "result")
    assert.equal(messages[0].pid, state.pid + 1);
  messages.length = 0;
  handle({
    type: "generate",
    state: { ...state, settings: { ...state.settings, maxAdvance: 30000 } },
    pid: state.pid,
  });
  assert.ok(messages.some((m) => m.type === "error"));
  assert.ok(!messages.some((m) => m.type === "result"));
  messages.length = 0;
  handle({ type: "rank", pid: state.pid });
  assert.deepEqual(
    messages,
    [],
    "failed search cannot reuse old or partial candidates",
  );
});

test("Spinda guide presents one page at a time with integrated spot drawing", () => {
  const state = defaultSpindaMatcher();
  const lab = {
    spindaMatcher: state,
    facts: {},
    setSpindaMatcher: () => {},
  } as unknown as CurtainLab;
  let html = renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
  assert.match(html, /Find SID with Spinda/);
  assert.doesNotMatch(
    html,
    /SID Pixel Guide|Find Spinda PID from its spot pattern/,
  );
  assert.doesNotMatch(html, /Move spot right one pixel/);
  assert.match(html, /Route 113/);
  assert.match(html, /TID-seeded new-game SID RNG/);
  state.journey = { ...newSpindaJourney(), step: "draw" };
  html = renderToStaticMarkup(createElement(SpindaMatcher, { lab }));
  assert.match(html, /Move spot right one pixel/);
  assert.match(html, /Encounter settings and search range/);
  assert.match(html, /one original sprite pixel/);
  assert.match(html, /Use this PID/);
  assert.doesNotMatch(html, /brush|Clear drawing/i);
});
