import { allowedValues } from "./constraints";
import type { Inference } from "./inference";
import { hex } from "./pokemon";
export function pidSummary(
  result: Pick<Inference, "pidCount" | "pidValues" | "masks">,
) {
  const digits = result.masks
    .slice(0, 8)
    .map((mask) => {
      const values = allowedValues(mask);
      return { digit: values.length === 1 ? hex(values[0], 1) : "?", values };
    })
    .reverse();
  return {
    count: result.pidCount,
    values: result.pidCount <= 100n ? result.pidValues : null,
    pattern: digits.map((d) => d.digit).join(""),
    digits,
  };
}
