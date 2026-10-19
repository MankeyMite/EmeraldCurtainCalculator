import { useEffect, useState } from "react";
import type { RngSettings } from "../core/rng";
import type { RngSearchInput, RngSearchResult } from "../core/rngSearch";
export function useWildRng(
  settings: RngSettings | undefined,
  eligible: boolean,
  evidence: Omit<RngSearchInput, "settings">,
  signature: string,
) {
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify({ settings, eligible, signature, revision });
  const [state, setState] = useState<{
    key: string;
    result: RngSearchResult | null;
    error: string;
    progress: number;
  }>({ key: "", result: null, error: "", progress: 0 });
  useEffect(() => {
    if (!settings || !eligible) return;
    const worker = new Worker(
      new URL("../workers/rng.worker.ts", import.meta.url),
      { type: "module" },
    );
    setState({ key, result: null, error: "", progress: 0 });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress")
        setState((s) => ({
          ...s,
          progress: Math.round((data.done / data.total) * 100),
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
          "The RNG search could not run. Try again or use a smaller range.",
        progress: 0,
      });
      worker.terminate();
    };
    const timer = setTimeout(
      () => worker.postMessage({ ...evidence, settings }),
      300,
    );
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [key]);
  const current = state.key === key;
  return {
    retry: () => setRevision((r) => r + 1),
    result: settings && eligible && current ? state.result : null,
    error: settings && eligible && current ? state.error : "",
    busy: !!(
      settings &&
      eligible &&
      (!current || (!state.result && !state.error))
    ),
    progress: current ? state.progress : 0,
  };
}
