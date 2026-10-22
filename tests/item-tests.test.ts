import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createItemTest,
  answerItemTest,
  finishItemTest,
  isRecorded,
  itemTestBaseline,
  recordItemTest,
  targetExperiment,
} from "../src/core/itemTests";
import { emptyObservations, observeMemory } from "../src/core/constraints";
import {
  newSnapshot,
  loadInvestigation,
  saveInvestigation,
} from "../src/core/investigation";
import { solveSids, makeHypothesis } from "../src/core/sid";
import { rankItemExperiments } from "../src/core/experiments";
import { PROFILE, assembleMemory } from "../src/core/memory";
import {
  exampleRecord,
  decodePokemon,
  SUBSTRUCT_POSITIONS,
} from "../src/core/pokemon";
import { AUTOSAVE_KEY, readAutosave } from "../src/core/autosave";
import { ItemTestControls } from "../src/components/ItemTestControls";
import type { CurtainLab } from "../src/hooks/useCurtainLab";
import { EMPTY_DEDUCTION } from "../src/core/deduction";

test("targeted experiment instructions identify highlights without a screen-relative position", () => {
  const baseline = newSnapshot("base", "Baseline", { heldItem: 0 });
  const pending = targetExperiment(
    createItemTest(baseline, "pending", 4, [84]),
  );
  const html = renderToStaticMarkup(
    createElement(ItemTestControls, {
      lab: {
        ...EMPTY_DEDUCTION,
        pendingItemTest: pending,
        activeSnapshot: pending,
        itemTestBaseline: baseline,
        currentSnapshots: [baseline, pending],
        experimentTargets: [84],
      } as unknown as CurtainLab,
      openEditor: () => {},
      openResults: () => {},
    }),
  );
  assert.match(html, /Inspect the highlighted pixel\./);
  assert.doesNotMatch(
    html,
    /pixels below|pixels above|on the right|on the left/,
  );
});

test("selecting an item keeps a separate editable draft and never applies it as observed evidence", () => {
  const source = {
    ...newSnapshot("base", "Before", {
      heldItem: 0,
      friendship: 71,
      checksum: 123,
      evs: [0, 0, 0, 0, 0, 0],
    }),
    observations: emptyObservations(),
  };
  source.observations[100] = 1;
  const draft = createItemTest(source, "test", 86, [100], 1000);
  assert.equal(draft.knownFacts.heldItem, 86);
  assert.equal(draft.knownFacts.friendship, undefined);
  assert.equal(draft.knownFacts.checksum, undefined);
  assert.equal(isRecorded(draft), false);
  assert.equal(draft.itemTest?.phase, "question");
  assert.deepEqual(draft.observations, source.observations);
  draft.observations[100] = 0;
  draft.knownFacts.evs![0] = 1;
  assert.equal(source.observations[100], 1);
  assert.equal(source.knownFacts.evs![0], 0);
  assert.throws(() => createItemTest(draft, "nested", 137, []), /Finish/);
  assert.throws(
    () => createItemTest(source, "key-item", 259, []),
    /not supported/,
  );
});

test("No explicitly records unchanged observations for the new item; Yes applies only the saved edited draft", () => {
  const source = newSnapshot("base", "Before", { heldItem: 0 });
  source.observations[100] = 1;
  const selected = createItemTest(source, "test", 86, [100]);
  const unchanged = answerItemTest(selected, source, false);
  assert.ok(isRecorded(unchanged));
  assert.equal(unchanged.itemTest?.changed, false);
  assert.equal(unchanged.knownFacts.heldItem, 86);
  assert.deepEqual(unchanged.observations, source.observations);
  assert.equal(
    unchanged.observations[99],
    -1,
    "unknown pixels remain unknown after No",
  );
  const editing = answerItemTest(selected, source, true);
  assert.equal(isRecorded(editing), false);
  assert.throws(() => finishItemTest(editing, source), /no edits/);
  editing.observations[100] = 0;
  const finished = finishItemTest(editing, source);
  assert.ok(isRecorded(finished));
  assert.equal(finished.itemTest?.changed, true);
  assert.equal(finished.observations[100], 0);
  assert.equal(source.observations[100], 1);
  assert.equal(finished.observations[99], -1);
  assert.throws(() => finishItemTest(selected, source), /Answer/);
  assert.throws(() => answerItemTest(finished, source, true), /No pending/);
});

function changedItem(bytes: Uint8Array, item: number) {
  const copy = bytes.slice(),
    v = new DataView(copy.buffer),
    d = decodePokemon(copy);
  for (let i = 32; i < 80; i += 4)
    v.setUint32(i, v.getUint32(i, true) ^ d.key, true);
  v.setUint16(32 + SUBSTRUCT_POSITIONS[d.pid % 24][0] * 12 + 2, item, true);
  let checksum = 0;
  for (let i = 32; i < 80; i += 2)
    checksum = (checksum + v.getUint16(i, true)) & 65535;
  v.setUint16(28, checksum, true);
  for (let i = 32; i < 80; i += 4)
    v.setUint32(i, v.getUint32(i, true) ^ d.key, true);
  return copy;
}
test("the Yes/No test lifecycle narrows real joint hypotheses and recalculates the next ranked items", () => {
  const bytes = exampleRecord("pokemon"),
    record = decodePokemon(bytes);
  const identity = {
    pid: record.pid,
    tid: record.tid,
    species: record.species,
  };
  const source = {
    ...newSnapshot("base", "Before", { heldItem: 0 }),
    observations: observeMemory(assembleMemory({ 5: bytes })),
  };
  const initial = solveSids(identity, [source], [record.pid]);
  const recommendations = rankItemExperiments(initial.candidates);
  assert.ok(
    recommendations.some((e) => e.item.id === 86),
    "rank the catalog without an inventory",
  );
  const draft = createItemTest(
    source,
    "repel",
    86,
    [],
    initial.candidates.length,
  );
  const during = solveSids(identity, [source, draft].filter(isRecorded), [
    record.pid,
  ]);
  assert.deepEqual(during.sidValues, initial.sidValues);
  const afterBytes = changedItem(bytes, 86);
  const actualPattern = observeMemory(assembleMemory({ 5: afterBytes }));
  const changed = actualPattern.some(
    (pixel, i) => pixel !== source.observations[i],
  );
  let completed = answerItemTest(draft, source, changed);
  if (changed)
    completed = finishItemTest(
      { ...completed, observations: actualPattern },
      source,
    );
  const result = solveSids(identity, [source, completed].filter(isRecorded), [
    record.pid,
  ]);
  assert.ok(result.sidValues.includes(record.sid));
  assert.ok(result.candidates.length < initial.candidates.length);
  const next = rankItemExperiments(result.candidates);
  assert.ok(next.some((e) => e.groups > 1));
  assert.ok(next.every((e) => e.worstCase <= result.candidates.length));
});

test("unfinished tests and recorded results survive JSON and device-save reloads; legacy files still load", () => {
  const source = newSnapshot("base", "Before", { heldItem: 0 });
  source.observations[100] = 1;
  const test = answerItemTest(
    createItemTest(source, "test", 86, [100]),
    source,
    true,
  );
  test.observations[100] = 0;
  const investigation = {
    format: "emerald-curtain-investigation" as const,
    schemaVersion: 1 as const,
    mappingVersion: PROFILE.id,
    origin: "wild" as const,
    identity: { pid: 132, tid: 38726 },
    snapshots: [source, test],
    activeId: test.id,
    ownedItems: [137],
  };
  const json = saveInvestigation(investigation);
  const restored = readAutosave({
    getItem: (key) => (key === AUTOSAVE_KEY ? json : null),
  })!;
  assert.equal(restored.snapshots[1].itemTest?.phase, "editing");
  assert.equal(isRecorded(restored.snapshots[1]), false);
  assert.equal(restored.snapshots[1].observations[100], 0);
  assert.equal(restored.snapshots[0].observations[100], 1);
  assert.equal(readAutosave({ getItem: () => "invalid json" }), null);
  assert.equal(
    readAutosave({
      getItem: () => {
        throw Error("Storage blocked");
      },
    }),
    null,
  );
  assert.throws(
    () =>
      loadInvestigation(
        JSON.stringify({ ...investigation, snapshots: [test] }),
      ),
    /Missing previous/,
  );
  const invalid = structuredClone(investigation);
  invalid.snapshots[1].itemTest!.phase = "recorded";
  delete invalid.snapshots[1].itemTest!.changed;
  assert.throws(
    () => loadInvestigation(JSON.stringify(invalid)),
    /Invalid item test/,
  );
});

test("the current test UI presents a direct Yes/No question followed by one clear save action", () => {
  const source = newSnapshot("base", "Before", { heldItem: 0 });
  source.observations[100] = 1;
  const draft = createItemTest(source, "test", 86, []);
  const render = (activeSnapshot: typeof draft) =>
    renderToStaticMarkup(
      createElement(ItemTestControls, {
        lab: {
          activeSnapshot,
          pendingItemTest: activeSnapshot,
          itemTestBaseline: source,
          currentSnapshots: [source, activeSnapshot],
          factError: "",
          summaryError: "",
          reportItemChange: () => true,
          confirmItemTest: () => true,
          cancelItemTest: () => {},
        } as unknown as CurtainLab,
        openEditor: () => {},
        openResults: () => {},
      }),
    );
  const question = render(draft);
  assert.match(
    question,
    /Did the pixels change compared with the original drawing\?/,
  );
  assert.match(question, /Yes, edit differences from the original drawing/);
  assert.match(question, /No, matches the original drawing/);
  assert.match(question, /original drawing “Before”/);
  assert.doesNotMatch(question, /checkbox/);
  const editing = render(answerItemTest(draft, source, true));
  assert.match(editing, /Save drawing &amp; analyze test/);
  assert.match(editing, /draft does not affect/);
});

test("successive item tests always start from the original; saving restores it and preserves each result and comparison", () => {
  const original = newSnapshot("original", "First curtain", {
    heldItem: 0,
    experience: 27,
  });
  original.observations[100] = 1;
  original.observations[101] = 0;
  const preserved = structuredClone(original);
  const first = createItemTest(itemTestBaseline([original]), "repel", 86, []);
  const edited = answerItemTest(first, original, true);
  edited.observations[100] = 0;
  const saved = recordItemTest(
    [original, first],
    finishItemTest(edited, original),
  );
  assert.deepEqual(saved.baseline, preserved);
  assert.equal(saved.snapshots[1].observations[100], 0);
  const next = createItemTest(
    itemTestBaseline(saved.snapshots),
    "berry",
    137,
    [],
  );
  assert.equal(next.itemTest?.sourceId, original.id);
  assert.equal(
    next.observations[100],
    1,
    "new test must not copy the previous item's edited pixel",
  );
  const no = answerItemTest(next, original, false);
  const savedAgain = recordItemTest([...saved.snapshots, next], no);
  assert.deepEqual(savedAgain.baseline, preserved);
  assert.deepEqual(savedAgain.snapshots[2].observations, original.observations);
  assert.equal(
    savedAgain.snapshots[1].observations[100],
    0,
    "first item result stays saved after restoring the original",
  );
  assert.equal(savedAgain.snapshots[2].knownFacts.heldItem, 137);
  assert.equal(savedAgain.baseline.knownFacts.heldItem, 0);
  const reloaded = loadInvestigation(
    saveInvestigation({
      format: "emerald-curtain-investigation",
      schemaVersion: 1,
      mappingVersion: PROFILE.id,
      origin: "unknown",
      identity: {},
      snapshots: savedAgain.snapshots,
      activeId: savedAgain.baseline.id,
      ownedItems: [],
    }),
  );
  assert.equal(reloaded.activeId, "original");
  assert.deepEqual(itemTestBaseline(reloaded.snapshots), preserved);
  assert.ok(
    reloaded.snapshots
      .slice(1)
      .every((s) => s.itemTest?.sourceId === "original"),
  );
  assert.throws(() => recordItemTest([original, first], first), /Finish/);
});

test("legacy chained comparisons are preserved on reload while new tests use the original baseline", () => {
  const original = newSnapshot("base", "Original");
  original.observations[100] = 1;
  const first = answerItemTest(
    createItemTest(original, "first", 86, []),
    original,
    true,
  );
  first.observations[100] = 0;
  const previous = finishItemTest(first, original);
  const oldPending = createItemTest(previous, "legacy", 137, []);
  const html = renderToStaticMarkup(
    createElement(ItemTestControls, {
      lab: {
        activeSnapshot: oldPending,
        pendingItemTest: oldPending,
        itemTestBaseline: original,
        currentSnapshots: [original, previous, oldPending],
        factError: "",
        summaryError: "",
      } as unknown as CurtainLab,
      openEditor: () => {},
      openResults: () => {},
    }),
  );
  assert.match(html, /compared with the saved comparison drawing\?/);
  assert.match(html, /saved comparison drawing “REPEL test”/);
  const no = answerItemTest(oldPending, previous, false);
  const saved = recordItemTest([original, previous, oldPending], no);
  assert.equal(saved.snapshots[2].itemTest?.sourceId, previous.id);
  assert.equal(
    saved.snapshots[2].observations[100],
    0,
    "do not reinterpret an old comparison as matching the original",
  );
  const next = createItemTest(
    itemTestBaseline(saved.snapshots),
    "new",
    138,
    [],
  );
  assert.equal(next.itemTest?.sourceId, original.id);
  assert.equal(next.observations[100], 1);
  assert.equal(saved.baseline.id, original.id);
});
