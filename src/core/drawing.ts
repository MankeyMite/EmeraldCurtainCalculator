import type { Observation } from "./constraints";

/** Display defaults are not evidence. Only painting or completing a drawing
 * records them; automatic pixels and experiment references remain separate. */
export function drawingPixelState(
  observed: Observation,
  predicted: Observation = -1,
  reference: Observation = -1,
): 0 | 1 {
  return observed !== -1
    ? observed
    : predicted !== -1
      ? predicted
      : reference !== -1
        ? reference
        : 0;
}

export function toggleDrawingPixel(
  observed: Observation,
  predicted: Observation = -1,
  reference: Observation = -1,
): 0 | 1 {
  return drawingPixelState(observed, predicted, reference) === 1 ? 0 : 1;
}
