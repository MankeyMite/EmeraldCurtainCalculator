import { TIMER_BEAT_MARKS, type TimerBeatState } from "../core/timerBeatGuide";

export function TimerBeatGuide({ state }: { state: TimerBeatState }) {
  const x = (position: number) => 16 + position * 328;
  return (
    <svg
      className="starter-beat-guide"
      viewBox="0 0 360 66"
      role="img"
      aria-label="Visual beat guide: three, two, one, then press at zero. Quarter-second marks are small, half-second marks medium, and whole-second marks large."
      data-active={state.active}
      data-zero={state.zero}
    >
      <line className="starter-beat-axis" x1="16" y1="24" x2="344" y2="24" />
      {TIMER_BEAT_MARKS.map((mark, index) => (
        <g key={index}>
          <line
            className={
              mark.major
                ? "starter-beat-major"
                : mark.half
                  ? "starter-beat-half"
                  : "starter-beat-minor"
            }
            x1={x(mark.position)}
            x2={x(mark.position)}
            y1={mark.major ? 8 : mark.half ? 14 : 18}
            y2={mark.major ? 40 : mark.half ? 34 : 30}
          />
          {mark.label !== null && (
            <text
              x={x(mark.position)}
              y="59"
              textAnchor={mark.label === "0" ? "end" : "middle"}
            >
              {mark.label === "0" ? "0 · Press" : mark.label}
            </text>
          )}
        </g>
      ))}
      <circle
        className="starter-beat-dot"
        cx={x(state.progress)}
        cy="24"
        r={state.pulse ? 8 : 6}
      />
    </svg>
  );
}
