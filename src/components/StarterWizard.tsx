import { StarterBackupStep } from "./StarterBackupStep";
import {
  intersectBackupSids,
  sharedSidLabView,
  preferBackupPokemon,
} from "../core/starterBackup";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurtainLab } from "../hooks/useCurtainLab";
import { useStarterTask } from "../hooks/useStarterTask";
import {
  GUIDE_KEY,
  GUIDE_LAB_KEY,
  GUIDE_BACKUP_LAB_KEY,
  newStarterGuide,
  newStarterAttempt,
  newShinyAttempt,
  validateStarterGuide,
  battleEvs,
  completeStarterRoute,
  readingSnapshots,
  starterSettings,
  creationMoves,
  starterAbility,
  matchShinyStarterAttempt,
  shinyStarterSpecies,
  STARTERS,
  guideSidCandidates,
  type StarterGuideState,
  type RouteSetup,
  type StarterReading,
} from "../core/starterGuide";
import {
  DEFAULT_STARTER_CALIBRATION,
  calibrateStarterLanding,
  estimatedSidWindow,
  targetCountdown,
  STARTER_LANDING_RADIUS,
  shiftStarterTarget,
} from "../core/starterTiming";
import type { StarterOutlookTask } from "../core/starterOutlook";
import { routeCheckpoint } from "../core/starterRoute";
import { patchStarterGuide } from "../core/starterChecklist";
import { validateSummaryStats, summaryFromDraft } from "../core/stats";
import { speciesTraits } from "../core/traits";
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
import { StarterTidPreview } from "./StarterTidPreview";
import {
  earliestShinyStarterAdvance,
  starterTidPreviewKey,
  type StarterTidPreview as TidPreview,
} from "../core/starterTidPreview";
import {
  StarterPidRecommendation,
  OptimalPidSearch,
} from "./StarterPidRecommendation";
import {
  applyStarterRecommendation,
  canSearchOptimalPid,
  isRecommendedTimer,
  savedStarterRecommendation,
  starterRecommendationKey,
  type StarterPidRecommendation as PidRecommendation,
} from "../core/starterRecommendation";
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
    s.playerGender,
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
        ? { ...validateStarterGuide(JSON.parse(saved)), step: 0 }
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
  const [selectedLanding, setSelectedLanding] = useState<number | null>(null);
  const attemptCalibration = useRef<number | null>(null);
  const shinySpecies = shinyStarterSpecies(state);
  const attemptTimer = useRef<HTMLDivElement>(null);
  const search = useStarterTask<RngSpread[]>(),
    route = useStarterTask<RouteSetup>(),
    outlook = useStarterTask<StarterOutlookTask>(),
    recommendation = useStarterTask<PidRecommendation>(),
    tidPreview = useStarterTask<TidPreview>(),
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
        "shinySpecies",
        "starter",
      ].some((key) => Object.hasOwn(p, key))
    ) {
      setAttemptResult(null);
      setSelectedLanding(null);
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
    shinySpecies,
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
  }, [state.step, state.selected?.advance, shinySpecies]);
  useEffect(() => {
    attemptCalibration.current = null;
  }, [state.step, state.selected?.advance]);
  const sidCandidates = useMemo(() => {
    try {
      return state.tid ? guideSidCandidates(state) : [];
    } catch {
      return [];
    }
  }, [state.tid, state.intro]);
  const starterSids = lab.sidAnalysis?.sidValues ?? sidCandidates;
  const backupLab = useCurtainLab(GUIDE_BACKUP_LAB_KEY, {
    sidCandidates: starterSids,
    enabled: !!state.backup?.configured,
  });
  const backupHasEvidence =
    !!state.backup?.configured && backupLab.starterHasDrawing;
  const backupSids =
    backupLab.sidAnalysis?.sidValues ??
    backupLab.sidRngResult?.rows.map((r) => r.sid);
  const sharedSids =
    backupHasEvidence && backupSids
      ? intersectBackupSids(starterSids, backupSids)
      : starterSids;
  const backupBusy =
    backupHasEvidence &&
    (backupLab.analysisBusy || backupLab.drawingInProgress);
  const jointReady =
    !!lab.sidAnalysis &&
    lab.starterHasDrawing &&
    !lab.analysisBusy &&
    !lab.analysisError &&
    !lab.drawingInProgress &&
    !lab.pendingItemTest &&
    (!backupHasEvidence ||
      (backupLab.analysisCurrent &&
        !backupBusy &&
        !backupLab.analysisError &&
        !backupLab.pendingItemTest &&
        backupLab.sidRngResult?.exact === true));
  const starterView = sharedSidLabView(
    lab,
    sharedSids,
    backupBusy,
    backupHasEvidence ? backupLab.analysisError : "",
  );
  const backupView = sharedSidLabView(
    backupLab,
    sharedSids,
    lab.analysisBusy,
    lab.analysisError,
  );
  const backupAvailable =
    !state.backup?.configured || !backupLab.starterHasDrawing;
  const openBackup = () => {
    patch({
      backup: state.backup
        ? { ...state.backup, active: true }
        : { active: true, phase: "details", draft: { heldItem: "0" } },
    });
    window.scrollTo({ top: 0 });
  };
  const recommendationKey = starterRecommendationKey(state);
  const tidPreviewKey = starterTidPreviewKey(state);
  const currentTidPreview =
    tidPreview.result?.key === tidPreviewKey ? tidPreview.result : null;
  useEffect(() => {
    tidPreview.clear();
    if (state.step !== 0 || !canSearchOptimalPid(state.tid)) return;
    const timer = window.setTimeout(
      () => tidPreview.run({ kind: "tid-preview", state }),
      350,
    );
    return () => {
      window.clearTimeout(timer);
      tidPreview.clear();
    };
  }, [state.step, tidPreviewKey]);
  const pidRecommendation =
    recommendation.result?.key === recommendationKey
      ? recommendation.result
      : savedStarterRecommendation(state);
  useEffect(() => {
    recommendation.clear();
    return () => recommendation.clear();
  }, [recommendationKey]);
  useEffect(() => {
    if (recommendation.result)
      setState((current) =>
        applyStarterRecommendation(current, recommendation.result!, true),
      );
  }, [recommendation.result]);
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
  const survivingSids =
    sameStarter && !lab.analysisBusy && !lab.analysisError
      ? lab.sidAnalysis?.sidValues
      : undefined;
  const noSurvivingSids = survivingSids?.length === 0;
  const editingCheckpoint =
    state.step === 2 &&
    sameStarter &&
    !state.route?.train &&
    lab.starterHasDrawing;
  const currentRouteKey = JSON.stringify([routeKey(state), survivingSids]);
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
    noSurvivingSids,
    editingCheckpoint,
  ]);
  useEffect(() => {
    if (
      state.step === 2 &&
      !editingCheckpoint &&
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
    attemptCalibration.current = state.starter.calibration;
    setSelectedLanding(null);
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
        if (!state.playerGender)
          throw Error("Choose your player character first.");
        if (!/^\d{1,5}$/.test(state.tid) || Number(state.tid) > 65535)
          throw Error("Enter the public TID from the Trainer Card (0–65535).");
        if (!sidCandidates.length)
          throw Error("Widen the estimated SID window.");
        if (recommendation.busy)
          throw Error("Wait for the optimal PID search to finish.");
        if (
          !pidRecommendation &&
          !state.identifiedStarter &&
          !state.readings.length
        )
          throw Error(
            "Choose Keep TID to find an optimal starter PID before continuing.",
          );
      }
      if (state.step === 1 && state.starterPart === "timer") {
        patch({ starterPart: "summary" });
        return;
      }
      if (editingCheckpoint) {
        const actual = routeCheckpoint(state);
        lab.updateStarterCheckpoint({
          ...lab.identity,
          ...lab.itemTestBaseline.knownFacts,
          evs: actual.evs,
          moves: actual.moves,
          pp: actual.pp,
          ppBonuses: actual.ppBonuses,
        });
        route.clear();
        patch({ step: 3, routeDone: true, route: null });
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
          throw Error(
            "Wait for your starter's route estimate before continuing.",
          );
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
        if (!state.route || route.busy)
          throw Error("Wait for your Rustboro plan before continuing.");
        const completed = completeStarterRoute(state);
        const actual = routeCheckpoint(completed),
          planned = completed.route!.facts;
        if (
          completed.evsKnown &&
          planned.evs &&
          planned.evs.some((n, i) => n !== null && n !== actual.evs?.[i])
        )
          throw Error(
            "The battle log no longer matches this plan. Plan again using the actual EVs.",
          );
        if (completed.route!.train) {
          lab.updateStarterCheckpoint({
            ...lab.identity,
            ...lab.itemTestBaseline.knownFacts,
            evs: actual.evs,
            moves: actual.moves,
            pp: actual.pp,
            ppBonuses: actual.ppBonuses,
            pokerus: actual.pokerus,
          });
        } else {
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
        setState({ ...completed, step: 3 });
        setError("");
        return;
      }
      if (state.step === 3) {
        if (
          !jointReady ||
          sharedSids.length !== 1 ||
          (state.backup?.active && state.backup.phase === "details")
        )
          throw Error(
            "One SID must match all recorded Pokemon evidence before choosing a shiny target.",
          );
        patch({ confirmedSid: sharedSids[0], step: 4 });
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
    if (preferBackupPokemon(plan.target) && backupAvailable) {
      openBackup();
      return;
    }
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
    };
    // Training changes EXP, but an explicit undefined value is not a valid fact.
    delete facts.experience;
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
          `Defeat exactly ${plan.battles} ${stat === 2 ? "Seedot on Route 102 (rare; 1 Defense EV each)" : "Zigzagoon on Route 101/103 (1 Speed EV each)"}. Keep the current held item. Log any other defeated Pokémon separately.`,
          "Check the current moves. Cancel evolution.",
          "Keep the current held item and move order. Box the starter in Box 8, slot 5 and reenter the school.",
        ],
        train: { species: stat === 2 ? 298 : 288, count: plan.battles },
        done: [false, false, false],
      },
    });
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
      const matches = matchShinyStarterAttempt(state, landing.result, summary);
      if (attemptCalibration.current === null)
        attemptCalibration.current = state.starter.calibration;
      setSelectedLanding(null);
      setAttemptResult(matches);
      setSkippedAttempt(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const landed =
      attemptResult?.length === 1
        ? attemptResult[0]
        : (attemptResult?.find(
            (spread) => spread.advance === selectedLanding,
          ) ?? null),
    difference =
      landed && state.selected ? landed.advance - state.selected.advance : null;
  return (
    <main className="starter-wizard">
      <header>
        <div>
          <p className="starter-eyebrow">New Game SID Finder → Shiny Starter</p>
          <h1>Curtain glitch shiny starter guide</h1>
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
        Page {state.step + 1} of 6 ·{" "}
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
            <label>
              Player character
              <select
                value={state.playerGender ?? ""}
                onChange={(e) =>
                  patch({
                    playerGender: e.target.value as "male" | "female",
                    confirmedSid: null,
                    selected: null,
                    route: null,
                  })
                }
              >
                <option value="" disabled>
                  Choose your character
                </option>
                <option value="male">Boy</option>
                <option value="female">Girl</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.dryBattery ?? false}
                onChange={(e) =>
                  patch({
                    dryBattery: e.target.checked,
                    targetMin: earliestShinyStarterAdvance(e.target.checked),
                  })
                }
              />
              Dry battery
            </label>
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
            {canSearchOptimalPid(state.tid) &&
              !currentTidPreview &&
              !tidPreview.error && (
                <p role="status">
                  Finding the first shiny advances for nearby SIDs...
                </p>
              )}
            {tidPreview.error && <p role="alert">{tidPreview.error}</p>}
            {currentTidPreview && (
              <StarterTidPreview value={currentTidPreview} />
            )}
            <div className="starter-tid-actions">
              <OptimalPidSearch
                label="Keep TID"
                tid={state.playerGender ? state.tid : ""}
                disabled={!currentTidPreview}
                busy={recommendation.busy}
                progress={recommendation.progress}
                complete={!!pidRecommendation && !recommendation.error}
                onSearch={() => {
                  if (
                    state.playerGender &&
                    currentTidPreview &&
                    canSearchOptimalPid(state.tid)
                  ) {
                    const next = {
                      ...state,
                      targetMin: currentTidPreview.minimum,
                    };
                    patch({ targetMin: next.targetMin });
                    recommendation.run({ kind: "recommendation", state: next });
                  }
                }}
              />
              <button
                disabled={!canSearchOptimalPid(state.tid)}
                onClick={() => onReset(state)}
              >
                Reset TID
              </button>
            </div>
            {recommendation.error && <p role="alert">{recommendation.error}</p>}
            {pidRecommendation && (
              <StarterPidRecommendation
                value={pidRecommendation}
                applied={isRecommendedTimer(state, pidRecommendation)}
              />
            )}
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
                  disabled={recommendation.busy}
                />
                {recommendation.busy && (
                  <p role="status">Finding the best 11-PID starter window…</p>
                )}
                {pidRecommendation && (
                  <StarterPidRecommendation
                    value={pidRecommendation}
                    applied={isRecommendedTimer(state, pidRecommendation)}
                  />
                )}
                {recommendation.error && (
                  <p role="alert">
                    Starter recommendation unavailable: {recommendation.error}{" "}
                    Your current timer can still be used.
                  </p>
                )}
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
                    Checking nearby SIDs and preparing this starter’s route…
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
                    Route estimate unavailable: {outlook.error} You can continue
                    with the full SID investigation.
                  </p>
                )}
              </>
            )}
          </>
        )}
        {state.step === 2 && (
          <>
            {editingCheckpoint ? (
              <p>
                Update the battle log and move order, then choose Next. Earlier
                drawings keep their original setup; new pixels will be checked
                separately.
              </p>
            ) : state.route ? (
              <StarterTravelChecklist plan={state.route} />
            ) : !route.error && !lab.analysisError && !noSurvivingSids ? (
              <p role="status">
                Calculating your Rustboro plan from the starter's IVs and
                remaining SIDs...
              </p>
            ) : null}
            {!editingCheckpoint && (route.error || lab.analysisError) && (
              <p role="alert">{route.error || lab.analysisError}</p>
            )}
            <details open={editingCheckpoint || undefined}>
              <summary>Battle log and move changes</summary>
              <p>
                {editingCheckpoint
                  ? "Enter the current setup."
                  : "Only edit this if your trip differed from the plan. Next records the listed battles; add only extra battles here."}
              </p>
              <BattleLog
                state={state}
                onChange={(p) =>
                  patch({
                    ...p,
                    route: state.route?.train ? state.route : null,
                  })
                }
              />
              <div className="starter-input-grid">
                {(editingCheckpoint
                  ? state.moves
                  : (state.route?.facts.moves ?? state.moves)
                ).map((move, i) => (
                  <label key={i}>
                    Move slot {i + 1}
                    <select
                      value={move ?? ""}
                      onChange={(e) =>
                        patch({
                          moves: (editingCheckpoint
                            ? state.moves
                            : (state.route?.facts.moves ?? state.moves)
                          ).map((m, n) =>
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
            </details>
            {lab.pendingItemTest && (
              <button onClick={lab.cancelItemTest}>
                Cancel unfinished experiment before updating the checkpoint
              </button>
            )}
            {noSurvivingSids && !editingCheckpoint && (
              <p role="alert">
                No SIDs fit the saved evidence. Check the drawing against the
                game with the corrected battle log. Your recorded pixels are
                preserved.
              </p>
            )}
            {(noSurvivingSids || lab.analysisError) && !editingCheckpoint && (
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
        {state.step === 3 &&
          (state.backup?.active ? (
            <StarterBackupStep
              state={state}
              lab={backupView}
              onChange={(backup) =>
                patch({ backup, confirmedSid: null, selected: null })
              }
              onReturn={() =>
                patch({ backup: { ...state.backup!, active: false } })
              }
            />
          ) : (
            <>
              {state.backup?.configured && (
                <>
                  <p>
                    Swap the starter back with your caught Pokemon, placing the
                    starter in Box 8, slot 5 before checking these pixels.
                  </p>
                  <button onClick={openBackup}>
                    Check second Pokemon again
                  </button>
                </>
              )}

              <StarterCurtainStep
                lab={starterView}
                confirmationReady={jointReady}
                onBackup={openBackup}
                backupAvailable={backupAvailable}
                state={state}
                onTraining={train}
                onMoreInfo={() =>
                  patch({
                    step: 2,
                    route: null,
                    routeDone: true,
                    moves:
                      lab.itemTestBaseline.knownFacts.moves?.slice() ??
                      state.moves,
                  })
                }
              />
            </>
          ))}
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
              Choose the starter you want, then select a shiny target. All three
              starters share the same shiny advances. Leave enough time to load
              your save and open the bag.
            </p>
            <label>
              Shiny starter
              <select
                value={shinySpecies}
                onChange={(e) =>
                  patch({
                    shinySpecies: Number(e.target.value),
                    attemptAbility: starterAbility(Number(e.target.value)),
                  })
                }
              >
                {STARTERS.map((species) => (
                  <option key={species} value={species}>
                    {speciesTraits(species)?.name}
                  </option>
                ))}
              </select>
            </label>
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
                  species={shinySpecies}
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
              species={shinySpecies}
            />
            <p>
              Load the protected pre-starter save. At the first zero, reset with
              A+B+Start+Select on console or emulator. Open the bag promptly,
              select {speciesTraits(shinySpecies)?.name}, and wait at the Yes/No
              confirmation. Confirm Yes at the second zero.
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
                  species={shinySpecies}
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
                species={shinySpecies}
                chooseSpecies
                nature={state.attemptNature}
                gender={state.attemptGender}
                onChange={(key, value) =>
                  key === "species"
                    ? patch({
                        shinySpecies: Number(value),
                        attemptAbility: starterAbility(Number(value)),
                      })
                    : patch({
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
                    : landed
                      ? `${attemptResult.length > 1 ? "Selected" : "Likely"} landed advance ${landed.advance}: ${difference! > 0 ? `${difference} late` : difference! < 0 ? `${-difference!} early` : "on target"}.`
                      : `${attemptResult.length} advances match. Select the landing you think you hit, or skip calibration if uncertain.`}
                </p>
              )}
              {!!attemptResult?.length && (
                <StarterSpreadTable
                  spreads={attemptResult}
                  species={shinySpecies}
                  selected={landed?.advance}
                  onSelect={(spread) => setSelectedLanding(spread.advance)}
                  selectionHeading="Landing"
                  selectionLabel="Use this landing"
                />
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
                      try {
                        const starter = calibrateStarterLanding(
                          state.starter,
                          state.selected!.advance,
                          landed.advance,
                          attemptCalibration.current ??
                            state.starter.calibration,
                        );
                        patch({ starter });
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
                The initial +3 adjustment is an estimate. Use the optional
                attempt check above to calculate a change from a verified
                landing.
              </p>
              {targetTimingError && (
                <button
                  onClick={() =>
                    patch({
                      starter: {
                        ...state.starter,
                        calibration: DEFAULT_STARTER_CALIBRATION,
                        offset: 0,
                      },
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
            disabled={
              state.step === 0 ||
              (state.step === 3 &&
                !!state.backup?.active &&
                !!backupLab.pendingItemTest)
            }
            onClick={() =>
              state.step === 3 && state.backup?.active
                ? patch({ backup: { ...state.backup, active: false } })
                : state.step === 3
                  ? patch({
                      step: 2,
                      route: null,
                      routeDone: true,
                      moves:
                        lab.itemTestBaseline.knownFacts.moves?.slice() ??
                        state.moves,
                    })
                  : state.step === 1 && state.starterPart === "summary"
                    ? patch({ starterPart: "timer" })
                    : patch({ step: state.step - 1 })
            }
          >
            {state.step === 5 ? "Choose another target" : "Back"}
          </button>
          {state.step < 5 ? (
            <button
              onClick={next}
              disabled={
                checkingOutlook ||
                (state.step === 0 &&
                  (!state.playerGender ||
                    recommendation.busy ||
                    !canSearchOptimalPid(state.tid) ||
                    (!pidRecommendation &&
                      !state.identifiedStarter &&
                      !state.readings.length)))
              }
            >
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
            href="https://www.reddit.com/r/pokemonrng/comments/k395lc/pok%C3%A9mon_emerald_shiny_starter_delay/"
            target="_blank"
            rel="noreferrer"
          >
            Reported starter delay (+3 ±1 advances; starting estimate)
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
