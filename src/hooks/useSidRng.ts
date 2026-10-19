import { useEffect, useState } from "react";
import type { KnownFacts } from "../core/constraints";
import type { Snapshot } from "../core/investigation";
import type { SidRngResult, SidRngRow } from "../core/sidRng";
export function useSidRngWorker(
  enabled: boolean,
  signature: string,
  input: {
    identity: KnownFacts;
    snapshots: Snapshot[];
    rows: SidRngRow[];
    pids: number[] | null;
  },
) {
  const key = JSON.stringify({ enabled, signature });
  const [state, setState] = useState<{
    key: string;
    result: SidRngResult | null;
    error: string;
    progress: number;
  }>({ key: "", result: null, error: "", progress: 0 });
  useEffect(() => {
    if (!enabled) return;
    const worker = new Worker(
      new URL("../workers/sidRng.worker.ts", import.meta.url),
      { type: "module" },
    );
    setState({ key, result: null, error: "", progress: 0 });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress")
        setState((s) => ({
          ...s,
          progress: Math.round((data.done / Math.max(data.total, 1)) * 100),
        }));
      else if (data.type === "result") {
        setState({ key, result: data.result, error: "", progress: 100 });
        worker.terminate();
      } else {
        setState({ key, result: null, error: data.message, progress: 0 });
        worker.terminate();
      }
    };
    worker.onerror = () => {
      setState({
        key,
        result: null,
        error:
          "SID search could not run. Widen or disable the window and retry.",
        progress: 0,
      });
      worker.terminate();
    };
    const timer = setTimeout(() => worker.postMessage(input), 250);
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [key]);
  const current = key === state.key;
  return {
    result: enabled && current ? state.result : null,
    error: enabled && current ? state.error : "",
    progress: current ? state.progress : 0,
    busy: enabled && (!current || (!state.result && !state.error)),
  };
}
