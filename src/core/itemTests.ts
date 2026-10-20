import { newSnapshot, type Snapshot } from "./investigation";
import { ITEM_CATALOG } from "./experiments";
import { emptyObservations, type Observation } from "./constraints";

export function isRecorded(snapshot: Snapshot): boolean {
  return !snapshot.itemTest || snapshot.itemTest.phase === "recorded";
}
export function isEvidence(snapshot: Snapshot): boolean {
  return isRecorded(snapshot) || snapshot.itemTest?.mode === "pixels";
}
export function targetExperiment(snapshot: Snapshot): Snapshot {
  if (!snapshot.itemTest || !snapshot.targets?.length)
    throw Error("This experiment has no informative target pixels.");
  return {
    ...snapshot,
    observations: emptyObservations(),
    itemTest: {
      ...snapshot.itemTest,
      mode: "pixels",
      phase: "editing",
      changed: undefined,
    },
  };
}
export function answerExperimentPixel(
  snapshot: Snapshot,
  index: number,
  value: Observation,
): Snapshot {
  if (
    snapshot.itemTest?.mode !== "pixels" ||
    !snapshot.targets?.includes(index)
  )
    throw Error("Select a highlighted experiment pixel.");
  const observations = snapshot.observations.slice();
  observations[index] = value;
  const done = snapshot.targets.every((n) => observations[n] !== -1);
  return {
    ...snapshot,
    observations,
    itemTest: { ...snapshot.itemTest, phase: done ? "recorded" : "editing" },
  };
}
export function finishPixelExperiment(snapshot: Snapshot): Snapshot {
  if (
    snapshot.itemTest?.mode !== "pixels" ||
    !snapshot.observations.some((v) => v !== -1)
  )
    throw Error("Verify at least one target pixel first.");
  return { ...snapshot, itemTest: { ...snapshot.itemTest, phase: "recorded" } };
}
export function itemTestBaseline(snapshots: Snapshot[]): Snapshot {
  const baseline = snapshots.find((snapshot) => !snapshot.itemTest);
  if (!baseline)
    throw Error("An original observation is needed before testing items.");
  return baseline;
}
// Saving changes the selected drawing back to the original, while retaining
// the completed item snapshot as independent evidence for every later solve.
export function recordItemTest(snapshots: Snapshot[], completed: Snapshot) {
  if (
    completed.itemTest?.phase !== "recorded" ||
    !snapshots.some((s) => s.id === completed.id)
  )
    throw Error("Finish the item test before recording it.");
  const saved = snapshots.map((s) => (s.id === completed.id ? completed : s));
  return { snapshots: saved, baseline: itemTestBaseline(saved) };
}
export function createItemTest(
  source: Snapshot,
  id: string,
  itemId: number,
  targets: number[],
  candidatesBefore?: number,
): Snapshot {
  if (!isRecorded(source)) throw Error("Finish the current item test first.");
  const item = ITEM_CATALOG.find((i) => i.id === itemId && i.experiment);
  if (!item) throw Error("This item is not supported for a held-item test.");
  const mutable = { ...structuredClone(source.knownFacts), heldItem: itemId };
  delete mutable.friendship;
  delete mutable.checksum;
  if (mutable.assumed)
    mutable.assumed = mutable.assumed.filter(
      (k) => !["friendship", "heldItem", "checksum"].includes(k),
    );
  return {
    ...newSnapshot(id, `${item.name} test`, mutable),
    observations: source.observations.slice(),
    summaryStats: source.summaryStats
      ? structuredClone(source.summaryStats)
      : undefined,
    targets: targets.slice(),
    notes: `Held-item test: ${item.name}. Comparison drawing: ${source.name}. No battles or other edits. Friendship and checksum left unknown.`,
    itemTest: {
      sourceId: source.id,
      phase: "question",
      ...(candidatesBefore === undefined ? {} : { candidatesBefore }),
    },
  };
}
export function answerItemTest(
  snapshot: Snapshot,
  source: Snapshot,
  changed: boolean,
): Snapshot {
  if (
    !snapshot.itemTest ||
    snapshot.itemTest.sourceId !== source.id ||
    snapshot.itemTest.phase === "recorded"
  )
    throw Error("No pending item test.");
  return {
    ...snapshot,
    observations: source.observations.slice(),
    itemTest: {
      ...snapshot.itemTest,
      phase: changed ? "editing" : "recorded",
      changed,
    },
    notes: `${snapshot.notes}\n${changed ? `Pixels differ from comparison drawing ${source.name}; draft until saved.` : `Player confirmed the curtain matches comparison drawing ${source.name} with the new item.`}`,
  };
}
export function finishItemTest(snapshot: Snapshot, source: Snapshot): Snapshot {
  if (
    !snapshot.itemTest ||
    snapshot.itemTest.phase !== "editing" ||
    snapshot.itemTest.sourceId !== source.id
  )
    throw Error("Answer whether the pixels changed first.");
  if (
    !snapshot.observations
      .slice(16, 176)
      .some((pixel, n) => pixel !== source.observations[n + 16])
  )
    throw Error(
      "The drawing has no edits yet. Edit the changed pixels, or choose ‘Matches comparison drawing after all’.",
    );
  return {
    ...snapshot,
    itemTest: { ...snapshot.itemTest, phase: "recorded", changed: true },
    notes: `${snapshot.notes}\nUpdated drawing saved and applied as a new observation.`,
  };
}
