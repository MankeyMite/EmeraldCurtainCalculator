import fs from "node:fs";
import { computeDeduction } from "../src/core/deduction";
import {
  createItemTest,
  targetExperiment,
  answerExperimentPixel,
} from "../src/core/itemTests";
import { knownPlaintext } from "../src/core/inference";
import { SUBSTRUCT_POSITIONS } from "../src/core/pokemon";
import type { KnownFacts } from "../src/core/constraints";
import type { Snapshot } from "../src/core/investigation";

const { identity, snapshot, reference } = JSON.parse(
  fs.readFileSync("research/fixtures/combusken-experiments.json", "utf8"),
) as {
  identity: KnownFacts;
  snapshot: Snapshot;
  reference: { pid: number; key: number };
};
const result = computeDeduction({
  identity,
  snapshots: [snapshot],
  activeId: snapshot.id,
});
const experiment = result.experiments.find(
    (e) => e.item.name === "SMOKE BALL",
  )!,
  question = result.domainQuestions[`item-${experiment.item.id}`],
  draft = targetExperiment(
    createItemTest(snapshot, "illustrative-test", experiment.item.id, [
      question.index,
    ]),
  );
// Reference PID/key are used ONLY to illustrate an outcome, after ranking.
// This is not an additional observed capture and must not enter a user's save.
const physical = question.index - 80,
  blocks = SUBSTRUCT_POSITIONS[reference.pid % 24],
  logical = blocks.indexOf(Math.floor(physical / 24)) * 24 + (physical % 24),
  mask = knownPlaintext({ ...draft.knownFacts, ...identity })[logical];
if (!mask || mask & (mask - 1))
  throw Error("Illustration requires known plaintext, never guessed EVs");
const value =
    (Math.log2(mask) ^ ((reference.key >>> ((physical % 8) * 4)) & 15)) === 0
      ? 0
      : 1,
  answered = answerExperimentPixel(draft, question.index, value),
  after = computeDeduction({
    identity,
    snapshots: [snapshot, answered],
    activeId: snapshot.id,
  });
console.log(
  JSON.stringify(
    {
      rng: "disabled",
      EVs: "unknown",
      suppliedPID: identity.pid ?? null,
      before: result.inference.pidCount.toString(),
      usefulItems: result.experiments.length,
      controlled: result.controlledExperiments.map((e) => e.action.name),
      experiment: experiment.item.name,
      question,
      illustrativeOutcome: value ? "black" : "transparent",
      after: after.inference.pidCount.toString(),
      note: "Illustrative reference-derived answer, not a newly verified in-game observation. Counts are conservative stored-data bounds.",
    },
    null,
    2,
  ),
);
