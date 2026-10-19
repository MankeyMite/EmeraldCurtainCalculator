import fs from "node:fs";
import { loadInvestigation } from "../src/core/investigation";
import { decodePokemon, recordHex } from "../src/core/pokemon";
import { compareCandidate, recordMasks } from "../src/core/constraints";
import { analyzeConstraints } from "../src/core/inference";
import { diagnoseHypothesis, makeHypothesis } from "../src/core/sid";
import { genderForPid, speciesTraits } from "../src/core/traits";
const [sessionFile, recordFile] = process.argv.slice(2);
if (!sessionFile || !recordFile)
  throw Error(
    "Usage: npx tsx scripts/diagnose-investigation.ts investigation.json record.ek3",
  );
const session = loadInvestigation(fs.readFileSync(sessionFile, "utf8"));
const bytes = new Uint8Array(fs.readFileSync(recordFile));
const decoded = decodePokemon(bytes);
console.log(
  JSON.stringify(
    {
      record: decoded,
      gender: genderForPid(decoded.species, decoded.pid),
      ability: speciesTraits(decoded.species)?.abilities[decoded.ability],
      hex: recordHex(bytes),
    },
    null,
    2,
  ),
);
for (const snapshot of session.snapshots) {
  const facts = { ...snapshot.knownFacts, ...session.identity };
  const result = analyzeConstraints(
    recordMasks(snapshot.observations, 5),
    facts,
  );
  const comparison = compareCandidate(
    snapshot.observations,
    { 5: bytes },
    facts,
  );
  const removals = Object.keys(facts)
    .filter((key) => key !== "assumed")
    .map((key) => {
      const next = { ...facts };
      delete (next as Record<string, unknown>)[key];
      delete next.assumed;
      if (key === "species") {
        delete next.ability;
        delete next.gender;
      }
      const trial = analyzeConstraints(
        recordMasks(snapshot.observations, 5),
        next,
      );
      return { removed: key, pids: trial.pidCount.toString() };
    });
  console.log(
    JSON.stringify(
      {
        snapshot: snapshot.name,
        pidCount: result.pidCount.toString(),
        comparison,
        recordDiagnostic: diagnoseHypothesis(
          session.identity,
          snapshot,
          makeHypothesis(decoded.pid, decoded.tid, decoded.sid),
        ),
        removals,
      },
      null,
      2,
    ),
  );
}
