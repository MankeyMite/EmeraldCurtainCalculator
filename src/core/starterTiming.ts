// GBA display clock: 16,777,216 cycles / 280,896 cycles per frame.
export const EMERALD_FPS = 16777216 / 280896;
export const STARTER_LANDING_RADIUS = 120;
export const STARTER_SEARCH_RADIUS = 100;
export const DEFAULT_STARTER_SEARCH_RADIUS = Math.ceil(EMERALD_FPS);
// In-game A+B+Start+Select reset on console or emulator. The former -254
// default was measured with an emulator reset that replayed the BIOS intro;
// it must not be applied to the in-game soft-reset procedure.
export const DEFAULT_STARTER_CALIBRATION = 0;
export type StarterTiming = {
  first: number;
  second: number;
  uncertainty: number;
  // SID intro delay, or a legacy starter adjustment. The starter UI displays
  // offset + calibration as its single calibration control.
  offset: number;
  calibration: number;
};
export const defaultIntroTiming = (): StarterTiming => ({
  first: 5,
  second: 20,
  uncertainty: 60,
  offset: 50,
  calibration: 0,
});
export const defaultStarterTiming = (): StarterTiming => ({
  first: 15,
  second: 15,
  uncertainty: DEFAULT_STARTER_SEARCH_RADIUS,
  offset: 0,
  calibration: DEFAULT_STARTER_CALIBRATION,
});
export function validateTiming(t: StarterTiming) {
  if (
    ![t.first, t.second].every(
      (n) => Number.isFinite(n) && n >= 4 && n <= 7200,
    ) ||
    ![t.uncertainty, t.offset, t.calibration].every(Number.isInteger) ||
    t.uncertainty < 0 ||
    t.uncertainty > 10000 ||
    Math.abs(t.offset) > 10000 ||
    Math.abs(t.calibration) > 10000
  )
    throw Error(
      "Use countdowns of at least four seconds and valid advance adjustments.",
    );
  return t;
}
export function estimatedSidWindow(t: StarterTiming) {
  validateTiming(t);
  // This is a hypothesis about the name-exit -> SID call gap, not a measured
  // count. Fade/extra calls are covered by the adjustable uncertainty/offset.
  const center = Math.round(t.second * EMERALD_FPS) + t.offset + t.calibration;
  return {
    minAdvance: Math.max(1, center - t.uncertainty),
    maxAdvance: Math.max(1, center + t.uncertainty),
  };
}
export function starterTargetFrame(t: StarterTiming) {
  validateTiming(t);
  return Math.max(
    0,
    Math.round(t.second * EMERALD_FPS) + t.offset + t.calibration,
  );
}
export function estimatedStarterWindow(t: StarterTiming) {
  const target = starterTargetFrame(t);
  const radius = Math.min(t.uncertainty, STARTER_SEARCH_RADIUS);
  // Stay centered on the displayed clock target. Neither a zero-result search
  // nor legacy settings may silently widen the scope back to frame zero.
  return {
    minAdvance: Math.max(0, target - radius),
    maxAdvance: target + radius,
  };
}
export function targetCountdown(
  advance: number,
  calibration: number,
  first = 15,
  offset = 0,
) {
  const second = (advance - calibration - offset) / EMERALD_FPS;
  if (
    !Number.isInteger(advance) ||
    advance < 0 ||
    !Number.isInteger(calibration) ||
    !Number.isInteger(offset) ||
    !Number.isFinite(second) ||
    second < 4 ||
    !Number.isFinite(first) ||
    first < 4
  )
    throw Error(
      "Choose a later target or reduce the calibration adjustment; four seconds are needed for the cues.",
    );
  return { first, second };
}
export function calibratedFrames(
  current: number,
  target: number,
  landed: number,
) {
  if (![current, target, landed].every(Number.isInteger))
    throw Error("Calibration requires whole RNG advances.");
  // A late result requires an earlier confirmation cue on the next attempt.
  return current + landed - target;
}

/** Vary the next starter without turning an intentional target change into
 * measured calibration. Keep the normal search radius and trainer timing. */
export function shiftStarterTarget(
  t: StarterTiming,
  advances = 20,
): StarterTiming {
  validateTiming(t);
  if (!Number.isInteger(advances))
    throw Error("Use a whole number of advances.");
  // Round the old target first so the displayed advance changes by exactly
  // the requested amount, even with a countdown rounded to hundredths.
  const next = {
    ...t,
    second:
      Math.round(
        ((Math.round(t.second * EMERALD_FPS) + advances) / EMERALD_FPS) * 100,
      ) / 100,
  };
  return validateTiming(next);
}
/** Four beeps for each stage; last exactly at that stage's zero. */
export function countdownCues(first: number, second: number) {
  if (![first, second].every((n) => Number.isFinite(n) && n >= 4))
    throw Error("Each stage needs at least four seconds.");
  return [first, first + second].flatMap((zero, stage) =>
    [3, 2, 1, 0].map((before) => ({
      stage,
      at: zero - before,
      zero: before === 0,
    })),
  );
}
