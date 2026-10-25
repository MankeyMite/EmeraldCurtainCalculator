import type { KnownFacts } from "./constraints";
import { emptyObservations } from "./constraints";
import { newSnapshot, splitFacts, type Snapshot } from "./investigation";
import { isRecorded, itemTestBaseline, targetExperiment } from "./itemTests";
import { usefulStarterPixels } from "./starterRoute";
import type { Hypothesis } from "./sid";
import { isActiveAssumption, validateFacts } from "./session";

/** The guided flow follows the active physical setup. Advanced experiments keep
 * their original-baseline protocol. A pending test is relative to its parent. */
export function starterExperimentSource(
  snapshots: Snapshot[],
  activeId: string,
): Snapshot {
  const active = snapshots.find((s) => s.id === activeId);
  if (!active) throw Error("Current starter setup not found.");
  if (!isRecorded(active) && active.itemTest) {
    const source = snapshots.find((s) => s.id === active.itemTest!.sourceId);
    if (!source) throw Error("Previous starter setup not found.");
    return source;
  }
  return active.supersededBy ? itemTestBaseline(snapshots) : active;
}

export function hasStarterDrawing(snapshots: Snapshot[]) {
  return snapshots.some(
    (s) =>
      !s.supersededBy &&
      !s.itemTest &&
      s.observations.slice(16, 176).every((v) => v !== -1),
  );
}

/** Retain the test setup after its answers. No historical pixel is copied into
 * the changed record; old snapshots remain independent evidence. */
export function continueStarterExperiment(snapshot: Snapshot): Snapshot {
  if (!snapshot.itemTest) return snapshot;
  const action = snapshot.itemTest.action;
  return {
    ...snapshot,
    itemTest: {
      ...snapshot.itemTest,
      ...(action
        ? {
            action: {
              ...action,
              instructions:
                action.kind === "moves"
                  ? action.instructions +
                    " Keep this move order and held item for the next experiment."
                  : action.instructions,
              restore: "Keep this setup for the next experiment.",
            },
          }
        : {}),
    },
  };
}

/** A battle-log update describes the Pokemon now. It cannot rewrite the setup
 * of any earlier drawing. Only new, explicitly answered pixels can add evidence. */
export function updatedStarterCheckpoint(
  source: Snapshot,
  identity: KnownFacts,
  supplied: KnownFacts,
  candidates: Hypothesis[],
  id: string,
): Snapshot | null {
  if (!isRecorded(source)) throw Error("Finish the current experiment first.");
  const facts = splitFacts(validateFacts(supplied)).mutable;
  delete facts.checksum;
  const same = (key: keyof KnownFacts) =>
    JSON.stringify(source.knownFacts[key]) === JSON.stringify(facts[key]);
  if (
    (["evs", "moves", "pp", "ppBonuses", "heldItem", "pokerus"] as const).every(
      same,
    )
  )
    return null;
  if (!same("evs")) {
    delete facts.experience;
    delete facts.friendship;
  }
  if (facts.assumed)
    facts.assumed = facts.assumed.filter((key) =>
      isActiveAssumption(facts, key),
    );
  const checkpoint = newSnapshot(id, "Check updated Pokemon", facts);
  checkpoint.starterCheckpointId = id;
  const targets = usefulStarterPixels(
    candidates,
    { ...facts, ...identity },
    emptyObservations(),
  )
    .slice(0, 4)
    .map((q) => q.index);
  if (!targets.length) return checkpoint;
  return targetExperiment({
    ...checkpoint,
    targets,
    itemTest: {
      sourceId: source.id,
      phase: "question",
      action: {
        kind: same("evs") ? "moves" : "ev",
        name: "Check updated Pokemon",
        instructions:
          "Keep the current held item and move order. Box the starter in Box 8, slot 5, reenter the school and check the highlighted pixel.",
        restore: "Keep this setup for the next experiment.",
      },
    },
  });
}
