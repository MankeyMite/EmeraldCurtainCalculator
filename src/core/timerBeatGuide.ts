/** Four major beats, with three minor marks at quarter-second intervals. */
export const TIMER_BEAT_MARKS = Array.from({ length: 13 }, (_, index) => ({
  position: index / 12,
  major: index % 4 === 0,
  half: index % 4 === 2,
  label: index % 4 === 0 ? String(3 - index / 4) : null,
}));

const ZERO_HOLD_SECONDS = 0.18;

/** Elapsed time comes from the same Web Audio clock that schedules the tones.
 * Hold the first zero briefly so a display refresh cannot skip its press cue. */
export function countdownBeatGuide(
  elapsed: number | null,
  first: number,
  second: number,
) {
  if (elapsed === null)
    return { progress: 0, active: false, pulse: false, zero: false };
  const zeroAt = elapsed < first + ZERO_HOLD_SECONDS ? first : first + second;
  const remaining = zeroAt - elapsed;
  const active = remaining <= 3;
  const zero = remaining <= 0;
  return {
    progress: Math.max(0, Math.min(1, (3 - remaining) / 3)),
    active,
    pulse: active && (zero || Math.ceil(remaining) - remaining < 0.1),
    zero,
  };
}
export type TimerBeatState = ReturnType<typeof countdownBeatGuide>;
