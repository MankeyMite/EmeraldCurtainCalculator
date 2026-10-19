import { searchUnknownPidSids, type SidRngRow } from "../core/sidRng";
import { solveSids } from "../core/sid";
import type { KnownFacts } from "../core/constraints";
import type { Snapshot } from "../core/investigation";
const scope = self as unknown as {
  onmessage:
    | ((
        event: MessageEvent<{
          identity: KnownFacts;
          snapshots: Snapshot[];
          rows: SidRngRow[];
          pids: number[] | null;
        }>,
      ) => void)
    | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = searchUnknownPidSids(
      data.identity,
      data.snapshots,
      data.rows,
      (done, total) => scope.postMessage({ type: "progress", done, total }),
    );
    const pids = data.pids ?? result.pidValues;
    if (pids?.length) {
      result.analysis = solveSids(
        data.identity,
        data.snapshots,
        pids,
        undefined,
        200000,
        result.rows.map((r) => r.sid),
      );
      const alive = new Set(result.analysis.sidValues);
      result.rows = result.rows.filter((r) => alive.has(r.sid));
      result.exact = true;
      result.pidValues = [
        ...new Set(result.analysis.candidates.map((h) => h.pid)),
      ];
    }
    scope.postMessage({ type: "result", result });
  } catch (error) {
    scope.postMessage({ type: "error", message: (error as Error).message });
  }
};
