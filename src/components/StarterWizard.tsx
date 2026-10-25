import { useEffect, useMemo, useRef, useState } from "react";
import { useCurtainLab } from "../hooks/useCurtainLab";
import { useStarterTask } from "../hooks/useStarterTask";
import {
  GUIDE_KEY,
  GUIDE_LAB_KEY,
  newStarterGuide,
  newStarterAttempt,
  newShinyAttempt,
  validateStarterGuide,
  battleEvs,
  checkStarterRoute,
  readingSnapshots,
  starterSettings,
  creationMoves,
  starterAbility,
  matchStarterAttempt,
  guideSidCandidates,
  type StarterGuideState,
  type RouteSetup,
  type StarterReading,
} from "../core/starterGuide";
import {
  calibratedFrames,
  estimatedSidWindow,
  targetCountdown,
  STARTER_LANDING_RADIUS,
  shiftStarterTarget,
} from "../core/starterTiming";
import type { StarterOutlookTask } from "../core/starterOutlook";
import { routeCheckpoint } from "../core/starterRoute";
import { starterEvsNeedCorrection } from "../core/starterEvidence";
import {
  patchStarterGuide,
  starterTravelReady,
} from "../core/starterChecklist";
import { validateSummaryStats, summaryFromDraft } from "../core/stats";
import { speciesTraits } from "../core/traits";
import { moveName } from "../core/moveLearningExperiments";
import { ITEM_CATALOG } from "../core/experiments";
import type { RngSpread } from "../core/rng";
import { TwoStageTimer } from "./TwoStageTimer";
import {
  GuideImage,
  TimingOptions,
  StarterTraitsForm,
  BattleLog,
  ReadingInputs,
  StarterSpreadTable,
  StarterSearchResults,
  StarterTargetWindow,
  StarterTravelChecklist,
} from "./StarterGuideParts";
import { StarterCurtainStep } from "./StarterCurtainStep";
import { StarterOutlook } from "./StarterOutlook";
import names from "../data/named-facts.json";
import {
  GUIDE_RESET_BACKUP_KEY,
  resetGuideProgress,
  restoreGuideProgress,
} from "../core/starterGuideStorage";

const STEPS = [
  "Generate TID/SID",
  "Identify your starter",
  "Prepare the Rustboro route",
  "Discover SID from curtains",
  "Choose a shiny starter",
  "Hit and calibrate the target",
];
const searchKey = (s: StarterGuideState) =>
  JSON.stringify([
    s.species,
    s.nature,
    s.gender,
    s.ability,
    s.readings,
    s.starter,
    s.identifiedStarter,
  ]);
const routeKey = (s: StarterGuideState) =>
  JSON.stringify([
    searchKey(s),
    s.tid,
    s.intro,
    s.battles,
    s.evsKnown,
    s.moves,
  ]);

export function StarterWizard({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState(0);
  const [resetError, setResetError] = useState("");
  const [canUndoReset, setCanUndoReset] = useState(() => {
    try {
      return (
        typeof window !== "undefined" &&
        !!window.localStorage.getItem(GUIDE_RESET_BACKUP_KEY)
      );
    } catch {
      return false;
    }
  });
  const reset = (current: StarterGuideState) => {
    try {
      resetGuideProgress(window.localStorage, current);
      setCanUndoReset(true);
      setResetError("");
      setSession((n) => n + 1);
    } catch {
      setResetError(
        "The guide could not be reset. Your saved progress is retained.",
      );
    }
  };
  const undoReset = () => {
    try {
      restoreGuideProgress(window.localStorage);
      setCanUndoReset(false);
      setResetError("");
      setSession((n) => n + 1);
    } catch (error) {
      setResetError((error as Error).message);
    }
  };
  // Remounting cancels timers, in-flight workers and pending autosave writes.
  return (
    <StarterGuideSession
      key={session}
      onExit={onExit}
      onReset={reset}
      onUndoReset={undoReset}
      canUndoReset={canUndoReset}
      resetError={resetError}
    />
  );
}

function StarterGuideSession({
  onExit,
  onReset,
  onUndoReset,
  canUndoReset,
  resetError,
}: {
  onExit: () => void;
  onReset: (state: StarterGuideState) => void;
  onUndoReset: () => void;
  canUndoReset: boolean;
  resetError: string;
}) {
  const lab = useCurtainLab(GUIDE_LAB_KEY);
  const [state, setState] = useState<StarterGuideState>(() => {
    try {
      const saved =
        typeof window !== "undefined" && window.localStorage.getItem(GUIDE_KEY);
      return saved
        ? validateStarterGuide(JSON.parse(saved))
        : newStarterGuide();
    } catch {
      return newStarterGuide();
    }
  });
  const [error, setError] = useState(""),
    [saveError, setSaveError] = useState(""),
    [searched, setSearched] = useState("");
  const [page, setPage] = useState(0),
    [plannedKey, setPlannedKey] = useState(""),
    [attemptResult, setAttemptResult] = useState<RngSpread[] | null>(null),
    [skippedAttempt, setSkippedAttempt] = useState(false);
  const [attemptClock, setAttemptClock] = useState(0);
  const attemptTimer = useRef<HTMLDivElement>(null);
  const search = useStarterTask<RngSpread[]>(),
    route = useStarterTask<RouteSetup>(),
    outlook = useStarterTask<StarterOutlookTask>(),
    shiny = useStarterTask<RngSpread[]>(),
    nearby = useStarterTask<RngSpread[]>(),
    landing = useStarterTask<RngSpread[]>();
  const panel = useRef<HTMLElement>(null);
  const patch = (p: Partial<StarterGuideState>) => {
    setState((s) => patchStarterGuide(s, p));
    setError("");
    if (
      [
        "attemptDraft",
        "attemptNature",
        "attemptGender",
        "attemptAbility",
        "starter",
      ].some((key) => Object.hasOwn(p, key))
    ) {
      setAttemptResult(null);
      setSkippedAttempt(false);
    }
  };
  useEffect(() => {
    try {
      validateStarterGuide(state);
      window.localStorage.setItem(GUIDE_KEY, JSON.stringify(state));
      setSaveError("");
    } catch {
      setSaveError(
        "Autosave paused: correct invalid timing or search fields. Your last valid saved progress is retained.",
      );
    }
  }, [state]);
  useEffect(() => {
    panel.current?.focus();
    window.scrollTo({ top: 0 });
    setError("");
  }, [state.step]);
  useEffect(() => {
    if (state.step === 1 && state.readings.length) {
      search.run({ kind: "search", state });
      setSearched(searchKey(state));
    }
  }, [state.step]);
  useEffect(() => {
    if (state.step === 4 && state.confirmedSid !== null) {
      shiny.run({ kind: "shiny", state });
      setPage(0);
    }
  }, [
    state.step,
    state.confirmedSid,
    state.species,
    state.targetMin,
    state.targetMax,
  ]);
  useEffect(() => {
    if (state.step === 5 && state.selected) {
      nearby.run({ kind: "nearby", state });
      landing.run({ kind: "landing", state });
      setAttemptResult(null);
      setSkippedAttempt(false);
    }
  }, [state.step, state.selected?.advance]);
  const sidCandidates = useMemo(() => {
    try {
      return state.tid ? guideSidCandidates(state) : [];
    } catch {
      return [];
    }
  }, [state.tid, state.intro]);
  const spreads = searched === searchKey(state) ? search.result : null;
  const outlookKey =
    spreads?.length === 1 && state.tid
      ? JSON.stringify([routeKey(state), state.usedTms, spreads[0]])
      : "";
  const starterOutlook =
    outlook.result?.key === outlookKey ? outlook.result : null;
  const checkingOutlook =
    state.step === 1 &&
    state.starterPart === "summary" &&
    !!outlookKey &&
    !state.routeDone &&
    !starterOutlook &&
    !outlook.error;
  useEffect(() => {
    outlook.clear();
    if (
      state.step !== 1 ||
      state.starterPart !== "summary" ||
      !outlookKey ||
      state.routeDone
    )
      return;
    outlook.run({
      kind: "outlook",
      state,
      spread: spreads![0],
      key: outlookKey,
    });
  }, [outlookKey, state.step, state.starterPart, state.routeDone]);
  const evs = useMemo(() => battleEvs(state.battles), [state.battles]);
  const sameStarter =
    !!state.identifiedStarter &&
    lab.identity.tid === Number(state.tid) &&
    lab.identity.pid === state.identifiedStarter?.pid &&
    lab.identity.species === state.species;
  const correctingEvs = starterEvsNeedCorrection(
    state,
    lab.identity,
    lab.itemTestBaseline,
    !!lab.pendingItemTest,
    lab.drawingInProgress,
  );
  const survivingSids =
    sameStarter && !lab.analysisBusy && !lab.analysisError
      ? lab.sidAnalysis?.sidValues
      : undefined;
  const noSurvivingSids = survivingSids?.length === 0;
  const editingCheckpoint =
    state.step === 2 &&
    sameStarter &&
    !state.route?.train &&
    lab.itemTestBaseline.observations.some((v) => v !== -1);
  const currentRouteKey = JSON.stringify([routeKey(state), survivingSids]);
  useEffect(() => {
    if (!correctingEvs) return;
    try {
      lab.correctStarterCheckpointEvs(
        state.evsKnown ? evs : Array(6).fill(null),
      );
      route.clear();
      setPlannedKey("");
      // An existing drawing means the player has already reached Rustboro.
      patch({ route: null, routeDone: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [correctingEvs, evs, state.evsKnown]);
  // Plan before travel, then refresh automatically when actual EVs or moves
  // change. Keep checkbox-only edits out of the key.
  useEffect(() => {
    if (
      state.step === 2 &&
      state.route &&
      !state.route.train &&
      state.route.itemPlanVersion !== 2
    ) {
      patch({ route: null });
      return;
    }
    if (
      state.step !== 2 ||
      editingCheckpoint ||
      correctingEvs ||
      noSurvivingSids ||
      state.route ||
      !state.readings.length ||
      lab.pendingItemTest ||
      lab.analysisBusy ||
      lab.analysisError
    )
      return;
    const timer = window.setTimeout(() => {
      setPlannedKey(currentRouteKey);
      route.run({ kind: "route", state, sidValues: survivingSids });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    state.step,
    state.route,
    currentRouteKey,
    lab.pendingItemTest,
    lab.analysisBusy,
    lab.analysisError,
    correctingEvs,
    noSurvivingSids,
    editingCheckpoint,
  ]);
  useEffect(() => {
    if (
      state.step === 2 &&
      !editingCheckpoint &&
      !correctingEvs &&
      !noSurvivingSids &&
      !lab.analysisBusy &&
      !lab.analysisError &&
      route.result &&
      !state.route &&
      plannedKey === currentRouteKey
    )
      patch({ route: route.result });
  }, [
    route.result,
    state.step,
    currentRouteKey,
    plannedKey,
    correctingEvs,
    noSurvivingSids,
    lab.analysisBusy,
    lab.analysisError,
    editingCheckpoint,
  ]);
  useEffect(() => {
    if (state.step < 2 || !state.readings.length) return;
    try {
      const settings = starterSettings(state);
      const saved = lab.rngSettings;
      if (
        saved?.kind !== "static" ||
        saved.seed !== settings.seed ||
        saved.minAdvance !== settings.minAdvance ||
        saved.maxAdvance !== settings.maxAdvance ||
        saved.methods.length !== 1 ||
        saved.methods[0] !== "Method1"
      )
        lab.runRngSearch(settings);
    } catch {
      // Keep the last valid search while timing inputs are being corrected.
    }
  }, [state.step, state.starter, lab.rngSettings]);
  const beginStarterAttempt = () => {
    setState(newStarterAttempt(state));
    lab.resetSolver();
    search.clear();
    route.clear();
    outlook.clear();
    shiny.clear();
    nearby.clear();
    landing.clear();
    setSearched("");
    setAttemptResult(null);
    setSkippedAttempt(false);
    setError("");
  };
  const retryStarterTarget = () => {
    try {
      patch({
        starter: shiftStarterTarget(state.starter),
        starterPart: "timer",
        route: null,
      });
      outlook.clear();
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const beginShinyAttempt = () => {
    setState((s) => newShinyAttempt(s));
    setAttemptResult(null);
    setSkippedAttempt(false);
    setError("");
  };
  const retryShinyAttempt = () => {
    beginShinyAttempt();
    setAttemptClock((n) => n + 1);
    attemptTimer.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    attemptTimer.current?.focus({ preventScroll: true });
  };
  const recordReading = () => {
    try {
      if (!state.evsKnown)
        throw Error(
          "Restore the battle log before using these stats to narrow IVs. Curtain checks can still use unknown EVs.",
        );
      const summary = summaryFromDraft(state.readingDraft);
      if (!summary.level || summary.stats.every((n) => n === null))
        throw Error(
          "Enter the current level and at least one stat; all six work best.",
        );
      const reading: StarterReading = {
        id: crypto.randomUUID(),
        summary,
        evs: evs.slice(),
      };
      const next = {
        ...state,
        readings: [reading],
        route: null,
      };
      patch({ readings: next.readings, route: null });
      search.run({ kind: "search", state: next });
      setSearched(searchKey(next));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const traitChange = (
    key: "species" | "nature" | "gender" | "ability",
    value: string,
  ) => {
    if (key === "species")
      patch({
        species: Number(value),
        nature: "",
        gender: "",
        ability: starterAbility(Number(value)),
        attemptAbility: starterAbility(Number(value)),
        readings: [],
        moves: creationMoves(Number(value)),
        route: null,
        selected: null,
        confirmedSid: null,
        identifiedStarter: null,
        usedTms: [],
      });
    else
      patch({
        [key]: value,
        route: null,
        selected: null,
        confirmedSid: null,
        identifiedStarter: null,
      });
  };
  const configure = (facts = routeCheckpoint(state)) =>
    lab.configureStarterInvestigation(
      facts,
      readingSnapshots(state.readings),
      starterSettings(state),
      estimatedSidWindow(state.intro),
    );
  const next = () => {
    try {
      if (state.step === 0) {
        if (!/^\d{1,5}$/.test(state.tid) || Number(state.tid) > 65535)
          throw Error("Enter the public TID from the Trainer Card (0–65535).");
        if (!sidCandidates.length)
          throw Error("Widen the estimated SID window.");
      }
      if (state.step === 1 && state.starterPart === "timer") {
        patch({ starterPart: "summary" });
        return;
      }
      if (editingCheckpoint) {
        const actual = routeCheckpoint(state);
        lab.correctStarterCheckpointFacts({
          evs: actual.evs,
          moves: actual.moves,
          pp: actual.pp,
          ppBonuses: actual.ppBonuses,
        });
        route.clear();
        patch({ step: 3, routeDone: true, route: null });
        return;
      }
      if (state.step === 2 && !state.routeDone) {
        if (lab.analysisError) throw Error(lab.analysisError);
        if (!state.route || route.busy)
          throw Error("Wait for your Rustboro checklist before continuing.");
        if (!starterTravelReady(state.route))
          throw Error(
            "Complete and check off the travel actions before continuing.",
          );
        patch({ routeDone: true });
        return;
      }
      if (state.step === 1) {
        if (!spreads?.length || search.busy)
          throw Error(
            "Record the starter’s stats and find matching spreads first. Recheck the stats, EV log and calibration if none match.",
          );
        if (spreads.length !== 1)
          throw Error(
            "Choose Back, reset with the timer and try again until exactly one PID matches.",
          );
        if (checkingOutlook)
          throw Error("Wait for the starter SID preview before continuing.");
        if (
          lab.identity.pid !== spreads[0].pid ||
          lab.identity.tid !== Number(state.tid) ||
          lab.identity.species !== state.species ||
          !lab.itemTestBaseline.observations.some((v) => v !== -1)
        )
          configure({
            ...routeCheckpoint(state),
            pid: spreads[0].pid,
            ivs: spreads[0].ivs.slice(),
          });
        patch({
          identifiedStarter: spreads[0],
          route: starterOutlook?.route ?? null,
        });
      }
      if (state.step === 2) {
        if (lab.analysisError) throw Error(lab.analysisError);
        if (!state.routeDone)
          throw Error(
            "Complete the travel checklist and record every battle the starter participated in.",
          );
        if (!state.route || !state.route.done.every(Boolean))
          throw Error(
            "Plan the curtain setup and confirm each completed action.",
          );
        const actual = routeCheckpoint(state),
          planned = state.route.facts;
        // Training is logged explicitly when completed. Levels and new moves
        // must be checked by the player; they are never predicted as observations.
        if (
          state.evsKnown &&
          planned.evs &&
          planned.evs.some((n, i) => n !== null && n !== evs[i])
        )
          throw Error(
            "The battle log no longer matches this plan. Plan again using the actual EVs.",
          );
        configure({
          ...actual,
          pid: planned.pid,
          ivs: planned.ivs,
          moves: planned.moves,
          pp: planned.pp,
          ppBonuses: planned.ppBonuses,
          heldItem: planned.heldItem,
        });
      }
      if (state.step === 3) {
        if (
          lab.drawingInProgress ||
          lab.analysisBusy ||
          lab.analysisError ||
          lab.pendingItemTest ||
          lab.sidAnalysis?.sidValues.length !== 1
        )
          throw Error(
            "One SID must match the recorded evidence before choosing a shiny target.",
          );
        patch({ confirmedSid: lab.sidAnalysis.sidValues[0], step: 4 });
        return;
      }
      if (state.step === 4) {
        if (!state.selected) throw Error("Select a shiny target first.");
      }
      patch({ step: Math.min(5, state.step + 1) });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const train = (id: string) => {
    const recommendation = lab.controlledExperiments.find(
        (e) => e.action.id === id,
      ),
      plan = recommendation?.action.training;
    if (!recommendation || !plan || plan.vitamins) return;
    const stat = Number(id.split("-")[1]);
    // This route uses only ordinary ×1, 1-EV opponents. Other verified
    // multipliers remain supported in the battle log, never assumed here.
    if (plan.gain !== 1 || plan.removeBrace) {
      setError(
        "For this guided training checkpoint, remove the held item and confirm the ordinary ×1 EV multiplier first. More information can be entered with Back.",
      );
      return;
    }
    const base = lab.itemTestBaseline.knownFacts;
    const facts = {
      ...lab.identity,
      ...base,
      ...recommendation.action.changes,
      experience: undefined,
    };
    patch({
      step: 2,
      routeDone: true,
      exp: "",
      moves: base.moves?.slice() ?? state.moves,
      route: {
        facts,
        items: state.route?.items,
        score: {
          total: lab.sidAnalysis?.sidValues.length ?? 0,
          worstCase: recommendation.worstCase,
          expected: recommendation.expectedRemaining,
        },
        instructions: [
          `Defeat exactly ${plan.battles} ${stat === 2 ? "Seedot on Route 102 (rare; 1 Defense EV each)" : "Zigzagoon on Route 101/103 (1 Speed EV each)"}. Remove the held item before training. Log any other defeated Pokémon separately.`,
          "Heal and check the current moves. Cancel evolution.",
          "Restore the current original held item and move order. Box the starter in Box 8, slot 5 and reenter the school.",
        ],
        train: { species: stat === 2 ? 298 : 288, count: plan.battles },
        done: [false, false, false],
      },
    });
  };
  const checkRoute = (index: number, checked: boolean) => {
    setState((s) => checkStarterRoute(s, index, checked));
    setError("");
  };
  let targetTiming: { first: number; second: number } | null = null;
  let targetTimingError = "";
  if (state.selected)
    try {
      targetTiming = targetCountdown(
        state.selected.advance,
        state.starter.calibration,
        state.starter.first,
        state.starter.offset,
      );
    } catch (e) {
      targetTimingError = (e as Error).message;
    }
  const identifyAttempt = () => {
    setAttemptResult(null);
    try {
      const summary = validateSummaryStats(
        summaryFromDraft(state.attemptDraft),
      );
      if (
        !summary.level ||
        (summary.stats.every((n) => n === null) &&
          !state.attemptNature &&
          !state.attemptGender)
      )
        throw Error(
          "Enter a level and some observed characteristics, or skip calibration.",
        );
      if (summary.level !== 5)
        throw Error(
          "This calibration check uses level 5 immediately after Birch’s first battle. Skip calibration if you trained further.",
        );
      if (!landing.result) throw Error("Wait for the nearby search to finish.");
      const matches = matchStarterAttempt(
        landing.result,
        state.species,
        {
          ...(state.attemptNature
            ? { nature: Number(state.attemptNature) }
            : {}),
          ...(state.attemptGender
            ? { gender: state.attemptGender as "male" | "female" }
            : {}),
          ...(state.attemptAbility
            ? { ability: Number(state.attemptAbility) }
            : {}),
        },
        summary,
        [0, 0, 0, 1, 0, 0],
      );
      setAttemptResult(matches);
      setSkippedAttempt(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const landed = attemptResult?.length === 1 ? attemptResult[0] : null,
    difference =
      landed && state.selected ? landed.advance - state.selected.advance : null;
  return (
    <main className="starter-wizard">
      <header>
        <div>
          <p className="starter-eyebrow">New Game SID Finder → Shiny Starter</p>
          <h1>Emerald starter guide</h1>
        </div>
        <div className="starter-header-actions">
          <button onClick={onExit}>Return to investigator</button>
          <button
            onClick={() => onReset(state)}
            title="Clear this guide's trainer, starter and curtain data; keep timer settings."
          >
            Reset guide
          </button>
        </div>
      </header>
      <p className="starter-progress">
        Step {state.step + 1} of 6 ·{" "}
        {saveError
          ? "Saving unavailable"
          : state.step >= 2 && lab.saveStatus !== "Saved on this device"
            ? lab.saveStatus
            : "Progress saved on this device"}
      </p>
      {saveError && <p role="alert">{saveError}</p>}
      {resetError && <p role="alert">{resetError}</p>}
      {canUndoReset && state.step === 0 && (
        <p>
          Previous guide saved.{" "}
          <button onClick={onUndoReset}>Undo reset</button>
        </p>
      )}
      <section
        className="starter-screen"
        ref={panel}
        tabIndex={-1}
        aria-labelledby="starter-step-title"
      >
        <h2 id="starter-step-title">{STEPS[state.step]}</h2>
        {state.step === 0 && (
          <>
            <div className="starter-guide-images">
              <GuideImage
                name="trainer-name"
                caption="First zero: confirm your trainer name with OK."
              />
              <GuideImage
                name="birch-final"
                caption="Second zero: advance “Come see me in my POKéMON LAB.”"
              />
            </div>
            <p>
              Start a new save file and set text speed to Fast, then start the
              timer when you’re ready to press OK to confirm your nickname.
            </p>
            <TwoStageTimer
              first={state.intro.first}
              second={state.intro.second}
              firstCue="Confirm the trainer name"
              secondCue="Advance Birch’s final message"
            />
            <TimingOptions
              value={state.intro}
              intro
              onChange={(intro) =>
                patch({
                  intro,
                  confirmedSid: null,
                  selected: null,
                  route: null,
                })
              }
            />
            <label>
              Public Trainer ID (IDNo.)
              <input
                inputMode="numeric"
                maxLength={5}
                value={state.tid}
                onChange={(e) =>
                  patch({
                    tid: e.target.value,
                    confirmedSid: null,
                    selected: null,
                    route: null,
                  })
                }
              />
            </label>
            {state.tid && (
              <p role="status">
                {sidCandidates.length} possible SIDs in the estimated
                naming-to-initialization window. Timing is a search estimate,
                never a guaranteed advance.
              </p>
            )}
          </>
        )}
        {state.step === 1 && (
          <>
            {state.starterPart === "summary" && (
              <StarterTargetWindow timing={state.starter} />
            )}
            {state.starterPart === "timer" ? (
              <>
                <div className="starter-guide-images">
                  <GuideImage
                    name="starter-bag"
                    caption="Save in front of Birch’s bag before opening it."
                  />
                  <GuideImage
                    name="starter-confirm"
                    caption="Second zero: confirm YES for your chosen starter. Torchic shown."
                  />
                </div>
                <p>
                  <strong>
                    Save in front of Birch’s bag before choosing a starter.
                  </strong>{" "}
                  Keep this save until the shiny attempt. You can investigate on
                  the temporary playthrough and then reset back.
                </p>
                <p>
                  Start the timer. Soft reset with A+B+Start+Select at the first
                  zero, on console or emulator. Quickly open the bag, choose a
                  starter, and wait at “Do you choose this POKéMON?”. Confirm at
                  the second zero.
                </p>
                <TwoStageTimer
                  first={state.starter.first}
                  second={state.starter.second}
                  firstCue="Soft reset (A + B + Start + Select)"
                  secondCue="Confirm the starter"
                  onFirstCue={beginStarterAttempt}
                />
                <TimingOptions
                  value={state.starter}
                  onChange={(starter) => patch({ starter, route: null })}
                />
                <p>
                  After choosing the starter, defeat Birch’s first Zigzagoon,
                  then choose Next to enter the summary.
                </p>
              </>
            ) : (
              <>
                <p>
                  After defeating Birch’s first Zigzagoon, read your starter’s
                  summary. That victory gives <strong>1 Speed EV</strong>; it is
                  already in the battle log. Use maximum HP, not remaining HP.
                </p>
                <StarterTraitsForm
                  species={state.species}
                  nature={state.nature}
                  gender={state.gender}
                  chooseSpecies
                  onChange={traitChange}
                />
                <ReadingInputs
                  draft={state.readingDraft}
                  onChange={(readingDraft) => patch({ readingDraft })}
                />
                <BattleLog
                  state={state}
                  onChange={(p) => patch({ ...p, route: null })}
                />
                <button onClick={recordReading} disabled={search.busy}>
                  Record stats and find starter spreads
                </button>
                {search.busy && (
                  <p role="status">
                    Searching the selected Emerald Method 1 window…
                  </p>
                )}
                {search.error && <p role="alert">{search.error}</p>}
                {spreads && (
                  <StarterSearchResults
                    spreads={spreads}
                    species={state.species}
                    retry
                  />
                )}
                {checkingOutlook && (
                  <p role="status">
                    Checking the closest SID candidates and preparing the route…
                  </p>
                )}
                {starterOutlook && (
                  <StarterOutlook
                    outlook={starterOutlook.outlook}
                    onRetry={retryStarterTarget}
                  />
                )}
                {outlook.error && (
                  <p role="alert">
                    SID preview unavailable: {outlook.error} You can continue
                    with the full SID investigation.
                  </p>
                )}
              </>
            )}
          </>
        )}
        {state.step === 2 && (
          <>
            {!state.routeDone && !editingCheckpoint ? (
              <>
                {state.route ? (
                  <StarterTravelChecklist
                    plan={state.route}
                    onCheck={checkRoute}
                  />
                ) : !route.error &&
                  !lab.analysisError &&
                  !noSurvivingSids &&
                  !correctingEvs ? (
                  <p role="status">
                    Calculating your Rustboro checklist from the starter’s IVs
                    and remaining SIDs…
                  </p>
                ) : null}
                {(route.error || lab.analysisError) && (
                  <p role="alert">{route.error || lab.analysisError}</p>
                )}
                <BattleLog
                  state={state}
                  onChange={(p) =>
                    patch({
                      ...p,
                      route: state.route?.train ? state.route : null,
                    })
                  }
                />
              </>
            ) : (
              <>
                {editingCheckpoint ? (
                  <p>
                    Correct the battle log and move order used for your saved
                    drawing, then choose Next to recheck it. Leave any uncertain
                    move slot unknown.
                  </p>
                ) : (
                  <p>
                    Prepare the starter at Rustboro’s Pokémon Center. Your PID,
                    IVs and remaining SIDs determine this setup. Update the
                    battle log and current moves so the final plan uses the
                    actual EVs.
                  </p>
                )}
                <BattleLog
                  state={state}
                  onChange={(p) =>
                    patch({
                      ...p,
                      route: state.route?.train ? state.route : null,
                    })
                  }
                />
                <p>
                  Heal at the Pokémon Center. Copy all four current moves; leave
                  an uncertain slot unknown. Boxed Pokémon have restored PP. No
                  PP Ups, contest training, Pokérus or other unrecorded changes
                  are assumed for this ordinary new-game route.
                </p>
                <div className="starter-input-grid">
                  {state.moves.map((move, i) => (
                    <label key={i}>
                      Move slot {i + 1}
                      <select
                        value={move ?? ""}
                        onChange={(e) =>
                          patch({
                            moves: state.moves.map((m, n) =>
                              n === i
                                ? e.target.value === ""
                                  ? null
                                  : Number(e.target.value)
                                : m,
                            ),
                            route: state.route?.train ? state.route : null,
                          })
                        }
                      >
                        <option value="">Unknown</option>
                        <option value={0}>Empty</option>
                        {names.moves
                          .filter((m) => m.id !== 0)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
                {!state.route &&
                  !editingCheckpoint &&
                  !route.error &&
                  !lab.analysisError &&
                  !noSurvivingSids &&
                  !correctingEvs && (
                    <p role="status">Updating your curtain setup…</p>
                  )}
                {!editingCheckpoint && (route.error || lab.analysisError) && (
                  <p role="alert">{route.error || lab.analysisError}</p>
                )}
                {state.route && !editingCheckpoint && (
                  <div className="starter-setup">
                    <h3>Your setup checklist</h3>
                    {state.route.instructions.map((text, i) => (
                      <label key={i}>
                        <input
                          type="checkbox"
                          checked={state.route!.done[i] ?? false}
                          onChange={(e) => checkRoute(i, e.target.checked)}
                        />
                        {text}
                      </label>
                    ))}
                    <p>
                      Final move order:{" "}
                      {state.route.facts.moves
                        ?.map((m) =>
                          m === null
                            ? "unknown"
                            : m === 0
                              ? "empty"
                              : moveName(m!),
                        )
                        .join(" → ")}
                      . Held item:{" "}
                      {state.route.facts.heldItem
                        ? ITEM_CATALOG.find(
                            (i) => i.id === state.route!.facts.heldItem,
                          )?.name
                        : "none"}
                      .
                    </p>
                    <p>
                      Update any changed moves; the checklist refreshes
                      automatically.
                    </p>
                  </div>
                )}
                {lab.pendingItemTest && (
                  <button onClick={lab.cancelItemTest}>
                    Cancel unfinished experiment before updating the checkpoint
                  </button>
                )}
              </>
            )}
            {correctingEvs && (
              <p role="status">
                Rechecking your drawing with the corrected EVs…
              </p>
            )}
            {noSurvivingSids && !correctingEvs && !editingCheckpoint && (
              <p role="alert">
                No SIDs fit the saved evidence. Check the drawing against the
                game with the corrected battle log. Your recorded pixels are
                preserved.
              </p>
            )}
            {(noSurvivingSids || lab.analysisError) &&
              !correctingEvs &&
              !editingCheckpoint && (
                <button
                  onClick={() => {
                    route.clear();
                    patch({ step: 3, routeDone: true });
                  }}
                >
                  Review curtain drawing
                </button>
              )}
          </>
        )}
        {state.step === 3 && (
          <StarterCurtainStep
            lab={lab}
            state={state}
            onTraining={train}
            onMoreInfo={() => patch({ step: 2, route: null })}
          />
        )}
        {state.step === 4 && (
          <>
            <p>
              Your SID is{" "}
              <strong>
                {state.confirmedSid} · 0x
                {state.confirmedSid
                  ?.toString(16)
                  .toUpperCase()
                  .padStart(4, "0")}
              </strong>
              , under the verified observations and chosen search window. Soft
              reset to your original save before Birch’s bag. The investigation
              playthrough will be discarded.
            </p>
            <p>
              Choose a shiny Method 1 target that leaves enough time to load
              your save and open the bag. Nature and IVs vary between targets.
            </p>
            <details>
              <summary>Shiny target search range</summary>
              <div className="starter-input-grid">
                <label>
                  First advance
                  <input
                    type="number"
                    min={0}
                    value={state.targetMin}
                    onChange={(e) =>
                      patch({
                        targetMin: Number(e.target.value),
                        selected: null,
                      })
                    }
                  />
                </label>
                <label>
                  Last advance
                  <input
                    type="number"
                    min={state.targetMin}
                    value={state.targetMax}
                    onChange={(e) =>
                      patch({
                        targetMax: Number(e.target.value),
                        selected: null,
                      })
                    }
                  />
                </label>
              </div>
            </details>
            {shiny.busy && <p role="status">Finding shiny starter targets…</p>}
            {shiny.error && <p role="alert">{shiny.error}</p>}
            {shiny.result && (
              <>
                <p>
                  {shiny.result.length} shiny Method 1 targets in this range.
                </p>
                <StarterSpreadTable
                  spreads={shiny.result.slice(page * 5, page * 5 + 5)}
                  species={state.species}
                  selected={state.selected?.advance}
                  onSelect={(selected) => patch({ selected })}
                />
                <div className="inline-buttons">
                  <button disabled={!page} onClick={() => setPage(page - 1)}>
                    Earlier targets
                  </button>
                  <button
                    disabled={(page + 1) * 5 >= shiny.result!.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Later targets
                  </button>
                </div>
              </>
            )}
          </>
        )}
        {state.step === 5 && state.selected && (
          <>
            <GuideImage
              name="starter-confirm"
              caption="Confirm your chosen starter at the second zero (Torchic shown)."
            />
            <StarterSpreadTable
              spreads={[state.selected]}
              species={state.species}
            />
            <p>
              Load the protected pre-starter save. At the first zero, reset with
              A+B+Start+Select on console or emulator. Open the bag promptly,
              select {speciesTraits(state.species)?.name}, and wait at the
              Yes/No confirmation. Confirm Yes at the second zero.
            </p>
            {targetTiming ? (
              <div
                ref={attemptTimer}
                tabIndex={-1}
                aria-label="Shiny starter timer"
              >
                <TwoStageTimer
                  key={attemptClock}
                  {...targetTiming}
                  firstCue="Soft reset (A + B + Start + Select)"
                  secondCue="Confirm the starter"
                  onStart={beginShinyAttempt}
                />
              </div>
            ) : (
              <p role="alert">{targetTimingError}</p>
            )}
            <p className="help">
              Timer settings are estimates. The target’s exact RNG advance is
              required for this shiny; being within five advances is progress,
              not a shiny guarantee.
            </p>
            <details>
              <summary>Target and nearby advances (±10)</summary>
              {nearby.busy && <p>Loading nearby predictions…</p>}
              {nearby.result && (
                <StarterSpreadTable
                  spreads={nearby.result}
                  species={state.species}
                  selected={state.selected.advance}
                />
              )}
            </details>
            <details>
              <summary>Check where this attempt landed · optional</summary>
              <p>
                After rescuing Birch, enter the observed summary at level 5,
                before any extra battles. This check includes the first
                Zigzagoon’s 1 Speed EV. If you trained further or are uncertain,
                skip calibration.
              </p>
              <StarterTraitsForm
                species={state.species}
                nature={state.attemptNature}
                gender={state.attemptGender}
                onChange={(key, value) =>
                  patch({
                    [key === "nature"
                      ? "attemptNature"
                      : key === "gender"
                        ? "attemptGender"
                        : "attemptAbility"]: value,
                  })
                }
              />
              <ReadingInputs
                draft={state.attemptDraft}
                onChange={(attemptDraft) => patch({ attemptDraft })}
              />
              <div className="inline-buttons">
                <button onClick={identifyAttempt} disabled={landing.busy}>
                  Find matching landed advances
                </button>
                <button
                  onClick={() => {
                    setSkippedAttempt(true);
                    setAttemptResult(null);
                    setError("");
                  }}
                >
                  Skip calibration
                </button>
              </div>
              {landing.error && <p role="alert">{landing.error}</p>}
              {skippedAttempt && (
                <p>
                  No calibration applied. You can repeat the timer when ready.
                </p>
              )}
              {attemptResult && (
                <p role="status">
                  {attemptResult.length === 0
                    ? `No match within ±${STARTER_LANDING_RADIUS} advances. Check the inputs or retry without changing calibration.`
                    : attemptResult.length > 1
                      ? `${attemptResult.length} advances match. Stats do not identify a unique landing; calibration is unchanged.`
                      : `Likely landed advance ${landed!.advance}: ${difference! > 0 ? `${difference} late` : difference! < 0 ? `${-difference!} early` : "on target"}.`}
                </p>
              )}
              {landed && difference !== null && (
                <>
                  <p>
                    {Math.abs(difference) <= 5
                      ? "You are within five advances. Keep the broad calibration steady and focus on consistent input; the exact target is still needed."
                      : "You can adjust the next countdown by the observed difference. This suggestion assumes the matching advance is correct."}
                  </p>
                  <button
                    onClick={() => {
                      const calibration = calibratedFrames(
                        state.starter.calibration,
                        state.selected!.advance,
                        landed.advance,
                      );
                      try {
                        targetCountdown(
                          state.selected!.advance,
                          calibration,
                          state.starter.first,
                          state.starter.offset,
                        );
                        patch({ starter: { ...state.starter, calibration } });
                        setAttemptResult(null);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Apply suggested calibration
                  </button>
                </>
              )}
            </details>
            <details open={!!targetTimingError || undefined}>
              <summary>Manual calibration</summary>
              <label>
                Calibration adjustment (advances)
                <input
                  type="number"
                  value={state.starter.calibration + state.starter.offset}
                  onChange={(e) =>
                    patch({
                      starter: {
                        ...state.starter,
                        calibration: Number(e.target.value),
                        offset: 0,
                      },
                    })
                  }
                />
              </label>
              <p>
                A positive adjustment makes the confirmation cue earlier. Reset
                the game before every new attempt.
              </p>
              <p className="help">
                Start at zero if unsure. Use the optional attempt check above to
                calculate a change from a verified landing.
              </p>
              {targetTimingError && (
                <button
                  onClick={() =>
                    patch({
                      starter: { ...state.starter, calibration: 0, offset: 0 },
                    })
                  }
                >
                  Reset calibration
                </button>
              )}
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <footer className="starter-navigation">
          <button
            disabled={state.step === 0}
            onClick={() =>
              state.step === 1 && state.starterPart === "summary"
                ? patch({ starterPart: "timer" })
                : state.step === 2 && state.routeDone
                  ? patch({ routeDone: false })
                  : patch({ step: state.step - 1 })
            }
          >
            {state.step === 5 ? "Choose another target" : "Back"}
          </button>
          {state.step < 5 ? (
            <button onClick={next} disabled={checkingOutlook}>
              Next
            </button>
          ) : (
            <button onClick={retryShinyAttempt}>Try again</button>
          )}
        </footer>
      </section>
      <details className="starter-guide-sources">
        <summary>Sources and assumptions</summary>
        <p>
          Ordinary English Emerald, original starter species, seed 0 after
          reset, Method 1. Cancel evolution and record all battles. SID timing
          uses an adjustable estimate; timers cannot verify the actual RNG
          state. The route compares supported practical setups and is not a
          guarantee of one-observation recovery.
        </p>
        <p>
          <a
            href="https://www.pokemonrng.com/emerald-shiny-starter/"
            target="_blank"
            rel="noreferrer"
          >
            Starter timing procedure
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/pret/pokeemerald/blob/master/src/new_game.c"
            target="_blank"
            rel="noreferrer"
          >
            Trainer-ID initialization
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/pret/pokeemerald/blob/master/src/pokemon.c"
            target="_blank"
            rel="noreferrer"
          >
            Pokémon generation, stats and EVs
          </a>
        </p>
      </details>
    </main>
  );
}
