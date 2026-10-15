import dots from "../../research/fixtures/solver-example-dots.json";
import skarmory from "../../research/fixtures/solver-example-skarmory.json";
import latios from "../../research/fixtures/solver-example-latios.json";
import records from "../data/research-records.json";
import { loadSession } from "./session";
import { parseRecord } from "./pokemon";
import type { Records } from "./memory";

export const RESEARCH_EXAMPLES = [
  {
    id: "dots",
    title: "DOTS Seedot",
    description:
      "Male in-game trade with Early Bird, independently captured in mGBA. Observations and known facts recover one PID: 132 (0x00000084), without entering it.",
  },
  {
    id: "skarmory",
    title: "Skarmory",
    description:
      "User-painted drawing and summary stats. HP IV 31 is already applied, leaving 20 PIDs; clear that IV to see the earlier 41 possibilities.",
  },
  {
    id: "latios",
    title: "Latios (illegal test record)",
    description:
      "Independent mGBA capture of an illegal record, retained for rendering checks. Saved facts leave 5,703 PIDs; no legality inference is applied.",
  },
] as const;
export type ResearchExampleId = (typeof RESEARCH_EXAMPLES)[number]["id"];
const sessions = { dots, skarmory, latios };

/** Load independent saved observations/facts plus a reference comparison record.
 * Never derive solver observations or known facts from the reference bytes.
 * Fresh copies keep edits from changing this catalog or future loads.
 */
export function loadResearchExample(id: ResearchExampleId) {
  const metadata = RESEARCH_EXAMPLES.find((entry) => entry.id === id);
  if (!metadata) throw Error("Unknown research example");
  const session = loadSession(JSON.stringify(sessions[id]));
  // Public demo adds two summary-visible facts supplied by the contributor.
  // Preserve the original browser-exported fixture and its five-PID baseline.
  // Early Bird is ability ID 48; this is not an ability-slot or PID-parity rule.
  if (id === "dots") {
    session.knownFacts = { ...session.knownFacts, gender: "male", ability: 48 };
  }
  const reference = parseRecord(Uint8Array.from(records[id]));
  const candidateRecords: Records = { 5: reference };
  // Capture evidence establishes empty neighbors for these two checkpoints.
  // Skarmory's saved neighboring observations remain unknown.
  if (id !== "skarmory") {
    candidateRecords[4] = new Uint8Array(80);
    candidateRecords[6] = new Uint8Array(80);
  }
  return { ...metadata, session, records: candidateRecords };
}
