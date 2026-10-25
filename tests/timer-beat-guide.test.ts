import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  countdownBeatGuide,
  TIMER_BEAT_MARKS,
} from "../src/core/timerBeatGuide";
import { countdownTones } from "../src/core/timerAudio";
import { TimerBeatGuide } from "../src/components/TimerBeatGuide";

test("four large marks have three quarter-second marks between adjacent beats", () => {
  const majors = TIMER_BEAT_MARKS.filter((m) => m.major);
  assert.deepEqual(
    majors.map((m) => m.label),
    ["3", "2", "1", "0"],
  );
  assert.equal(TIMER_BEAT_MARKS.length, 13);
  TIMER_BEAT_MARKS.forEach((mark, index) => {
    const state = countdownBeatGuide(2 + index / 4, 5, 20);
    assert.ok(Math.abs(state.progress - mark.position) < 1e-10);
  });
  for (let n = 0; n < 3; n++)
    assert.equal(
      TIMER_BEAT_MARKS.filter(
        (m) =>
          !m.major &&
          m.position > majors[n].position &&
          m.position < majors[n + 1].position,
      ).length,
      3,
    );
});

test("visual positions coincide with each audio-clock beep in both stages, independent of optional beats", () => {
  for (const [first, second] of [
    [4, 4],
    [5, 20],
    [15, 15],
    [5, 20.34],
    [15, 7200],
  ])
    for (const half of [false, true]) {
      const tones = countdownTones(first, second, half).filter(
        (t) => !t.intermediate,
      );
      tones.forEach((tone, n) => {
        const state = countdownBeatGuide(tone.at, first, second);
        assert.ok(Math.abs(state.progress - (n % 4) / 3) < 1e-10);
        assert.equal(state.active, true);
        assert.equal(state.pulse, true);
        assert.equal(state.zero, tone.zero);
      });
    }
});

test("movement is linear between beats, holds the first zero, and resets for stage two", () => {
  const first = 5,
    second = 20;
  assert.deepEqual(countdownBeatGuide(null, first, second), {
    progress: 0,
    active: false,
    pulse: false,
    zero: false,
  });
  assert.equal(countdownBeatGuide(1, first, second).active, false);
  for (let n = 0; n <= 12; n++)
    assert.ok(
      Math.abs(countdownBeatGuide(2 + n / 4, first, second).progress - n / 12) <
        1e-10,
    );
  assert.equal(countdownBeatGuide(5.1, first, second).progress, 1);
  assert.equal(countdownBeatGuide(5.1, first, second).zero, true);
  assert.equal(countdownBeatGuide(5.2, first, second).progress, 0);
  assert.equal(countdownBeatGuide(5.2, first, second).active, false);
  assert.equal(countdownBeatGuide(25.8, first, second).progress, 1);
  assert.equal(countdownBeatGuide(25.8, first, second).zero, true);
});

test("the scale is one responsive SVG with a dot at the current beat position", () => {
  const html = renderToStaticMarkup(
    createElement(TimerBeatGuide, { state: countdownBeatGuide(4, 5, 20) }),
  );
  assert.equal((html.match(/class="starter-beat-major"/g) ?? []).length, 4);
  assert.equal((html.match(/class="starter-beat-half"/g) ?? []).length, 3);
  assert.equal((html.match(/class="starter-beat-minor"/g) ?? []).length, 6);
  assert.match(html, /cx="234\.666/);
  assert.match(html, /then press at zero/);
  assert.match(html, /data-active="true"/);
});
