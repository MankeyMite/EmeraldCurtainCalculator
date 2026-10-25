import { useEffect, useRef, useState } from "react";
export function useStarterTask<T>() {
  const worker = useRef<Worker | null>(null);
  const [result, setResult] = useState<T | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => () => worker.current?.terminate(), []);
  const clear = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setResult(null);
    setError("");
  };
  const run = (request: unknown) => {
    clear();
    setBusy(true);
    try {
      const w = new Worker(
        new URL("../workers/starter.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (worker.current !== w) return;
        setBusy(false);
        if (data.error) setError(data.error);
        else setResult(data.result);
        w.terminate();
        worker.current = null;
      };
      w.onerror = () => {
        if (worker.current !== w) return;
        setBusy(false);
        setError(
          "The calculation stopped. Try again or narrow the search window.",
        );
        w.terminate();
        worker.current = null;
      };
      w.postMessage(request);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  };
  return { result, busy, error, run, clear };
}
