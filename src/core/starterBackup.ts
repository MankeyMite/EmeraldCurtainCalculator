import type { CurtainLab } from "../hooks/useCurtainLab";
import type { StarterGuideState } from "./starterGuide";
import type { KnownFacts } from "./constraints";
import { validateFacts } from "./session";
import { summaryFromDraft, estimateIVs } from "./stats";
import { speciesTraits } from "./traits";
import learnsets from "../data/level-up-learnsets.json";
import { maxPp } from "./pp";

export const BACKUP_EV_THRESHOLD = 5;
export function preferBackupPokemon(target?: number) {
  return target !== undefined && target > BACKUP_EV_THRESHOLD;
}
export function backupMoves(species: number, level: number) {
  const moves: number[] = [];
  for (const [at, move] of (learnsets as Record<number, number[][]>)[species] ??
    [])
    if (at <= level && !moves.includes(move)) {
      moves.push(move);
      if (moves.length > 4) moves.shift();
    }
  while (moves.length < 4) moves.push(0);
  return moves;
}
export function backupPokemonInput(
  state: StarterGuideState,
  draft: Record<string, string>,
) {
  const species = Number(draft.species),
    traits = speciesTraits(species);
  if (!traits) throw Error("Choose the caught Pokemon's species.");
  if (draft.nature === "" || draft.nature === undefined)
    throw Error("Enter its nature.");
  if (!["male", "female"].includes(draft.gender))
    throw Error("Enter its gender.");
  if (
    !draft.ability ||
    !traits.abilities.some((a) => a.id !== 0 && a.id === Number(draft.ability))
  )
    throw Error("Choose its actual ability.");
  const summary = summaryFromDraft(draft);
  if (!summary.level || summary.stats.some((s) => s === null))
    throw Error("Enter its level and all six summary stats, using maximum HP.");
  const moves = Array.from({ length: 4 }, (_, n) =>
    draft[`move_${n}`] === "" || draft[`move_${n}`] === undefined
      ? null
      : Number(draft[`move_${n}`]),
  );
  const facts = validateFacts({
    species,
    tid: Number(state.tid),
    ...(state.playerGender ? { otGender: state.playerGender } : {}),
    nature: Number(draft.nature),
    gender: draft.gender as "male" | "female",
    ability: Number(draft.ability),
    metGame: 3,
    metLevel: summary.level,
    ball: 4,
    language: 2,
    headerFlags: 2,
    isEgg: 0,
    headerPadding: 0,
    growthPadding: 0,
    ribbonTail: 0,
    ribbons: 0,
    pokerus: 0,
    ppBonuses: 0,
    heldItem: Number(draft.heldItem || 0),
    evs: [0, 0, 0, 0, 0, 0],
    contest: [0, 0, 0, 0, 0, 0],
    moves,
    pp: moves.map((m) =>
      m === null ? null : m === 0 ? 0 : (maxPp(m, 0) ?? null),
    ),
  });
  if (
    estimateIVs(
      facts,
      summary,
      Array.from({ length: 6 }, () => Array.from({ length: 32 }, (_, n) => n)),
    ).some((row) => row.stats?.length === 0)
  )
    throw Error(
      "These stats do not fit an untrained catch. Recheck the level, nature and maximum HP.",
    );
  return { facts, summary };
}
/** SID values are the only identity shared between these different Pokemon.
 * Recompute from independent starter evidence, never from a previous intersection. */
export function intersectBackupSids(starter: number[], backup: number[]) {
  const allowed = new Set(backup);
  return [...new Set(starter)].filter((sid) => allowed.has(sid));
}

export function sharedSidLabView(
  lab: CurtainLab,
  sids: number[],
  busy = false,
  error = "",
): CurtainLab {
  const allowed = new Set(sids);
  const analysis = lab.sidAnalysis ?? {
    candidates: [],
    sidValues: [],
    eliminated: [],
    model:
      "Conservative unknown-PID compatibility across the configured SID window.",
  };
  return {
    ...lab,
    sidAnalysis: {
      ...analysis,
      sidValues: sids,
      candidates: analysis.candidates.filter((h) => allowed.has(h.sid)),
    },
    analysisBusy: lab.analysisBusy || busy,
    analysisError: lab.analysisError || error,
  };
}
