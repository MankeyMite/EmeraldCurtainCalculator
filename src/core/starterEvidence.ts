import type { KnownFacts } from "./constraints";
import type { Snapshot } from "./investigation";
import { battleEvs, type StarterGuideState } from "./starterGuide";
import { validateFacts } from "./session";
import { swapMoveFacts } from "./moveLearningExperiments";

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** A correction revises this observation, rather than inventing another game
 * state. Preserve legacy copies for export but stop treating them as evidence.
 * Only copies of this drawing with the same setup qualify: never merge real
 * training checkpoints, stat readings, independent drawings or experiment roots. */
export function correctStarterCheckpointFacts(
  snapshots: Snapshot[],
  baselineId: string,
  changes: KnownFacts,
): Snapshot[] {
  const baseline = snapshots.find((s) => s.id === baselineId);
  if (!baseline) throw Error("Starter curtain checkpoint not found.");
  const corrected = validateFacts({ ...baseline.knownFacts, ...changes });
  const fields = Object.keys(baseline.knownFacts).filter(
    (key) => key !== "evs",
  );
  const revisions = new Set(
    snapshots
      .filter(
        (s) =>
          s.id !== baseline.id &&
          !s.itemTest &&
          !s.supersededBy &&
          s.id.startsWith("starter-checkpoint-") &&
          (!s.starterCheckpointId ||
            s.starterCheckpointId === baseline.starterCheckpointId) &&
          !s.summaryStats?.level &&
          !s.summaryStats?.stats.some((v) => v !== null) &&
          !snapshots.some((child) => child.itemTest?.sourceId === s.id) &&
          s.observations.every(
            (value, i) => value === -1 || value === baseline.observations[i],
          ) &&
          same(
            Object.keys(s.knownFacts)
              .filter((key) => key !== "evs")
              .sort(),
            fields.slice().sort(),
          ) &&
          fields.every((key) =>
            same(
              s.knownFacts[key as keyof KnownFacts],
              baseline.knownFacts[key as keyof KnownFacts],
            ),
          ),
      )
      .map((s) => s.id),
  );
  const next = changes.evs
    ? correctStarterCheckpointEvs(snapshots, baselineId, changes.evs)
    : snapshots.slice();
  const replacements = new Map<string, Snapshot>();
  replacements.set(baselineId, {
    ...baseline,
    knownFacts: corrected,
    starterCheckpointId: baseline.starterCheckpointId ?? baseline.id,
  });
  // Carry corrections through actual item and move experiments. Move swaps
  // are relative to the corrected original order, rather than stale PP slots.
  for (let size = -1; size !== replacements.size;) {
    size = replacements.size;
    for (const s of next) {
      if (!s.itemTest || replacements.has(s.id)) continue;
      const parent = replacements.get(s.itemTest.sourceId);
      const before = snapshots.find((p) => p.id === s.itemTest!.sourceId);
      if (!parent || !before) continue;
      let facts = { ...s.knownFacts };
      const swap = /^moves-([0-3])-([0-3])$/.exec(s.itemTest.actionId ?? "");
      if (swap && (changes.moves || changes.pp)) {
        facts = {
          ...facts,
          ...swapMoveFacts(parent.knownFacts, Number(swap[1]), Number(swap[2])),
        };
      } else {
        for (const field of ["moves", "pp", "ppBonuses"] as const) {
          if (same(s.knownFacts[field], before.knownFacts[field]))
            Object.assign(facts, { [field]: parent.knownFacts[field] });
          else if (changes.moves || changes.pp)
            Object.assign(facts, {
              [field]: field === "ppBonuses" ? undefined : Array(4).fill(null),
            });
        }
      }
      replacements.set(s.id, { ...s, knownFacts: validateFacts(facts) });
    }
  }
  return next.map(
    (s) =>
      replacements.get(s.id) ??
      (revisions.has(s.id) ? { ...s, supersededBy: baselineId } : s),
  );
}

/** An edited battle log corrects the existing drawing only after returning
 * from a recorded curtain. Planned training instead creates a new checkpoint. */
export function starterEvsNeedCorrection(
  state: StarterGuideState,
  identity: KnownFacts,
  baseline: Snapshot,
  pending: boolean,
  drawing: boolean,
): boolean {
  if (
    state.step !== 2 ||
    state.route ||
    pending ||
    drawing ||
    !state.identifiedStarter ||
    identity.pid !== state.identifiedStarter.pid ||
    identity.tid !== Number(state.tid) ||
    identity.species !== state.species ||
    !baseline.observations.some((v) => v !== -1)
  )
    return false;
  const evs = state.evsKnown ? battleEvs(state.battles) : Array(6).fill(null);
  return evs.some(
    (value, i) => value !== (baseline.knownFacts.evs?.[i] ?? null),
  );
}

/** Repair facts, never repaint evidence. Item/move experiments descended
 * from this checkpoint inherit the correction; independent older checkpoints
 * and their level-up summaries keep the EVs they actually had at the time. */
export function correctStarterCheckpointEvs(
  snapshots: Snapshot[],
  baselineId: string,
  evs: (number | null)[],
): Snapshot[] {
  const baseline = snapshots.find((s) => s.id === baselineId);
  if (!baseline) throw Error("Starter curtain checkpoint not found.");
  const linked = new Set([baselineId]);
  for (let size = -1; size !== linked.size;) {
    size = linked.size;
    for (const s of snapshots)
      if (s.itemTest && linked.has(s.itemTest.sourceId)) linked.add(s.id);
  }
  return snapshots.map((s) => {
    if (!linked.has(s.id)) return s;
    const corrected =
      s.id === baselineId
        ? evs.slice()
        : evs.map((value, i) => {
            const before = baseline.knownFacts.evs?.[i] ?? null;
            const previous = s.knownFacts.evs?.[i] ?? null;
            // Preserve any additional, recorded training in a linked experiment.
            if (value === before) return previous;
            if (value === null || before === null || previous === null)
              return null;
            const next = previous + value - before;
            return next >= 0 && next <= 255 ? next : null;
          });
    if (corrected.reduce<number>((sum, v) => sum + (v ?? 0), 0) > 510) {
      if (s.id === baselineId)
        throw Error(
          "Corrected EVs exceed the Pokémon's 510 EV total. Review the battle log.",
        );
      // At the total cap, the old log cannot establish which later gains
      // were actually awarded. Retain the observation with unknown EVs.
      corrected.fill(null);
    }
    return { ...s, knownFacts: { ...s.knownFacts, evs: corrected } };
  });
}
