import { computeDeduction, type DeductionInput } from "../core/deduction";
self.onmessage = ({ data }: { data: DeductionInput }) => {
  try {
    const result = computeDeduction(data, (done, total) =>
      self.postMessage({ type: "progress", done, total }),
    );
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: (error as Error).message });
  }
};
