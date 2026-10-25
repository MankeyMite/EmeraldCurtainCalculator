import { useEffect, useMemo, useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { usefulStarterPixels } from "../core/starterRoute";
import { type StarterGuideState } from "../core/starterGuide";
import { controlledFacts } from "../core/controlledExperiments";
import { compareSidSteps, experimentSeconds } from "../core/nextSidStep";
import { emptyObservations } from "../core/constraints";
import { speciesTraits } from "../core/traits";
import { describeByte } from "../core/inspection";
import { PixelGrid } from "./PixelGrid";
import { stripLayout } from "./WorkbenchData";
import { SidPixelQuestion, curtainLocation } from "./SidPixelQuestion";
import { GuideImage } from "./StarterGuideParts";
import { SidProgress } from "./SidProgress";
import {
  STARTER_ITEM_IDS,
  starterItemSource,
  starterItemCost,
} from "../core/starterItems";

export function StarterCurtainStep({
  lab,
  state,
  onTraining,
  onMoreInfo,
}: {
  lab: CurtainLab;
  state: StarterGuideState;
  onTraining: (id: string) => void;
  onMoreInfo: () => void;
}) {
  const [skip, setSkip] = useState<number[]>([]),
    [selected, setSelected] = useState<number | null>(null);
  const candidates = lab.sidAnalysis?.candidates,
    sids = lab.sidAnalysis?.sidValues;
  useEffect(() => {
    setSkip([]);
    setSelected(null);
  }, [lab.activeId]);
  const recheck = lab.pendingItemTest
    ? lab.activeSnapshot.itemTest?.recheckPixel
    : undefined;
  const available = [
    ...(recheck === undefined
      ? []
      : [
          {
            index: recheck,
            field: describeByte((recheck - 16) >> 1, lab.identity.pid).name,
          },
        ]),
    ...(lab.starterQuestions ?? []).filter((q) => q.index !== recheck),
  ].filter(
    (q) =>
      !skip.includes(q.index) &&
      (!lab.pendingItemTest || lab.activeSnapshot.targets?.includes(q.index)),
  );
  const question = available.find((q) => q.index === selected) ?? available[0];
  const disabled =
    lab.analysisBusy || lab.drawingInProgress || !!lab.analysisError;
  const baselineReady = (lab.itemTestBaseline?.observations ?? lab.obs)
    .slice(16, 176)
    .every((v) => v !== -1);
  const layout = stripLayout();
  const answer = (value: 0 | 1) => {
    if (!question || disabled) return;
    if (lab.pendingItemTest) lab.answerTarget(question.index, value);
    else lab.observePixel(question.index, value);
    setSelected(null);
  };
  const options = useMemo(() => {
    if (
      lab.drawingInProgress ||
      lab.analysisBusy ||
      lab.analysisError ||
      lab.pendingItemTest ||
      !candidates?.length ||
      new Set(candidates.map((h) => h.sid)).size < 2 ||
      candidates.length > 4096
    )
      return [];
    const base = lab.itemTestBaseline.knownFacts;
    const options = [
      ...lab.experiments
        .filter(
          (e) =>
            STARTER_ITEM_IDS.includes(e.item.id) &&
            !state.usedTms?.includes(e.item.id) &&
            e.item.id !== base.heldItem,
        )
        .map((e) => ({
          id: `item-${e.item.id}`,
          name: `Hold ${e.item.name}`,
          obtain: state.route?.items?.includes(e.item.id)
            ? undefined
            : starterItemSource(e.item.id)!.instruction,
          informationGain: e.informationGain,
          seconds:
            30 +
            (state.route?.items?.includes(e.item.id)
              ? 0
              : starterItemCost([e.item.id]).seconds),
          lastResort: false,
          targets: e.pixels.map((p) => p.index),
          facts: { ...lab.identity, ...base, heldItem: e.item.id },
          select: (targets: number[]) => lab.startItemTest(e.item.id, targets),
        })),
      ...lab.controlledExperiments
        .filter(
          (e) =>
            e.action.kind === "moves" ||
            (e.action.kind === "ev" && e.action.training?.vitamins === 0),
        )
        .map((e) => ({
          id: e.action.id,
          name: e.action.name,
          obtain: undefined,
          informationGain: e.informationGain,
          seconds: experimentSeconds(e.action),
          lastResort: e.action.training?.lastResort ?? false,
          targets: e.pixels.map((p) => p.index),
          facts: { ...lab.identity, ...controlledFacts(base, e.action) },
          select: (targets: number[]) =>
            e.action.kind === "ev"
              ? onTraining(e.action.id)
              : lab.startControlledTest(e.action.id, targets),
        })),
    ];
    return options
      .flatMap((e) => {
        const useful = usefulStarterPixels(
          candidates,
          e.facts,
          emptyObservations(),
        ).filter((q) => e.targets.includes(q.index));
        if (!useful.length) return [];
        const q = useful[0];
        return [
          {
            ...e,
            targets: useful.slice(0, 4).map((q) => q.index),
            worstCase: q.worstCase,
            informationGain: Math.log2(
              q.total /
                Math.max(
                  1,
                  (q.transparent * q.transparent + q.black * q.black) /
                    (q.transparent + q.black),
                ),
            ),
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(a.lastResort) - Number(b.lastResort) || compareSidSteps(a, b),
      );
  }, [
    candidates,
    lab.experiments,
    lab.controlledExperiments,
    lab.itemTestBaseline,
    lab.pendingItemTest,
    state.route?.items,
    state.usedTms,
    lab.drawingInProgress,
    lab.analysisBusy,
    lab.analysisError,
  ]);
  const next = options[0];
  const conflict =
    !lab.drawingInProgress && !lab.analysisBusy
      ? [...lab.assistance.contradictions][0]
      : undefined;
  return (
    <>
      <div className="starter-guide-images">
        <GuideImage
          name="box-placement"
          caption="Box 8: starter in slot 5, with slots 4 and 6 empty."
        />
        <GuideImage
          name="trainer-school"
          caption="Rustboro Trainer’s School: inspect these curtains."
        />
      </div>
      <p>
        Box the starter in <strong>Box 8, slot 5</strong>, with slots 4 and 6
        empty. Enter Rustboro Trainer’s School. Reenter after every change.
      </p>
      <p role="status">
        {lab.drawingInProgress
          ? "Calculations paused. Choose Finish drawing when your curtain matches the game."
          : disabled
            ? "Updating candidates…"
            : sids
              ? `${sids.length} possible SID${sids.length === 1 ? "" : "s"} remain. All matching PID/IV spreads are retained.`
              : "Waiting for the starter and SID searches."}
      </p>
      <SidProgress
        sids={lab.analysisError ? undefined : sids}
        updating={lab.analysisBusy || lab.drawingInProgress}
      />
      {lab.analysisError && <p role="alert">{lab.analysisError}</p>}
      {sids?.length === 0 && !disabled && (
        <p role="alert">
          No SID matches the saved evidence. Check the recorded Pokémon
          information and drawing before changing the timing window.
        </p>
      )}
      {conflict !== undefined && (
        <p role="alert">
          At {curtainLocation(conflict)}, the drawing is{" "}
          {lab.obs[conflict] === 1 ? "Black" : "Transparent"}, but the entered{" "}
          {describeByte((conflict - 16) >> 1, lab.identity.pid).name}{" "}
          information predicts{" "}
          {lab.predictions[conflict] === 0 ? "Transparent" : "Black"}. Check the
          Pokémon’s information before changing what you drew.
        </p>
      )}
      {!lab.pendingItemTest &&
        !lab.drawingInProgress &&
        (sids?.length === 0 || conflict !== undefined) && (
          <button onClick={onMoreInfo}>Check battle log and moves</button>
        )}
      {lab.pendingItemTest && (
        <div className="starter-notice">
          <strong>{lab.activeSnapshot.name}</strong>
          <p>
            {lab.activeSnapshot.itemTest?.action?.instructions ??
              `Change the held item to the selected test item while boxed. Inspect the highlighted pixels, then restore the original item.`}
          </p>
          <button onClick={lab.cancelItemTest}>Cancel this experiment</button>
          <button
            onClick={lab.saveVerifiedTargets}
            disabled={!lab.obs.some((v) => v !== -1) || disabled}
          >
            Keep verified answers and finish this test
          </button>
        </div>
      )}
      {!lab.pendingItemTest && lab.lastCompletedItemTest && (
        <p className="starter-notice">
          Restore the original held item and move order before another test. The
          app restored the baseline drawing only.
        </p>
      )}
      {lab.canUndoExperimentAnswer && (
        <button
          disabled={lab.analysisBusy || lab.drawingInProgress}
          onClick={lab.undoLastExperimentAnswer}
        >
          Undo last experiment answer
        </button>
      )}
      {sids?.length === 1 && !disabled && (
        <div className="starter-success">
          <strong>
            One SID matches: {sids[0]} · 0x
            {sids[0].toString(16).toUpperCase().padStart(4, "0")}
          </strong>
          <p>
            This result uses your recorded observations, EV log and selected RNG
            window. Choose Next to find shiny targets.
          </p>
        </div>
      )}
      <div className="starter-curtain-layout">
        <div className="starter-curtain-view">
          <PixelGrid
            canvasRef={lab.canvasRef}
            placements={layout.placements}
            bounds={layout.bounds}
            zoom={20}
            grid
            annotated={false}
            gameBackground
            mainOnly
            solver
            editable={!lab.pendingItemTest}
            memory={lab.memory}
            observations={lab.obs}
            referenceObservations={lab.referenceObservations}
            contradictions={lab.assistance.contradictions}
            predictions={lab.predictions}
            targets={lab.pendingItemTest && question ? [question.index] : []}
            highlightedNibble={lab.pendingItemTest ? question?.index : null}
            onHover={() => {}}
            onSelect={(hit) => {
              if (available.some((q) => q.index === hit.nibble))
                setSelected(hit.nibble);
            }}
            onStart={lab.start}
            onPaint={lab.paint}
            onEnd={lab.finish}
          />
        </div>
        <section aria-label="SID Pixel Guide">
          <h3>
            {lab.pendingItemTest ? "SID Pixel Guide" : "Draw your curtains"}
          </h3>
          {!lab.pendingItemTest && (
            <>
              <p>
                Click or drag to copy the black pixels you see. Click a black
                pixel again to make it transparent.
              </p>
              <p>
                Marked boxes are pre-drawn based on your Pokémon’s known
                information. Correct any that don’t match the game.
              </p>
              <p>
                Choose Finish drawing to confirm the whole pattern and calculate
                SID possibilities.
              </p>
              <button
                disabled={lab.analysisBusy && !lab.drawingInProgress}
                onClick={lab.completeDrawing}
              >
                Finish drawing
              </button>
              <button
                disabled={!lab.canUndo || !!lab.pendingItemTest}
                onClick={lab.undoStroke}
              >
                Undo
              </button>
            </>
          )}
          {lab.pendingItemTest &&
            (question ? (
              <>
                <SidPixelQuestion
                  target={{ nibble: question.index, field: question.field }}
                  disabled={disabled}
                  onAnswer={answer}
                />
                <button
                  disabled={disabled}
                  onClick={() => {
                    setSkip([...skip, question.index]);
                    setSelected(null);
                  }}
                >
                  Cannot see this pixel
                </button>
              </>
            ) : !disabled ? (
              <p>
                No further useful pixels are established for this checkpoint.
              </p>
            ) : (
              <p>Finding useful questions…</p>
            ))}
          {!lab.pendingItemTest && baselineReady && !disabled && next && (
            <>
              <h4>Next: {next.name}</h4>
              {next.obtain && <p>{next.obtain}</p>}
              <p>
                {next.id.startsWith("ev-")
                  ? "Log the training battles and update any changed moves before the next curtain reading."
                  : "Start from the current original setup. This test can distinguish remaining SIDs."}
              </p>
              <button onClick={() => next.select(next.targets)}>
                Try this experiment
              </button>
            </>
          )}
          {!lab.pendingItemTest &&
            baselineReady &&
            !disabled &&
            !next &&
            sids &&
            sids.length > 1 && (
              <>
                <p>
                  Check the battle log and current moves before another curtain
                  reading.
                </p>
                <button onClick={onMoreInfo}>Check battle log and moves</button>
              </>
            )}
          {lab.pendingItemTest && !!skip.length && (
            <button onClick={() => setSkip([])}>
              Show skipped pixels again
            </button>
          )}
        </section>
      </div>
      <details>
        <summary>Review recorded pixels</summary>
        {lab.obs.flatMap((v, index) =>
          v === -1 || index < 16 || index >= 176
            ? []
            : [
                <label key={index}>
                  {curtainLocation(index)}
                  <select
                    value={v}
                    onChange={(e) =>
                      lab.pendingItemTest
                        ? lab.answerTarget(
                            index,
                            Number(e.target.value) as -1 | 0 | 1,
                          )
                        : lab.observePixel(
                            index,
                            Number(e.target.value) as -1 | 0 | 1,
                          )
                    }
                  >
                    <option value={-1}>Unanswered</option>
                    <option value={0}>Transparent</option>
                    <option value={1}>Black</option>
                  </select>
                </label>,
              ],
        )}
      </details>
      <p className="help">
        Transparent means the window artwork shows through. Blue outlines are
        predictions; painting records what you actually see.
      </p>
    </>
  );
}
