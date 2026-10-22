import type { Observation } from "./constraints";

/** Display defaults are not evidence. Only painting or completing a drawing
 * records them. Finish confirms visible automatic pixels only for a full
 * baseline; experiment references are never silently recorded as answers. */
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
