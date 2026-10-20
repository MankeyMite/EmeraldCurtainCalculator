import { useEffect, useState } from "react";
import {
  EMPTY_DEDUCTION,
  type DeductionInput,
  type DeductionResult,
} from "../core/deduction";
import { scheduleDeduction, INPUT_IDLE_MS } from "../core/deductionScheduler";
export function useDeduction(
  input: DeductionInput,
  paused: boolean,
  enabled: boolean,
  revision: number,
) {
  const key = JSON.stringify(input);
  const [state, setState] = useState<{
    key: string;
    data: DeductionResult;
    error: string;
    progress: number;
  }>({ key: "", data: EMPTY_DEDUCTION, error: "", progress: 0 });
  const [completedRevision, setCompletedRevision] = useState(revision);
  useEffect(() => {
    if (paused || !enabled) return;
    return scheduleDeduction(
      input,
      () =>
        new Worker(new URL("../workers/deduction.worker.ts", import.meta.url), {
          type: "module",
        }),
      ({ data }) => {
        if (data.type === "result") {
          setState({ key, data: data.result, error: "", progress: 100 });
          setCompletedRevision(revision);
        } else if (data.type === "progress")
          setState((s) => ({
            ...s,
            progress: Math.round((data.done / Math.max(1, data.total)) * 100),
          }));
        else {
          setState((s) => ({ ...s, key, error: data.message, progress: 0 }));
          setCompletedRevision(revision);
        }
      },
      () => {
        setState((s) => ({
          ...s,
          key,
          error:
            "Deduction could not finish. Review inputs and try Finish drawing again.",
          progress: 0,
        }));
        setCompletedRevision(revision);
      },
      revision !== completedRevision ? 0 : INPUT_IDLE_MS,
    );
  }, [key, paused, enabled, revision]);
  const current = state.key === key && completedRevision === revision;
  return {
    data: state.data,
    busy: enabled && !paused && !current,
    current,
    error: current ? state.error : "",
    progress: state.progress,
  };
}
