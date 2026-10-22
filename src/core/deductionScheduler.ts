export const INPUT_IDLE_MS = 450;
export const DEDUCTION_TIMEOUT_MS = 60_000;
/** Cancel both pending input debounce and a running job. A disposed job can
 * never publish a late result or progress event over a newer drawing. */
export function scheduleDeduction<T>(
  input: T,
  create: () => Worker,
  message: (event: MessageEvent) => void,
  error: (message?: string) => void,
  delay = INPUT_IDLE_MS,
) {
  let alive = true,
    worker: Worker | undefined,
    watchdog: ReturnType<typeof setTimeout> | undefined;
  const fail = (message?: string) => {
    if (!alive) return;
    alive = false;
    clearTimeout(watchdog);
    worker?.terminate();
    error(message);
  };
  const timer = setTimeout(() => {
    if (!alive) return;
    try {
      worker = create();
      worker.onmessage = (event) => {
        if (alive) {
          message(event);
          if (event.data?.type === "result" || event.data?.type === "error") {
            alive = false;
            clearTimeout(watchdog);
            worker?.terminate();
          }
        }
      };
      worker.onerror = () => fail();
      watchdog = setTimeout(
        () =>
          fail(
            "Calculation exceeded 60 seconds and was stopped. No partial result was applied; your drawing is preserved. Narrow or turn off RNG limits, or review the inputs, then try Finish drawing again.",
          ),
        DEDUCTION_TIMEOUT_MS,
      );
      worker.postMessage(input);
    } catch {
      fail();
    }
  }, delay);
  return () => {
    alive = false;
    clearTimeout(timer);
    clearTimeout(watchdog);
    worker?.terminate();
  };
}
