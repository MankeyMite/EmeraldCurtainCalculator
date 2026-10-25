import { countdownCues } from "./starterTiming";

export const TIMER_AUDIO_KEY = "emerald-countdown-audio-v1";
export const DEFAULT_TIMER_AUDIO = { volume: 100, halfBeats: false };
export type TimerAudioSettings = typeof DEFAULT_TIMER_AUDIO;

export function readTimerAudio(
  storage: Pick<Storage, "getItem">,
): TimerAudioSettings {
  try {
    const value = JSON.parse(storage.getItem(TIMER_AUDIO_KEY) ?? "null");
    return {
      volume:
        typeof value?.volume === "number" && Number.isFinite(value.volume)
          ? Math.max(0, Math.min(100, value.volume))
          : DEFAULT_TIMER_AUDIO.volume,
      halfBeats:
        typeof value?.halfBeats === "boolean"
          ? value.halfBeats
          : DEFAULT_TIMER_AUDIO.halfBeats,
    };
  } catch {
    return { ...DEFAULT_TIMER_AUDIO };
  }
}

/** Schedule on the audio clock; extra beats never move a stage's zero cue. */
export function countdownTones(
  first: number,
  second: number,
  halfBeats: boolean,
) {
  const main = countdownCues(first, second).map((cue) => ({
    ...cue,
    intermediate: false,
    frequency: cue.zero ? 1046 : 784,
    amplitude: 0.2,
    duration: cue.zero ? 0.18 : 0.09,
  }));
  return main
    .flatMap((tone) => [
      tone,
      ...(halfBeats && !tone.zero
        ? [
            {
              ...tone,
              at: tone.at + 0.5,
              intermediate: true,
              frequency: 392,
              amplitude: 0.045,
              duration: 0.04,
            },
          ]
        : []),
    ])
    .sort((a, b) => a.at - b.at);
}
