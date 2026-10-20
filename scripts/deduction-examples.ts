import fs from "node:fs";
import { decodePokemon, exampleRecord } from "../src/core/pokemon";
import {
  emptyObservations,
  observeMemory,
  type KnownFacts,
} from "../src/core/constraints";
import { assembleMemory } from "../src/core/memory";
import { newSnapshot, splitFacts } from "../src/core/investigation";
import { solveSids } from "../src/core/sid";
import { rankItemExperiments } from "../src/core/experiments";
import { pixelAssistance } from "../src/core/pixelAssistance";

/** Explicit, synthetic stored-data scenario. These IV tuples demonstrate the
 * scorer's correlated candidate interface; no encounter reachability is claimed. */
export function checksumRankingExample() {
  const bytes = exampleRecord(),
    d = decodePokemon(bytes);
  const facts: KnownFacts = {
    pid: d.pid,
    tid: d.tid,
    species: d.species,
    heldItem: d.heldItem,
    experience: d.experience,
    friendship: d.friendship,
    ppBonuses: d.ppBonuses,
    growthPadding: d.growthPadding,
    moves: d.moves,
    pp: d.pp,
    evs: d.evs,
    contest: d.contest,
    pokerus: d.pokerus,
    metLocation: d.metLocation,
    metLevel: d.metLevel,
    metGame: d.metGame,
    ball: d.ball,
    otGender: d.otGender as "male" | "female",
    isEgg: Number(d.isEgg),
    ribbons: d.ribbons,
    ribbonTail: d.ribbonTail,
  };
  const { identity, mutable } = splitFacts(facts),
    source = newSnapshot("base", "Synthetic checksum example", mutable);
  const observations = observeMemory(assembleMemory({ 5: bytes }));
  for (let n = 72; n < 76; n++) source.observations[n] = observations[n];
  const other = d.ivs.slice();
  other[0] += other[0] === 31 ? -1 : 1;
  const spreads = [d.ivs, other].map((ivs) => ({
    pid: d.pid,
    ivs,
    abilitySlot: d.ability,
  })) as any;
  const analysis = solveSids(identity, [source], [d.pid], spreads, Infinity, [
    d.sid,
    d.sid + 1,
  ]);
  const previous = rankItemExperiments(analysis.candidates);
  const improved = rankItemExperiments(
    analysis.candidates,
    undefined,
    source,
    identity,
  );
  const gain = improved.find(
    (e) =>
      e.checksumContributes &&
      e.worstCase <
        previous.find((old) => old.item.id === e.item.id)!.worstCase,
  )!;
  if (!gain) throw Error("Checksum ranking example did not improve");
  return {
    d,
    source,
    identity,
    candidates: analysis.candidates,
    previous,
    improved,
    gain,
  };
}

export function skarmoryPredictionExample() {
  const bytes = new Uint8Array(
      fs.readFileSync("research/fixtures/skarmory-test.ek3"),
    ),
    d = decodePokemon(bytes);
  const facts: KnownFacts = {
    species: d.species,
    experience: d.experience,
    moves: d.moves,
    pp: d.pp,
    ivs: d.ivs,
    evs: d.evs,
    pid: d.pid,
    tid: d.tid,
    sid: d.sid,
  };
  const obs = emptyObservations(),
    a = pixelAssistance(obs, facts),
    actual = observeMemory(assembleMemory({ 5: bytes }));
  const predicted = a.predictions.slice(16, 176).filter((p) => p !== -1).length;
  const mismatches = a.predictions.flatMap((p, i) =>
    p !== -1 && p !== actual[i] ? [i] : [],
  );
  return {
    predicted,
    black: a.predictions.filter((p) => p === 1).length,
    transparent: a.predictions.filter((p) => p === 0).length,
    mismatches,
    observed: obs.filter((p) => p !== -1).length,
  };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/deduction-examples.ts")) {
  const r = checksumRankingExample(),
    old = r.previous.find((e) => e.item.id === r.gain.item.id)!;
  console.log(
    JSON.stringify(
      {
        checksumExample: {
          baselineChecksum: r.d.checksum,
          candidates: r.candidates.length,
          item: r.gain.item.name,
          itemId: r.gain.item.id,
          delta: r.gain.checksumDelta,
          encryptedOnlyWorstCase: old.worstCase,
          combinedWorstCase: r.gain.worstCase,
          oldTop: r.previous[0].item.name,
          newTop: r.improved[0].item.name,
        },
        skarmory: skarmoryPredictionExample(),
      },
      null,
      2,
    ),
  );
}
