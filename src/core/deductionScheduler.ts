export const INPUT_IDLE_MS = 450;
/** Cancel both pending input debounce and a running job. A disposed job can
 * never publish a late result or progress event over a newer drawing. */
export function scheduleDeduction<T>(
  input: T,
  create: () => Worker,
  message: (event: MessageEvent) => void,
  error: () => void,
  delay = INPUT_IDLE_MS,
) {
  let alive = true,
    worker: Worker | undefined;
  const timer = setTimeout(() => {
    if (!alive) return;
    try {
      worker = create();
      worker.onmessage = (event) => {
        if (alive) {
          message(event);
          if (event.data?.type === "result" || event.data?.type === "error") {
            alive = false;
            worker?.terminate();
          }
        }
      };
      worker.onerror = () => {
        if (alive) error();
        alive = false;
        worker?.terminate();
      };
      worker.postMessage(input);
    } catch {
      if (alive) error();
      alive = false;
      worker?.terminate();
    }
  }, delay);
  return () => {
    alive = false;
    clearTimeout(timer);
    worker?.terminate();
  };
}
