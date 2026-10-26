import { preferBackupPokemon } from "../core/starterBackup";
import { useEffect, useMemo, useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { type StarterGuideState } from "../core/starterGuide";
import { itemPixels } from "../core/experiments";
import { actionPixels } from "../core/controlledExperiments";
import { StarterSidTimingOverview } from "./StarterSidTimingOverview";
import {
  rankSurvivingSidTimings,
  estimatedSidTargetAdvance,
  prioritizeStarterSidPixels,
  compareStarterSidExperiments,
  leadingSidPixelReason,
} from "../core/starterSidPriority";
import { controlledFacts } from "../core/controlledExperiments";
import { experimentSeconds } from "../core/nextSidStep";
import { ITEM_CATALOG } from "../core/experiments";
import { moveName } from "../core/moveLearningExperiments";
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
  backup = false,
  onBackup,
  backupAvailable = false,
  confirmationReady = true,
}: {
  lab: CurtainLab;
  state: StarterGuideState;
  onTraining: (id: string) => void;
  onMoreInfo: () => void;
  backup?: boolean;
  onBackup?: () => void;
  backupAvailable?: boolean;
  confirmationReady?: boolean;
}) {
  const [skip, setSkip] = useState<number[]>([]),
    [selected, setSelected] = useState<number | null>(null);
  const candidates =
      backup && (lab.sidAnalysis?.candidates.length ?? 0) > 4096
        ? undefined
        : lab.sidAnalysis?.candidates,
    sids = lab.sidAnalysis?.sidValues;
  const timing = useMemo(
    () =>
      rankSurvivingSidTimings(
        lab.sidRngRows ?? [],
        sids ?? [],
        estimatedSidTargetAdvance(state.intro),
      ),
    [lab.sidRngRows, sids, state.intro],
  );
  useEffect(() => {
    setSkip([]);
    setSelected(null);
  }, [lab.activeId]);
  const recheck = lab.pendingItemTest
    ? lab.activeSnapshot.itemTest?.recheckPixel
    : undefined;
  const activePriority = useMemo(
    () =>
      lab.pendingItemTest && candidates?.length
        ? prioritizeStarterSidPixels(
            candidates,
            { ...lab.identity, ...lab.activeSnapshot.knownFacts },
            (lab.starterQuestions ?? []).map((q) => q.index),
            timing,
          )
        : null,
    [
      lab.pendingItemTest,
      candidates,
      lab.identity,
      lab.activeSnapshot?.knownFacts,
      lab.starterQuestions,
      timing,
    ],
  );
  const rankedQuestions = activePriority
    ? [...(lab.starterQuestions ?? [])].sort((a, b) => {
        const rank = (index: number) => {
          const n = activePriority.targets.indexOf(index);
          return n < 0 ? Infinity : n;
        };
        return rank(a.index) - rank(b.index);
      })
    : backup && !candidates?.length && lab.pendingItemTest
      ? (lab.experimentTargets ?? []).map((index) => ({
          index,
          field: describeByte((index - 16) >> 1, lab.identity.pid).name,
        }))
      : (lab.starterQuestions ?? []);
  const available = [
    ...(recheck === undefined
      ? []
      : [
          {
            index: recheck,
            field: describeByte((recheck - 16) >> 1, lab.identity.pid).name,
          },
        ]),
    ...rankedQuestions.filter((q) => q.index !== recheck),
  ].filter(
    (q) =>
      !skip.includes(q.index) &&
      (!lab.pendingItemTest || lab.activeSnapshot.targets?.includes(q.index)),
  );
  const question = available.find((q) => q.index === selected) ?? available[0];
  const disabled =
    lab.analysisBusy || lab.drawingInProgress || !!lab.analysisError;
  const questionReason =
    question && !disabled
      ? leadingSidPixelReason(
          candidates ?? [],
          { ...lab.identity, ...lab.activeSnapshot.knownFacts },
          question.index,
          timing,
        )
      : "";
  const baselineReady =
    lab.starterHasDrawing ??
    (lab.itemTestBaseline?.observations ?? lab.obs)
      .slice(16, 176)
      .every((v) => v !== -1);
  const drawing = !lab.pendingItemTest && !lab.activeSnapshot?.itemTest;
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
      (!backup && !candidates?.length) ||
      (sids?.length ?? 0) < 2 ||
      (candidates?.length ?? 0) > 4096
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
          targets: candidates?.length
            ? [
                ...new Set(
                  candidates.flatMap((h) =>
                    itemPixels(h, e.item.id).map((p) => p.index),
                  ),
                ),
              ]
            : e.pixels.map((p) => p.index),
          facts: { ...lab.identity, ...base, heldItem: e.item.id },
          select: (targets: number[]) => lab.startItemTest(e.item.id, targets),
        })),
      ...lab.controlledExperiments
        .filter(
          (e) =>
            e.action.kind === "moves" ||
            (!backup &&
              e.action.kind === "ev" &&
              e.action.training?.vitamins === 0) ||
            (backup &&
              e.action.kind === "learn" &&
              /^teach-15(?:-|$)/.test(e.action.id)),
        )
        .map((e) => ({
          id: e.action.id,
          name: e.action.name,
          obtain: undefined,
          informationGain: e.informationGain,
          seconds: experimentSeconds(e.action),
          lastResort: e.action.training?.lastResort ?? false,
          targets: candidates?.length
            ? [
                ...new Set(
                  candidates.flatMap((h) =>
                    actionPixels(lab.itemTestBaseline, e.action, h).map(
                      (p) => p.index,
                    ),
                  ),
                ),
              ]
            : e.pixels.map((p) => p.index),
          facts: { ...lab.identity, ...controlledFacts(base, e.action) },
          select: (targets: number[]) =>
            e.action.kind === "ev"
              ? onTraining(e.action.id)
              : lab.startControlledTest(e.action.id, targets),
        })),
    ];
    return options
      .flatMap((e) => {
        if (!candidates?.length) {
          const domain = lab.domainQuestions[e.id];
          if (!backup || !domain || !e.targets.length) return [];
          const benefit = Math.max(
            0,
            Math.log2(
              domain.total /
                Math.max(domain.transparentCount, domain.blackCount, 1),
            ),
          );
          return [
            {
              ...e,
              targets: e.targets.filter((n) => n >= 80).slice(0, 4),
              benefit,
              reason:
                "This test helps narrow the backup Pokemon's PID and remaining SIDs.",
            },
          ];
        }
        const priority = prioritizeStarterSidPixels(
          candidates,
          e.facts,
          e.targets,
          timing,
        );
        return priority ? [{ ...e, ...priority }] : [];
      })
      .sort(compareStarterSidExperiments);
  }, [
    candidates,
    sids,
    backup,
    lab.domainQuestions,
    timing,
    lab.identity,
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
  const checkBackup =
    !!onBackup &&
    backupAvailable &&
    baselineReady &&
    !disabled &&
    !lab.pendingItemTest &&
    (sids?.length ?? 0) > 1 &&
    (!next ||
      preferBackupPokemon(
        next.id.startsWith("ev-") ? Number(next.id.split("-")[2]) : undefined,
      ));
  const alreadyChanged =
    recheck !== undefined ||
    lab.activeSnapshot?.itemTest?.action?.kind === "ev";
  const original = alreadyChanged
    ? lab.activeSnapshot.knownFacts
    : lab.itemTestBaseline.knownFacts;
  const originalSetup = [
    original.heldItem === 0
      ? "No held item."
      : original.heldItem === undefined
        ? "Keep the original held item."
        : `Hold ${ITEM_CATALOG.find((item) => item.id === original.heldItem)?.name ?? `item ${original.heldItem}`}.`,
    original.moves
      ? `Move order: ${original.moves.map((move) => (move === null ? "unknown" : move === 0 ? "empty" : moveName(move))).join(" / ")}.`
      : "Keep the original move order.",
  ].join(" ");
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
        Box the {backup ? "caught Pokémon" : "starter"} in{" "}
        <strong>Box 8, slot 5</strong>, with slots 4 and 6 empty. Enter Rustboro
        Trainer’s School. Reenter after every change.
      </p>
      <p role="status">
        {lab.drawingInProgress
          ? "Calculations paused. Choose Finish drawing when your curtain matches the game."
          : disabled
            ? "Updating candidates…"
            : sids
              ? `${sids.length} possible SID${sids.length === 1 ? "" : "s"} remain. All compatible PID/IV possibilities are retained.`
              : "Waiting for the starter and SID searches."}
      </p>
      <SidProgress
        sids={lab.analysisError ? undefined : sids}
        updating={lab.analysisBusy || lab.drawingInProgress}
      />
      <StarterSidTimingOverview value={timing} updating={disabled} />
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
          <button onClick={onMoreInfo}>Update battle log and moves</button>
        )}
      {lab.pendingItemTest && (
        <div className="starter-notice">
          <strong>{lab.activeSnapshot.name}</strong>
          <p>
            {alreadyChanged ? "Current" : "Starting"} setup: {originalSetup}
          </p>
          <p>
            {recheck !== undefined
              ? "Keep this setup, reenter the school and check the highlighted pixel again."
              : (lab.activeSnapshot.itemTest?.action?.instructions ??
                `Give the starter ${ITEM_CATALOG.find((item) => item.id === lab.activeSnapshot.knownFacts.heldItem)?.name ?? "the selected test item"} while boxed. Reenter the school and inspect the highlighted pixels. Keep this item and move order for the next experiment.`)}
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
          Current setup: {originalSetup} Keep it for the next experiment.
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
      {sids?.length === 1 &&
        confirmationReady &&
        !disabled &&
        (!backup || lab.sidRngResult?.exact !== false) && (
          <div className="starter-success">
            <strong>
              One SID matches: {sids[0]} · 0x
              {sids[0].toString(16).toUpperCase().padStart(4, "0")}
            </strong>
            <p>
              This result uses your recorded observations, EV log and selected
              RNG window. Choose Next to find shiny targets.
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
            editable={drawing}
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
          <h3>{drawing ? "Draw your curtains" : "SID Pixel Guide"}</h3>
          {drawing && (
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
                {questionReason && <p className="help">{questionReason}</p>}
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
          {checkBackup && (
            <>
              <h4>Next: check your second Pokémon</h4>
              <p>
                Try its curtain and simple item or move tests before training a
                stat above 5 EVs.
              </p>
              <button onClick={onBackup}>Check second Pokémon</button>
            </>
          )}
          {!checkBackup &&
            !lab.pendingItemTest &&
            baselineReady &&
            !disabled &&
            next && (
              <>
                <h4>Next: {next.name}</h4>
                {next.obtain && <p>{next.obtain}</p>}
                <p>
                  {next.id.startsWith("ev-")
                    ? "Log the training battles and update any changed moves before the next curtain reading."
                    : `Current setup: ${originalSetup} This test can distinguish remaining SIDs.`}
                </p>
                {next.reason && <p className="help">{next.reason}</p>}
                <button onClick={() => next.select(next.targets)}>
                  Try this experiment
                </button>
              </>
            )}
          {!checkBackup &&
            !lab.pendingItemTest &&
            baselineReady &&
            !disabled &&
            !next &&
            sids &&
            sids.length > 1 && (
              <>
                <p>
                  No supported experiment can separate these SIDs with the
                  recorded setup. Check the battle log and moves for missing
                  information.
                </p>
                <button onClick={onMoreInfo}>
                  {backup
                    ? "Check Pokemon details"
                    : "Check battle log and moves"}
                </button>
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
