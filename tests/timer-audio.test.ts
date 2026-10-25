import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  countdownTones,
  DEFAULT_TIMER_AUDIO,
  readTimerAudio,
  TIMER_AUDIO_KEY,
} from "../src/core/timerAudio";
import { countdownCues } from "../src/core/starterTiming";
import { TwoStageTimer } from "../src/components/TwoStageTimer";

test("optional half-second beats preserve all eight main cues and both exact zeros", () => {
  for (const [first, second] of [
    [4, 4],
    [5, 20],
    [15, 15],
    [5, 20.34],
    [15, 7200],
  ]) {
    const plain = countdownTones(first, second, false),
      withBeats = countdownTones(first, second, true);
    assert.equal(plain.length, 8);
    assert.equal(withBeats.length, 14);
    assert.deepEqual(
      withBeats.filter((t) => !t.intermediate),
      plain,
    );
    assert.deepEqual(
      plain.map(({ stage, at, zero }) => ({ stage, at, zero })),
      countdownCues(first, second),
    );
    assert.deepEqual(
      withBeats.filter((t) => t.zero).map((t) => t.at),
      [first, first + second],
    );
    for (const beat of withBeats.filter((t) => t.intermediate)) {
      const before = plain.find(
        (t) => t.stage === beat.stage && Math.abs(t.at + 0.5 - beat.at) < 1e-9,
      )!;
      const after = plain.find(
        (t) => t.stage === beat.stage && Math.abs(t.at - 0.5 - beat.at) < 1e-9,
      )!;
      assert.ok(before && after);
      assert.ok(
        beat.frequency < before.frequency && beat.frequency < after.frequency,
      );
      assert.ok(beat.amplitude < before.amplitude / 2);
      assert.ok(beat.duration < 0.5);
    }
    assert.ok(withBeats.every((t, n) => !n || t.at >= withBeats[n - 1].at));
  }
  assert.throws(() => countdownTones(3, 20, true), /four seconds/);
});

test("audio preferences retain mute and optional beats, and tolerate missing or malformed saves", () => {
  assert.deepEqual(
    readTimerAudio({ getItem: () => null }),
    DEFAULT_TIMER_AUDIO,
  );
  const storage = new Map([
    [TIMER_AUDIO_KEY, JSON.stringify({ volume: 0, halfBeats: true })],
  ]);
  assert.deepEqual(
    readTimerAudio({ getItem: (key) => storage.get(key) ?? null }),
    { volume: 0, halfBeats: true },
  );
  assert.deepEqual(
    readTimerAudio({ getItem: () => "{broken" }),
    DEFAULT_TIMER_AUDIO,
  );
  assert.deepEqual(
    readTimerAudio({
      getItem: () => {
        throw Error("unavailable");
      },
    }),
    DEFAULT_TIMER_AUDIO,
  );
  assert.deepEqual(
    readTimerAudio({
      getItem: () => JSON.stringify({ volume: 200, halfBeats: "yes" }),
    }),
    { volume: 100, halfBeats: false },
  );
});

test("every shared timer starts with its configured number and a simple Start timer button", () => {
  for (const first of [5, 15, 20.34]) {
    const html = renderToStaticMarkup(
      createElement(TwoStageTimer, {
        first,
        second: 20,
        firstCue: "Reset",
        secondCue: "Confirm",
      }),
    );
    assert.match(
      html,
      new RegExp(`Countdown starts at ${first.toFixed(1)} seconds`),
    );
    assert.match(html, />Start timer<\/button>/);
    assert.match(html, /<summary>Audio settings<\/summary>/);
    assert.match(html, /type="range" min="0" max="100"/);
    assert.doesNotMatch(html, />Ready<|Start audible countdown/);
  }
});
