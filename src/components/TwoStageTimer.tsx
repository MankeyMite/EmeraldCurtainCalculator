import { useEffect, useRef, useState } from "react";
import {
  countdownTones,
  DEFAULT_TIMER_AUDIO,
  readTimerAudio,
  TIMER_AUDIO_KEY,
} from "../core/timerAudio";
import { countdownBeatGuide } from "../core/timerBeatGuide";
import { TimerBeatGuide } from "./TimerBeatGuide";

export function TwoStageTimer({
  first,
  second,
  firstCue,
  secondCue,
  onFirstCue,
  onStart,
  disabled = false,
}: {
  first: number;
  second: number;
  firstCue: string;
  secondCue: string;
  onFirstCue?: () => void;
  onStart?: () => void;
  disabled?: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(null),
    [stage, setStage] = useState(0),
    [error, setError] = useState("");
  const [beatGuide, setBeatGuide] = useState(() =>
    countdownBeatGuide(null, first, second),
  );
  const [audioSettings, setAudioSettings] = useState(() => {
    try {
      return readTimerAudio(window.localStorage);
    } catch {
      return { ...DEFAULT_TIMER_AUDIO };
    }
  });
  const context = useRef<AudioContext | null>(null),
    master = useRef<GainNode | null>(null),
    frame = useRef(0),
    started = useRef(0),
    end = useRef(0),
    wake = useRef<WakeLockSentinel | null>(null);
  const run = useRef(0);
  const timing = useRef({ first, second });
  const firstCueCallback = useRef(onFirstCue);
  firstCueCallback.current = onFirstCue;
  const stop = () => {
    run.current++;
    cancelAnimationFrame(frame.current);
    context.current?.close().catch(() => {});
    context.current = null;
    master.current = null;
    wake.current?.release().catch(() => {});
    wake.current = null;
    setRemaining(null);
    setStage(0);
    setBeatGuide(countdownBeatGuide(null, first, second));
  };
  useEffect(
    () => () => {
      run.current++;
      cancelAnimationFrame(frame.current);
      context.current?.close().catch(() => {});
      context.current = null;
      wake.current?.release().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(
        TIMER_AUDIO_KEY,
        JSON.stringify(audioSettings),
      );
    } catch {
      /* Audio still works if preference storage is unavailable. */
    }
    if (context.current && master.current)
      master.current.gain.setValueAtTime(
        audioSettings.volume / 100,
        context.current.currentTime,
      );
  }, [audioSettings]);
  useEffect(() => {
    if (timing.current.first !== first || timing.current.second !== second) {
      timing.current = { first, second };
      stop();
    }
  }, [first, second]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && context.current) {
        stop();
        setError(
          "Timer stopped because this page was hidden. Keep it visible and start again.",
        );
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const start = async () => {
    stop();
    setError("");
    const attempt = run.current;
    try {
      const cues = countdownTones(first, second, audioSettings.halfBeats),
        audio = new AudioContext();
      context.current = audio;
      await audio.resume();
      if (run.current !== attempt || context.current !== audio) return;
      const output = audio.createGain();
      output.gain.value = audioSettings.volume / 100;
      output.connect(audio.destination);
      master.current = output;
      onStart?.();
      const begin = audio.currentTime + 0.15;
      started.current = begin;
      end.current = begin + first + second;
      for (const cue of cues) {
        const oscillator = audio.createOscillator(),
          gain = audio.createGain();
        oscillator.frequency.value = cue.frequency;
        gain.gain.setValueAtTime(0, begin + cue.at);
        gain.gain.linearRampToValueAtTime(
          cue.amplitude,
          begin + cue.at + 0.004,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          begin + cue.at + cue.duration,
        );
        oscillator.connect(gain);
        gain.connect(output);
        oscillator.start(begin + cue.at);
        oscillator.stop(begin + cue.at + 0.22);
      }
      if (navigator.wakeLock)
        navigator.wakeLock
          .request("screen")
          .then((lock) => {
            if (context.current === audio) wake.current = lock;
            else lock.release();
          })
          .catch(() => {});
      setStage(0);
      setRemaining(first);
      setBeatGuide(countdownBeatGuide(0, first, second));
      let firstCueFired = false;
      const tick = () => {
        if (context.current !== audio) return;
        const now = audio.currentTime,
          currentStage = now < begin + first ? 0 : 1;
        if (currentStage === 1 && !firstCueFired) {
          firstCueFired = true;
          firstCueCallback.current?.();
        }
        setStage(currentStage);
        setBeatGuide(countdownBeatGuide(now - started.current, first, second));
        setRemaining(
          Math.min(
            currentStage === 0 ? first : second,
            Math.max(
              0,
              (currentStage === 0 ? begin + first : end.current) - now,
            ),
          ),
        );
        if (now < end.current + 0.8)
          frame.current = requestAnimationFrame(tick);
        else {
          stop();
          setStage(2);
          setBeatGuide(countdownBeatGuide(first + second, first, second));
        }
      };
      frame.current = requestAnimationFrame(tick);
    } catch (e) {
      // A cancelled start must not stop a newer countdown or report an error.
      if (run.current !== attempt) return;
      stop();
      setError(
        `Audio could not start. Check browser sound permission and try again. ${(e as Error).message}`,
      );
    }
  };
  return (
    <section className="starter-timer" aria-label="Two-stage audible timer">
      <p>
        {firstCue} at the first zero. {secondCue} at the second zero.
      </p>
      <div
        className="starter-clock"
        role="timer"
        aria-label={
          remaining === null
            ? stage === 2
              ? "Timer finished"
              : `Countdown starts at ${first.toFixed(1)} seconds`
            : `Stage ${stage + 1}: ${remaining.toFixed(1)} seconds`
        }
      >
        {(remaining ?? (stage === 2 ? 0 : first)).toFixed(1)}
      </div>
      <TimerBeatGuide state={beatGuide} />
      <p>
        {remaining !== null
          ? `Stage ${stage + 1} — ${stage === 0 ? firstCue : secondCue}`
          : "Four main beeps per stage. Act on the fourth beep, at zero. Keep this page visible."}
      </p>
      <button onClick={start} disabled={disabled}>
        {remaining === null ? "Start timer" : "Restart timer"}
      </button>
      {remaining !== null && <button onClick={stop}>Stop timer</button>}
      <details className="starter-audio-settings">
        <summary>Audio settings</summary>
        <label className="starter-volume">
          Volume
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={audioSettings.volume}
            onChange={(e) =>
              setAudioSettings((s) => ({
                ...s,
                volume: Number(e.target.value),
              }))
            }
          />
          <output>{audioSettings.volume}%</output>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={audioSettings.halfBeats}
            disabled={remaining !== null}
            onChange={(e) =>
              setAudioSettings((s) => ({ ...s, halfBeats: e.target.checked }))
            }
          />
          Quiet, lower-pitched half-second beats between the main beeps
        </label>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
