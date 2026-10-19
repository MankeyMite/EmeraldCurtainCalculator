import { scanWildSpreads, type RngSettings, type RngSpread } from "./rng";
import type { KnownFacts } from "./constraints";
import { recordMasks } from "./constraints";
import { analyzeConstraints } from "./inference";
import type { Snapshot } from "./investigation";
import { isRecorded } from "./itemTests";
import { solveSids } from "./sid";
import { generateSidRng, type SidRngSettings } from "./sidRng";

export type RngSearchInput = {
  settings: RngSettings;
  identity: KnownFacts;
  snapshots: Snapshot[];
  sidRng?: SidRngSettings;
};
export type RngSearchResult = {
  spreads: RngSpread[];
  analysis: ReturnType<typeof solveSids> | null;
};
export function searchWild(
  input: RngSearchInput,
  progress?: (done: number, total: number) => void,
): RngSearchResult {
  const snapshots = input.snapshots.filter(isRecorded);
  const generated = scanWildSpreads(
    input.settings,
    input.identity,
    snapshots,
    progress,
  );
  if (!generated.length)
    return {
      spreads: [],
      analysis:
        input.identity.tid === undefined
          ? null
          : {
              ...solveSids(
                input.identity,
                snapshots,
                [input.identity.pid ?? 0],
                [],
                200000,
              ),
              model: "No generated spread matches this RNG search.",
            },
    };
  if (input.identity.tid !== undefined) {
    const analysis = solveSids(
      input.identity,
      snapshots,
      [...new Set(generated.map((s) => s.pid))],
      generated,
      200000,
      input.sidRng
        ? generateSidRng(input.identity.tid, input.sidRng).map((r) => r.sid)
        : undefined,
    );
    const alive = new Set(
      analysis.candidates.map(
        (h) => `${h.pid}/${h.rng!.ivs.join(",")}/${h.rng!.abilitySlot}`,
      ),
    );
    return {
      spreads: generated.filter((s) =>
        alive.has(`${s.pid}/${s.ivs.join(",")}/${s.abilitySlot}`),
      ),
      analysis,
    };
  }
  // TID is optional for RNG searching. Retain only spreads compatible with each
  // stored-data observation; joint SID enumeration starts when TID is supplied.
  const spreads = generated.filter((s) =>
    snapshots.every(
      (snapshot) =>
        analyzeConstraints(recordMasks(snapshot.observations, 5), {
          ...snapshot.knownFacts,
          ...input.identity,
          pid: s.pid,
          ivs: s.ivs,
        }).consistent,
    ),
  );
  return { spreads, analysis: null };
}
