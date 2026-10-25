import { useEffect, useRef, useState } from "react";
import { countdownCues } from "../core/starterTiming";

export function TwoStageTimer({
  first,
  second,
  firstCue,
  secondCue,
  onFirstCue,
  onStart,
  startLabel = "Start audible countdown",
}: {
  first: number;
  second: number;
  firstCue: string;
  secondCue: string;
  onFirstCue?: () => void;
  onStart?: () => void;
  startLabel?: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null),
    [stage, setStage] = useState(0),
    [error, setError] = useState("");
  const context = useRef<AudioContext | null>(null),
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
    wake.current?.release().catch(() => {});
    wake.current = null;
    setRemaining(null);
    setStage(0);
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
      const cues = countdownCues(first, second),
        audio = new AudioContext();
      context.current = audio;
      await audio.resume();
      if (run.current !== attempt || context.current !== audio) return;
      onStart?.();
      const begin = audio.currentTime + 0.15;
      started.current = begin;
      end.current = begin + first + second;
      for (const cue of cues) {
        const oscillator = audio.createOscillator(),
          gain = audio.createGain();
        oscillator.frequency.value = cue.zero ? 1046 : 784;
        gain.gain.setValueAtTime(0, begin + cue.at);
        gain.gain.linearRampToValueAtTime(0.2, begin + cue.at + 0.004);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          begin + cue.at + (cue.zero ? 0.18 : 0.09),
        );
        oscillator.connect(gain);
        gain.connect(audio.destination);
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
        setRemaining(
          Math.max(0, (currentStage === 0 ? begin + first : end.current) - now),
        );
        if (now < end.current + 0.8)
          frame.current = requestAnimationFrame(tick);
        else {
          stop();
          setStage(2);
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
            ? "Timer stopped"
            : `Stage ${stage + 1}: ${remaining.toFixed(1)} seconds`
        }
      >
        {remaining === null
          ? stage === 2
            ? "Done"
            : "Ready"
          : remaining.toFixed(1)}
      </div>
      <p>
        {remaining !== null
          ? `Stage ${stage + 1} — ${stage === 0 ? firstCue : secondCue}`
          : "Four final beeps per stage. Act on the fourth beep, at zero. Keep this page visible."}
      </p>
      <button onClick={start}>
        {remaining === null ? startLabel : "Restart countdown"}
      </button>
      {remaining !== null && <button onClick={stop}>Stop countdown</button>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
