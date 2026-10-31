import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import {
  SPINDA_ASSETS,
  SPINDA_SPECIES,
  moveSpindaSpot,
  spindaPositions,
} from "../core/spinda";
import {
  defaultSpindaMatcher,
  SPINDA_AREAS,
  validateSpindaMatcher,
  type SpindaMatcherState,
  type SpindaMatch,
} from "../core/spindaMatcher";
import { parseRngNumber, WILD_METHODS, type WildLead } from "../core/rng";
import { hex, NATURES } from "../core/pokemon";
import { genderForPid } from "../core/traits";
import { SpindaSprite } from "./SpindaSprite";
import type { SpindaWorkerResponse } from "../core/spindaWorker";
import {
  emptySpindaProgress,
  sidCandidateMasks,
  spindaUsefulness,
} from "../core/spindaUsefulness";
import { FACT_CATALOGS } from "../core/catalogs";
import { spindaInfoPlaintext, spindaRngEvidence } from "../core/spindaSidGuide";
import {
  spindaRemainingSids,
  spindaStatCandidate,
  testedSpindaDigits,
} from "../core/spindaUsefulness";
import { summaryFromDraft, summaryToDraft } from "../core/stats";
import { SpindaSidGuide } from "./SpindaSidGuide";
import { SummaryStatInputs } from "./SummaryStatInputs";
import { SidPixelQuestion } from "./SidPixelQuestion";
import { displayActionInstructions } from "../core/controlledExperiments";
import {
  chooseSpindaRoute,
  newSpindaJourney,
  planSpindaVitamins,
  vitaminShoppingBreakEven,
  spindaSpreadCount,
  paintedSpindaShortlist,
  type SpindaJourneyState,
  type JourneyExperiment,
  SPINDA_JOURNEY_STEPS,
  spindaStoragePlacement,
  spindaJourneyPage,
  spindaSetupPage,
} from "../core/spindaJourney";
import { experimentSeconds, effortLabel } from "../core/nextSidStep";
import {
  SpindaInformationPage,
  SpindaPreparation,
  SpindaCurtainLocator,
  SpindaStockInputs,
  SpindaVitaminShopping,
} from "./SpindaJourneyPages";

const names = [
  "Left ear (on screen)",
  "Right ear (on screen)",
  "Left face (on screen)",
  "Right face (on screen)",
];
const maskPaths = SPINDA_ASSETS.spots.map((s) =>
  s.rows
    .flatMap((bits, y) =>
      Array.from({ length: 16 }, (_, x) =>
        bits & (1 << x) ? `M${x} ${y}h1v1h-1z` : "",
      ),
    )
    .join(""),
);
const maskOutlines = SPINDA_ASSETS.spots.map((s) =>
  s.rows
    .flatMap((bits, y) =>
      Array.from({ length: 16 }, (_, x) => {
        if (!(bits & (1 << x))) return "";
        return `${y === 0 || !(s.rows[y - 1] & (1 << x)) ? `M${x} ${y}h1` : ""}${y === 15 || !(s.rows[y + 1] & (1 << x)) ? `M${x} ${y + 1}h1` : ""}${x === 0 || !(bits & (1 << (x - 1))) ? `M${x} ${y}v1` : ""}${x === 15 || !(bits & (1 << (x + 1))) ? `M${x + 1} ${y}v1` : ""}`;
      }),
    )
    .join(""),
);
type SearchState = {
  key: string;
  pid: number;
  matches: SpindaMatch[];
  progress: number;
  busy: boolean;
  error: string;
};

export function SpindaMatcher({
  lab,
  locatePixel,
  onTargetsChange,
  startAtBeginning = false,
  resetOnRefresh = false,
}: {
  lab: CurtainLab;
  locatePixel?: (nibble: number) => void;
  onTargetsChange?: (targets: number[]) => void;
  startAtBeginning?: boolean;
  resetOnRefresh?: boolean;
}) {
  const value = lab.spindaMatcher ?? defaultSpindaMatcher();
  const update = (next: SpindaMatcherState) =>
    lab.setSpindaMatcher(validateSpindaMatcher(next));
  const painterRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const journey = value.journey ?? {
    ...newSpindaJourney(),
    language: lab.facts.species === 308 ? (lab.facts.language ?? 2) : 2,
    step: value.guide?.enabled ? ("pixels" as const) : ("prepare" as const),
  };
  const [intro, setIntro] = useState(startAtBeginning);
  const [reviewStep, setReviewStep] = useState<
    SpindaJourneyState["step"] | null
  >(null);
  const language =
    journey.language ??
    (lab.facts.species === 308 ? lab.facts.language : undefined) ??
    2;
  const placement = spindaStoragePlacement(language);
  const savedStep = lab.pendingItemTest
    ? "experiment"
    : spindaJourneyPage(journey);
  const step = intro ? "prepare" : (reviewStep ?? savedStep);
  const resumeFromIntro = step === "prepare" && savedStep !== "prepare";
  const pageNumber = SPINDA_JOURNEY_STEPS.indexOf(step) + 1;
  const savedPageNumber = SPINDA_JOURNEY_STEPS.indexOf(savedStep) + 1;
  const painted = !!journey.patternDrawn;
  const searchActive = step !== "prepare" || !!value.guide?.enabled;
  const setJourney = (next: SpindaJourneyState) =>
    update({ ...value, journey: next });
  const resumeSaved = () => {
    setIntro(false);
    setReviewStep(null);
  };
  const go = (next: SpindaJourneyState["step"]) => {
    resumeSaved();
    setJourney({ ...journey, step: next });
  };
  const back = () => {
    if (pageNumber <= 1 || lab.pendingItemTest) return;
    setIntro(false);
    setReviewStep(SPINDA_JOURNEY_STEPS[pageNumber - 2]);
  };
  const reviewNext =
    reviewStep !== null && pageNumber < savedPageNumber
      ? () => {
          const next = SPINDA_JOURNEY_STEPS[pageNumber];
          setReviewStep(next === savedStep ? null : next);
        }
      : undefined;
  useEffect(() => {
    if (lab.pendingItemTest && journey.step !== "experiment")
      setJourney({
        ...journey,
        step: "experiment",
        restore:
          lab.pendingItemTest.itemTest?.action?.restore ??
          "Restore the original held item before continuing.",
      });
  }, [lab.pendingItemTest?.id]);
  const progress = value.sidProgress ?? emptySpindaProgress();
  const liveSids = useMemo(
    () =>
      !lab.analysisBusy && !lab.analysisError
        ? (lab.spindaBaseSidValues ??
          lab.sidAnalysis?.sidValues ??
          lab.sidRngResult?.rows.map((row) => row.sid))
        : undefined,
    [
      lab.analysisBusy,
      lab.analysisError,
      lab.spindaBaseSidValues,
      lab.sidAnalysis,
      lab.sidRngResult,
    ],
  );
  const baseSids = useMemo(() => {
    if (!liveSids) return progress.remainingSids;
    const saved = progress.remainingSids && new Set(progress.remainingSids);
    return liveSids.filter((sid) => !saved || saved.has(sid));
  }, [liveSids, progress.remainingSids]);
  const remaining = sidCandidateMasks(baseSids).map(
    (mask, n) =>
      mask &
      (lab.sidDigitFilters?.[n] ?? 65535) &
      (lab.facts.sid === undefined
        ? 65535
        : 1 << ((lab.facts.sid >>> (n * 4)) & 15)) &
      (!lab.analysisBusy && !lab.analysisError
        ? (lab.investigationInference?.masks[12 + n] ?? 65535)
        : 65535),
  );
  const useGuide = (pid: number) => {
    const candidate = matches.find((m) => m.pid === pid);
    const suggestion =
      candidate &&
      spindaUsefulness(
        candidate,
        countRemaining,
        countTested,
        lab.facts.otGender,
      );
    const levels = new Set(candidate?.encounters.map((e) => e.level));
    if (!journey.caught) {
      if (!painted) {
        setError("Place the spots to match the encountered Spinda first.");
        return;
      }
      resumeSaved();
      update({
        ...value,
        journey: {
          ...journey,
          matchedPid: pid,
          ball: journey.ballChosen ? journey.ball : (suggestion?.ball ?? 4),
          step: "catch",
        },
      });
      return;
    }
    if (
      !lab.useSpindaPid(
        pid,
        lab.facts.ball ?? suggestion?.ball ?? journey.ball,
        levels.size === 1 ? [...levels][0] : undefined,
      )
    ) {
      setError(
        "Finish the current experiment and correct invalid inputs first.",
      );
      return;
    }
    resumeSaved();
  };
  const [selectedSpot, setSelectedSpot] = useState(0),
    [handles, setHandles] = useState(true),
    [shiny, setShiny] = useState(false),
    [selectedPid, setSelectedPid] = useState<number | null>(null),
    [overlay, setOverlay] = useState(false),
    [limit, setLimit] = useState(4),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [cancelled, setCancelled] = useState(false),
    [pidText, setPidText] = useState(hex(value.pid, 8));
  const [numbers, setNumbers] = useState({
    seed: String(value.settings.seed),
    minAdvance: String(value.settings.minAdvance),
    maxAdvance: String(value.settings.maxAdvance),
  });
  const [search, setSearch] = useState<SearchState>({
    key: "",
    pid: 0,
    matches: [],
    progress: 0,
    busy: false,
    error: "",
  });
  const worker = useRef<Worker | null>(null),
    latestPid = useRef(value.pid);
  latestPid.current = value.pid;
  const key = JSON.stringify({
    settings: value.settings,
    level: value.level,
    nature: value.nature,
    gender: value.gender,
  });
  const validNumbers = (() => {
    try {
      return Object.entries(numbers).every(
        ([k, v]) =>
          parseRngNumber(v) === value.settings[k as keyof typeof numbers],
      );
    } catch {
      return false;
    }
  })();
  useEffect(() => setPidText(hex(value.pid, 8)), [value.pid]);
  useEffect(
    () =>
      setNumbers({
        seed: String(value.settings.seed),
        minAdvance: String(value.settings.minAdvance),
        maxAdvance: String(value.settings.maxAdvance),
      }),
    [value.settings.seed, value.settings.minAdvance, value.settings.maxAdvance],
  );
  useEffect(() => {
    if (!searchActive || cancelled || !validNumbers) return;
    setSearch({
      key,
      pid: latestPid.current,
      matches: [],
      progress: 0,
      busy: true,
      error: "",
    });
    const timer = setTimeout(() => {
      let w: Worker;
      try {
        w = new Worker(
          new URL("../workers/spinda.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        setSearch((s) => ({
          ...s,
          busy: false,
          error: "Background search unavailable. Reload and try again.",
        }));
        return;
      }
      worker.current = w;
      w.onmessage = ({ data }: MessageEvent<SpindaWorkerResponse>) => {
        if (data.type === "progress")
          setSearch((s) => ({
            ...s,
            progress: Math.round((90 * data.done) / Math.max(1, data.total)),
          }));
        if (data.type === "preparing")
          setSearch((s) => ({ ...s, progress: 95 }));
        if (data.type === "error") {
          setSearch((s) => ({
            ...s,
            matches: [],
            busy: false,
            error: data.message,
          }));
          w.terminate();
          worker.current = null;
        }
        if (data.type === "result" && data.pid === latestPid.current)
          setSearch({
            key,
            pid: data.pid,
            matches: data.matches,
            progress: 100,
            busy: false,
            error: "",
          });
      };
      w.onerror = () => {
        setSearch((s) => ({
          ...s,
          busy: false,
          matches: [],
          error: "Background search failed. Try again.",
        }));
        w.terminate();
        worker.current = null;
      };
      w.postMessage({ type: "generate", state: value, pid: latestPid.current });
    }, 180);
    return () => {
      clearTimeout(timer);
      worker.current?.terminate();
      worker.current = null;
    };
  }, [key, searchActive, revision, cancelled, validNumbers]);
  useEffect(() => {
    if (!worker.current || cancelled) return;
    setSearch((s) => ({ ...s, busy: true }));
    const timer = setTimeout(
      () => worker.current?.postMessage({ type: "rank", pid: value.pid }),
      70,
    );
    return () => clearTimeout(timer);
  }, [value.pid]);
  const ready =
    validNumbers &&
    !cancelled &&
    search.key === key &&
    search.pid === value.pid &&
    !search.busy &&
    !search.error;
  const matches = ready ? search.matches : [],
    selected = matches.find((m) => m.pid === selectedPid),
    positions = spindaPositions(value.pid);
  const guideProgress = useMemo(() => {
    const guide = value.guide;
    if (!guide?.enabled || lab.factError || lab.summaryError) return undefined;
    const guideFacts = lab.activeSnapshot?.itemTest
      ? { ...lab.itemTestBaseline.knownFacts, ...lab.identity }
      : lab.facts;
    const info = spindaInfoPlaintext(guideFacts);
    const candidate = spindaStatCandidate(
      matches.find((m) => m.pid === guide.pid),
      guideFacts,
      lab.activeSnapshot?.itemTest
        ? lab.itemTestBaseline.summaryStats
        : lab.summaryDraft
          ? summaryFromDraft(lab.summaryDraft)
          : undefined,
    );
    const rng = spindaRngEvidence(guide.pid, candidate, info);
    const sids = spindaRemainingSids(
      guide,
      baseSids,
      remaining,
      info,
      rng?.plaintexts,
    );
    return {
      sids,
      remaining: sidCandidateMasks(sids),
      tested: testedSpindaDigits(guide, info, rng?.masks),
    };
  }, [
    value.guide,
    baseSids,
    remaining.join(),
    ready,
    search.matches,
    lab.facts,
    lab.factError,
    lab.summaryDraft,
    lab.summaryError,
    lab.itemTestBaseline,
    lab.identity,
    lab.activeSnapshot,
  ]);
  const countRemaining = guideProgress?.remaining ?? remaining;
  const countTested = progress.tested.map(
    (m, n) => m | (guideProgress?.tested[n] ?? 0),
  );
  const shortlist = useMemo(
    () => (painted ? paintedSpindaShortlist(matches) : []),
    [matches, painted],
  );
  const matchedCandidate = matches.find((c) => c.pid === journey.matchedPid);
  const catchSuggestion =
    matchedCandidate &&
    spindaUsefulness(
      matchedCandidate,
      countRemaining,
      countTested,
      lab.facts.otGender,
    );
  const suggestedBall = catchSuggestion?.ball ?? 4;
  useEffect(() => {
    if (
      step === "catch" &&
      ready &&
      !journey.ballChosen &&
      journey.ball !== suggestedBall
    )
      setJourney({ ...journey, ball: suggestedBall });
  }, [step, ready, journey.ballChosen, journey.ball, suggestedBall]);
  const catchUseful =
    !catchSuggestion ||
    Object.values(catchSuggestion.counts).some((n) => n > 0);
  const currentSids =
    lab.sidAnalysis?.sidValues ?? guideProgress?.sids ?? baseSids;
  const options: JourneyExperiment[] = [
    ...(lab.controlledExperiments ?? [])
      .filter((e) => e.groups > 1)
      .map((e) => ({
        id: e.action.id,
        name: e.action.name,
        informationGain: e.informationGain,
        seconds: experimentSeconds(e.action),
        action: e.action,
      })),
    ...(lab.experiments ?? [])
      .filter((e) => e.groups > 1 && lab.ownedItems.includes(e.item.id))
      .map((e) => ({
        id: `item-${e.item.id}`,
        name: `Hold ${e.item.name}`,
        informationGain: e.informationGain,
        seconds: experimentSeconds(),
        item: e.item.id,
      })),
  ];
  const vitaminRoute = useMemo(
    () =>
      step === "plan" && value.guide && currentSids
        ? planSpindaVitamins(
            value.guide.pid,
            currentSids,
            lab.itemTestBaseline.knownFacts,
            options,
            journey,
          )
        : undefined,
    [
      step,
      value.guide?.pid,
      currentSids,
      lab.controlledExperiments,
      lab.experiments,
      lab.itemTestBaseline,
      journey.iron,
      journey.carbos,
      journey.shoppingSeconds,
    ],
  );
  const nextRoute = chooseSpindaRoute(options, vitaminRoute, lab.nextSpinda);
  const selectedExperiment =
    nextRoute?.kind === "experiment"
      ? nextRoute.experiment
      : nextRoute?.kind === "vitamins"
        ? vitaminRoute?.actions[0]
        : undefined;
  const disabled = !!(
    lab.factError ||
    lab.summaryError ||
    lab.ppError ||
    lab.analysisError ||
    lab.analysisBusy ||
    lab.drawingInProgress
  );
  const catchNext = () => {
    resumeSaved();
    lab.catchNextSpinda(
      guideProgress
        ? { remainingSids: guideProgress.sids, tested: countTested }
        : undefined,
    );
    setSelectedPid(null);
    setOverlay(false);
  };
  const beginExperiment = (e: JourneyExperiment) => {
    if (lab.currentSnapshots.length >= 100) {
      setError(
        "This catch has reached the observation limit. Continue with another Spinda.",
      );
      return;
    }
    resumeSaved();
    // Save the restore instruction before the snapshot becomes active.
    setJourney({
      ...journey,
      step: "experiment",
      restore:
        e.action?.restore ??
        "Restore the original held item before continuing.",
    });
    if (e.item !== undefined) lab.startItemTest(e.item);
    else lab.startControlledTest(e.id);
  };
  const encounterLevelValid =
    Number.isInteger(value.level) && value.level! >= 1 && value.level! <= 100;
  const beforeCatch = !journey.caught;
  const stageTitles: Record<SpindaJourneyState["step"], string> = {
    prepare: "Get ready",
    match: "Confirm your painted pattern",
    catch: "Choose this catch",
    stats: "Check summary stats",
    information: "Pokémon information",
    moves: "Moves and PP",
    details: "Trainer and catch details",
    draw: "Draw your Spinda",
    pixels: "Check useful pixels",
    plan: "Your next useful step",
    experiment: "Run the experiment",
    restore: "Restore your Spinda",
  };
  const pageNavigation =
    pageNumber > 1 ? (
      <nav
        className="spinda-page-navigation"
        aria-label="Spinda page navigation"
      >
        <button type="button" disabled={!!lab.pendingItemTest} onClick={back}>
          Back
        </button>
        {reviewNext && (
          <button type="button" onClick={reviewNext}>
            Next
          </button>
        )}
      </nav>
    ) : null;
  useEffect(() => {
    if (painterRef.current) {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: "start" });
    }
  }, [step]);
  const drag = useRef<{
    pointer: number;
    spot: number;
    pid: number;
    x: number;
    y: number;
    scale: number;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    comparisonRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedPid]);
  const setPid = (pid: number) => {
    setSelectedPid(null);
    setOverlay(false);
    update({
      ...value,
      pid,
      journey: { ...journey, patternDrawn: true, matchedPid: undefined },
    });
    setError("");
  };
  function pointerDown(e: ReactPointerEvent<SVGGElement>, spot: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = svg.current!.getBoundingClientRect();
    drag.current = {
      pointer: e.pointerId,
      spot,
      pid: value.pid,
      x: e.clientX,
      y: e.clientY,
      scale: 64 / rect.width,
    };
    setSelectedSpot(spot);
    svg.current!.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = spindaPositions(d.pid)[d.spot];
    setPid(
      moveSpindaSpot(
        d.pid,
        d.spot,
        p.x + Math.round((e.clientX - d.x) * d.scale),
        p.y + Math.round((e.clientY - d.y) * d.scale),
      ),
    );
  }
  function nudge(dx: number, dy: number) {
    const p = positions[selectedSpot];
    setPid(moveSpindaSpot(value.pid, selectedSpot, p.x + dx, p.y + dy));
  }
  function changeNumber(field: keyof typeof numbers, text: string) {
    const next = { ...numbers, [field]: text };
    setNumbers(next);
    setCancelled(false);
    try {
      const settings = {
        ...value.settings,
        seed: parseRngNumber(next.seed),
        minAdvance: parseRngNumber(next.minAdvance),
        maxAdvance: parseRngNumber(next.maxAdvance),
      };
      update({ ...value, settings });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const configurable = (patch: Partial<SpindaMatcherState>) => {
    try {
      const trait = (["level", "nature", "gender"] as const).find(
        (k) => k in patch,
      );
      if (journey.caught && trait) {
        // After capture, these controls edit the same observed information as
        // the summary pages, rather than leaving contradictory copies behind.
        lab.editFact(
          trait === "level" ? "metLevel" : trait,
          patch[trait] === undefined ? "" : String(patch[trait]),
        );
      } else update({ ...value, ...patch });
      setError("");
      setCancelled(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const settings = (patch: Partial<SpindaMatcherState["settings"]>) =>
    configurable({ settings: { ...value.settings, ...patch } });
  return (
    <>
      <section
        ref={painterRef}
        className="spinda-matcher spinda-journey starter-screen"
        aria-label="Find SID with Spinda"
      >
        <div className="spinda-journey-heading">
          <small>
            Page {pageNumber} of {SPINDA_JOURNEY_STEPS.length} ·{" "}
            {resetOnRefresh
              ? "refresh starts a new guide"
              : "progress saves automatically"}
          </small>
          <h2 ref={headingRef} tabIndex={-1}>
            {stageTitles[step]}
          </h2>
        </div>
        {step === "prepare" && (
          <section>
            <SpindaPreparation
              language={language}
              disabled={!!lab.pendingItemTest}
              onLanguageChange={(language) => {
                setJourney({ ...journey, language });
                if (journey.caught || value.guide?.enabled)
                  lab.editFact("language", String(language));
              }}
            />
            {resumeFromIntro ? (
              <>
                <p>
                  Your saved Spinda investigation is ready. Continue from page{" "}
                  {savedPageNumber} with your recorded information and SID
                  progress.
                </p>
                <button onClick={resumeSaved}>
                  Continue saved guide — Page {savedPageNumber}
                </button>
              </>
            ) : (
              <>
                <p>
                  Save by the grass on Route 113, soft reset with
                  A+B+Start+Select, then encounter one Spinda. Before catching
                  it, paint its spots here so the guide can identify the pattern
                  and suggest a ball.
                </p>
                <p>
                  If it is shiny, select Shiny when recording its information.
                  Both ordinary and shiny Spinda work.
                </p>
                <p>
                  Use an ordinary lead without an encounter ability, or set its
                  effect below. Keep the same original trainer for every catch.
                </p>
                <button
                  disabled={!!lab.pendingItemTest || !validNumbers}
                  onClick={() => {
                    resumeSaved();
                    update({
                      ...value,
                      level: undefined,
                      nature: undefined,
                      gender: undefined,
                      journey: {
                        ...journey,
                        language,
                        step: "draw",
                        patternDrawn: false,
                        matchedPid: undefined,
                        caught: false,
                        ballChosen: false,
                      },
                    });
                  }}
                >
                  I encountered a Spinda — paint its spots
                </button>
              </>
            )}
          </section>
        )}
        {step === "catch" && (
          <section>
            <h3>Catch the Spinda you matched</h3>
            {journey.matchedPid !== undefined && (
              <div className="spinda-catch-preview">
                <SpindaSprite pid={journey.matchedPid} shiny={shiny} />
                <code>PID 0x{hex(journey.matchedPid, 8)}</code>
              </div>
            )}
            <p>
              <strong>
                {catchUseful
                  ? "Catch this Spinda."
                  : "This pattern offers no new SID digit checks."}
              </strong>{" "}
              {catchUseful
                ? "Use the suggested ball, or choose one you have."
                : "You can try a different encounter, or catch it anyway to check its other data."}
            </p>
            <label>
              Encountered Spinda level
              <input
                aria-label="Encountered Spinda level"
                type="number"
                min={1}
                max={100}
                value={value.level ?? ""}
                onChange={(e) => {
                  configurable({
                    level: e.target.value ? Number(e.target.value) : undefined,
                  });
                  if (journey.caught || value.guide?.enabled)
                    lab.editFact("metLevel", e.target.value);
                }}
              />
            </label>
            <p>
              Suggested ball:{" "}
              <strong>
                {FACT_CATALOGS.balls.find((b) => b.id === suggestedBall)?.name}
              </strong>
              .
            </p>
            <label>
              Ball to use
              <select
                value={journey.ball}
                onChange={(e) => {
                  setJourney({
                    ...journey,
                    ball: Number(e.target.value),
                    ballChosen: true,
                  });
                  if (journey.caught || value.guide?.enabled)
                    lab.editFact("ball", e.target.value);
                }}
              >
                {FACT_CATALOGS.balls
                  .filter((b) => b.id !== 5)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            {journey.ball !== suggestedBall && (
              <button
                className="text-button"
                onClick={() => {
                  setJourney({
                    ...journey,
                    ball: suggestedBall,
                    ballChosen: true,
                  });
                  if (journey.caught || value.guide?.enabled)
                    lab.editFact("ball", String(suggestedBall));
                }}
              >
                Use suggested ball
              </button>
            )}
            <p>
              After catching it, open Box {placement.box}, slot {placement.slot}{" "}
              to check Spinda’s summary on the following pages.
            </p>
            {ready && !matchedCandidate && (
              <p role="alert">
                The selected PID does not match this level and encounter range.
                Adjust the spots or search settings before continuing.
              </p>
            )}
            <button
              disabled={
                !painted ||
                !matchedCandidate ||
                journey.matchedPid === undefined ||
                !encounterLevelValid ||
                disabled ||
                !ready
              }
              onClick={() => {
                if (journey.caught) {
                  go(
                    spindaSpreadCount(matchedCandidate) !== 1
                      ? "stats"
                      : "information",
                  );
                  return;
                }
                resumeSaved();
                if (
                  value.guide?.pid === journey.matchedPid &&
                  lab.facts.species === 308 &&
                  lab.facts.pid === journey.matchedPid
                ) {
                  lab.useSpindaPid(
                    journey.matchedPid!,
                    journey.ball,
                    value.level,
                    true,
                  );
                  return;
                }
                lab.prepareSpindaCatch(
                  journey.ball,
                  value.level!,
                  journey.matchedPid,
                  spindaSpreadCount(matchedCandidate) !== 1,
                );
              }}
            >
              {journey.caught
                ? "Continue with this Spinda"
                : "I caught this Spinda — continue"}
            </button>
            <button className="text-button" onClick={() => go("draw")}>
              Adjust my spot drawing
            </button>
            {!journey.caught && !value.guide?.enabled && (
              <button
                className="text-button"
                onClick={() => {
                  resumeSaved();
                  update({
                    ...value,
                    level: undefined,
                    nature: undefined,
                    gender: undefined,
                    journey: {
                      ...journey,
                      step: "prepare",
                      matchedPid: undefined,
                      patternDrawn: false,
                      ballChosen: false,
                    },
                  });
                }}
              >
                Try a different encounter
              </button>
            )}
          </section>
        )}
        {step === "stats" && (
          <section>
            <p>
              Methods H1, H2 and H4 can give the same PID different IVs. Copy
              the summary stats to identify compatible spreads. Shared values
              remain usable if more than one method survives.
            </p>
            <SummaryStatInputs
              draft={lab.summaryDraft}
              onChange={lab.editSummaryStat}
            />
            {(lab.summaryError || lab.factError) && (
              <p role="alert">{lab.summaryError || lab.factError}</p>
            )}
            <button
              disabled={!!lab.summaryError || !!lab.factError}
              onClick={() =>
                go(journey.informationComplete ? "pixels" : "information")
              }
            >
              Continue with these stats
            </button>
            <p className="help">
              Leave a stat blank if you cannot check it. The guide will retain
              every compatible spread.
            </p>
          </section>
        )}
        {(["information", "moves", "details"] as const).map(
          (page) =>
            step === page && (
              <div key={page}>
                <SpindaInformationPage lab={lab} page={page} />
                <button
                  disabled={
                    !!lab.factError || !!lab.summaryError || !!lab.ppError
                  }
                  onClick={() => {
                    if (page === "details") {
                      resumeSaved();
                      setShiny(lab.facts.shiny ?? false);
                      update({
                        ...value,
                        nature: lab.facts.nature,
                        gender:
                          lab.facts.gender === "male" ||
                          lab.facts.gender === "female"
                            ? lab.facts.gender
                            : undefined,
                        journey: {
                          ...journey,
                          step: spindaSetupPage({
                            ...journey,
                            informationComplete: true,
                          }),
                          informationComplete: true,
                        },
                      });
                    } else go(page === "information" ? "moves" : "details");
                  }}
                >
                  Continue
                </button>
              </div>
            ),
        )}
        <div className="spinda-workflow">
          {["prepare", "catch", "draw", "match"].includes(step) && (
            <details className="spinda-rng-advanced">
              <summary>Encounter settings and search range</summary>
              <section
                className="spinda-config"
                aria-label="Spinda encounter RNG settings"
              >
                <h3>Encounter RNG range</h3>
                <div className="rng-inputs">
                  {(
                    [
                      ["seed", "Initial seed"],
                      ["minAdvance", "Minimum advance"],
                      ["maxAdvance", "Maximum advance"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k}>
                      {label}
                      <input
                        value={numbers[k]}
                        inputMode={k === "seed" ? "text" : "numeric"}
                        onChange={(e) => changeNumber(k, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Encounter location
                  <select
                    value={value.settings.areaId}
                    onChange={(e) => settings({ areaId: e.target.value })}
                  >
                    {SPINDA_AREAS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.kind === "land" ? "grass / cave" : a.kind}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="rng-methods">
                  <legend>Wild methods</legend>
                  {WILD_METHODS.map((m) => (
                    <label key={m}>
                      <input
                        type="checkbox"
                        checked={value.settings.methods.includes(m)}
                        onChange={(e) =>
                          settings({
                            methods: e.target.checked
                              ? [...value.settings.methods, m]
                              : value.settings.methods.filter((v) => v !== m),
                          })
                        }
                      />
                      {m}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Lead effect
                  <select
                    value={value.settings.lead}
                    onChange={(e) =>
                      settings({ lead: e.target.value as WildLead })
                    }
                  >
                    <option value="none">None / ordinary lead</option>
                    <option value="synchronize">Synchronize</option>
                    <option value="cuteCharmM">Cute Charm · male lead</option>
                    <option value="cuteCharmF">Cute Charm · female lead</option>
                    <option value="pressure">
                      Pressure / Hustle / Vital Spirit
                    </option>
                  </select>
                </label>
                {value.settings.lead === "synchronize" && (
                  <label>
                    Lead nature
                    <select
                      value={value.settings.synchronizeNature}
                      onChange={(e) =>
                        settings({ synchronizeNature: Number(e.target.value) })
                      }
                    >
                      {NATURES.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <details>
                  <summary>Optional observed traits</summary>
                  <label>
                    Encounter level
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={value.level ?? ""}
                      onChange={(e) =>
                        configurable({
                          level:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Nature
                    <select
                      value={value.nature ?? ""}
                      onChange={(e) =>
                        configurable({
                          nature:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">Unknown</option>
                      {NATURES.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
                <p className="help">
                  Inclusive RNG-call bounds; advance 0 is the seed before the
                  encounter-slot call. Decimal or 0x hex. This searches wild
                  encounters, separately from TID-seeded new-game SID RNG.
                </p>
                <p className="help">
                  Ordinary Emerald encounters only; extra effects such as
                  Static, Magnet Pull, Intimidate / Keen Eye, Safari blocks and
                  special encounters are outside this model.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCancelled(false);
                    setRevision((n) => n + 1);
                  }}
                >
                  Search again
                </button>
                {search.busy && (
                  <button type="button" onClick={() => setCancelled(true)}>
                    Cancel search
                  </button>
                )}
              </section>
            </details>
          )}
          {step === "draw" && (
            <section className="spinda-editor" aria-label="Spinda spot editor">
              <h3>Match the four spots, then compare candidates</h3>
              {!journey.caught && (
                <label>
                  Encountered Spinda level
                  <input
                    aria-label="Encountered Spinda level"
                    type="number"
                    min={1}
                    max={100}
                    value={value.level ?? ""}
                    onChange={(e) =>
                      configurable({
                        level: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </label>
              )}
              <p>
                Wait for Spinda’s battle entrance animation to settle. Drag the
                four spots to match the front pose you see, then compare the
                matching patterns on the next page.
              </p>
              <details>
                <summary>Pattern details and observed gender</summary>
                <label>
                  Observed Spinda gender
                  <select
                    aria-label="Observed Spinda gender"
                    value={value.gender ?? ""}
                    onChange={(e) =>
                      configurable({
                        gender:
                          e.target.value === ""
                            ? undefined
                            : (e.target.value as "male" | "female"),
                      })
                    }
                  >
                    <option value="">Unknown / either</option>
                    <option value="male">Male ♂</option>
                    <option value="female">Female ♀</option>
                  </select>
                </label>
                <p className="help">
                  Choose the gender shown in battle to filter RNG candidates
                  before matching. This is the encountered Spinda’s gender,
                  separately from any Cute Charm lead.
                </p>
                <div className="spinda-pid-line">
                  <label>
                    Pattern PID (hex)
                    <input
                      aria-label="Spinda pattern PID hexadecimal"
                      value={pidText}
                      maxLength={10}
                      spellCheck={false}
                      onChange={(e) => {
                        setPidText(e.target.value);
                        try {
                          const text = e.target.value.replace(/^0x/i, "");
                          if (!/^[0-9a-f]{8}$/i.test(text))
                            throw Error(
                              "Enter all eight hexadecimal PID digits",
                            );
                          setPid(Number.parseInt(text, 16));
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    />
                  </label>
                  <small>
                    {value.pid.toLocaleString()} decimal ·{" "}
                    {NATURES[value.pid % 25]} ·{" "}
                    {genderForPid(SPINDA_SPECIES, value.pid)}
                  </small>
                </div>
                {value.gender &&
                  genderForPid(SPINDA_SPECIES, value.pid) !== value.gender && (
                    <p role="status">
                      This dragged pattern’s PID is{" "}
                      {genderForPid(SPINDA_SPECIES, value.pid)}, but you
                      selected {value.gender}. Matching results use your
                      observed gender. Recheck the first spot or compare the
                      closest compatible candidates; the spots have not been
                      moved automatically.
                    </p>
                  )}
              </details>
              <div
                className="spinda-stage"
                onKeyDown={(e) => {
                  const d = (
                    {
                      ArrowLeft: [-1, 0],
                      ArrowRight: [1, 0],
                      ArrowUp: [0, -1],
                      ArrowDown: [0, 1],
                    } as Record<string, number[]>
                  )[e.key];
                  if (d) {
                    e.preventDefault();
                    nudge(d[0], d[1]);
                  }
                }}
              >
                <SpindaSprite
                  pid={value.pid}
                  shiny={shiny}
                  overlayPid={overlay ? selected?.pid : undefined}
                />
                <svg
                  ref={svg}
                  viewBox="0 0 64 64"
                  aria-label="Drag a spot one sprite pixel at a time"
                  className="spinda-drag-layer"
                  onPointerMove={pointerMove}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null;
                  }}
                >
                  {positions.map((p, i) => (
                    <g
                      key={i}
                      role="button"
                      tabIndex={0}
                      aria-label={`${names[i]}, drag or use arrow keys`}
                      aria-pressed={selectedSpot === i}
                      onFocus={() => setSelectedSpot(i)}
                      onPointerDown={(e) => pointerDown(e, i)}
                      className={selectedSpot === i ? "selected" : ""}
                    >
                      <path
                        transform={`translate(${p.x} ${p.y})`}
                        d={maskPaths[i]}
                        className="spinda-spot-hit"
                      />
                      {handles && (
                        <path
                          transform={`translate(${p.x} ${p.y})`}
                          d={maskOutlines[i]}
                          className="spinda-spot-handle"
                        />
                      )}
                      {handles && (
                        <text
                          x={p.x + 5}
                          y={p.y + 6}
                          textAnchor="middle"
                          className="spinda-spot-number"
                        >
                          {i + 1}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              </div>
              <div className="spinda-spots" aria-label="Select a spot">
                {positions.map((p, i) => (
                  <button
                    key={i}
                    aria-pressed={selectedSpot === i}
                    onClick={() => setSelectedSpot(i)}
                    title={names[i]}
                  >
                    Spot {i + 1}{" "}
                    <code>{hex((value.pid >>> (i * 8)) & 255, 2)}</code>
                  </button>
                ))}
              </div>
              <div className="inline-buttons spinda-nudge">
                <button
                  aria-label="Move spot left one pixel"
                  onClick={() => nudge(-1, 0)}
                >
                  ←
                </button>
                <button
                  aria-label="Move spot up one pixel"
                  onClick={() => nudge(0, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label="Move spot down one pixel"
                  onClick={() => nudge(0, 1)}
                >
                  ↓
                </button>
                <button
                  aria-label="Move spot right one pixel"
                  onClick={() => nudge(1, 0)}
                >
                  →
                </button>
              </div>
              <p className="help">
                Drag or use arrows. Every step snaps to one original sprite
                pixel. Spot {selectedSpot + 1}: X digit{" "}
                {((value.pid >>> (selectedSpot * 8)) & 15)
                  .toString(16)
                  .toUpperCase()}
                , Y digit{" "}
                {((value.pid >>> (selectedSpot * 8 + 4)) & 15)
                  .toString(16)
                  .toUpperCase()}
                . Each has 16 positions per axis.
              </p>
              <div className="inline-buttons">
                <label>
                  <input
                    type="checkbox"
                    checked={handles}
                    onChange={(e) => setHandles(e.target.checked)}
                  />{" "}
                  Spot handles
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={shiny}
                    onChange={(e) => setShiny(e.target.checked)}
                  />{" "}
                  Shiny palette
                </label>
              </div>
              <p className="help">
                Outlines show draggable masks, including hidden parts. Turn
                handles off to compare the actual clipped Emerald pattern. Wait
                for the battle entrance animation to settle.
              </p>
              <button
                disabled={!painted || (!journey.caught && !encounterLevelValid)}
                onClick={() => go("match")}
              >
                Compare patterns with my drawing
              </button>
              <details>
                <summary>Use an exact PID entered manually</summary>
                <button
                  disabled={!!error || !painted}
                  onClick={() => useGuide(value.pid)}
                >
                  Use this PID
                </button>
              </details>
            </section>
          )}
        </div>
        {(error || search.error) && <p role="alert">{error || search.error}</p>}
        {step === "match" && (
          <section
            className="spinda-results"
            aria-label="Best matching Spinda PIDs"
          >
            <h3>Which pattern matches your drawing?</h3>
            {painted && (
              <div className="spinda-catch-preview">
                <SpindaSprite
                  pid={value.pid}
                  shiny={shiny}
                  overlayPid={overlay ? selected?.pid : undefined}
                />
                <span>Your painted pattern</span>
              </div>
            )}
            <button className="text-button" onClick={() => go("draw")}>
              Adjust my spot drawing
            </button>
            {!painted ? (
              <p>Paint the four spots before comparing candidates.</p>
            ) : cancelled ? (
              <p role="status">
                Search cancelled. No partial candidate pool is shown. Search
                again to rank the full range.
              </p>
            ) : !ready ? (
              <p role="status">
                {search.error
                  ? "No complete results available."
                  : !validNumbers
                    ? "Correct the RNG inputs to search."
                    : `Searching / matching… ${search.progress}%`}
              </p>
            ) : (
              <>
                <p role="status">
                  {matches.length.toLocaleString()} distinct wild Spinda PIDs in
                  this scope. Showing {Math.min(limit, matches.length)}. All
                  advances, methods and IV variants are retained.
                </p>
                {!!matches.length && (
                  <p>
                    {matches[0].score < 65
                      ? "No close visual match. Widen the range, adjust the spots or review the encounter settings."
                      : matches.filter((m) => m.score >= matches[0].score - 3)
                            .length > 1
                        ? "Several patterns match closely. Compare their spots."
                        : "The highlighted pattern is the closest match."}
                  </p>
                )}
                {!matches.length && (
                  <p>
                    No wild Spinda candidates in this scope. Widen the advance
                    range or review the seed, location, lead and observed
                    traits.
                  </p>
                )}
                {selected && (
                  <div className="spinda-comparison" ref={comparisonRef}>
                    <div className="spinda-enlarged">
                      <SpindaSprite pid={selected.pid} shiny={shiny} />
                    </div>
                    <div>
                      <strong>Selected 0x{hex(selected.pid, 8)}</strong>
                      <p>
                        {selected.score.toFixed(1)}% visual similarity ·{" "}
                        {selected.identicalPatterns} PID(s) share this exact
                        visible pattern in the scope.
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={overlay}
                          onChange={(e) => setOverlay(e.target.checked)}
                        />{" "}
                        Overlay differences on my painted pattern
                      </label>
                      <p className="help">
                        Cyan: candidate-only spots. Pink: spots found only in
                        your drawing. Compare the overlay on your painted
                        pattern above.
                      </p>
                      <button onClick={() => useGuide(selected.pid)}>
                        This matches my Spinda
                      </button>
                    </div>
                  </div>
                )}
                <div className="spinda-match-grid">
                  {(limit === 4 ? shortlist : matches.slice(0, limit)).map(
                    (m, i) => {
                      const usefulness = spindaUsefulness(
                        m,
                        countRemaining,
                        countTested,
                        lab.facts.otGender,
                      );
                      return (
                        <article
                          key={m.pid}
                          className={`spinda-match ${i === 0 ? "best" : ""}`}
                        >
                          <button
                            className="spinda-match-preview"
                            onClick={() => setSelectedPid(m.pid)}
                            aria-label={`Inspect PID ${hex(m.pid, 8)}`}
                          >
                            <SpindaSprite pid={m.pid} shiny={shiny} />
                          </button>
                          <strong>
                            {i === 0 ? "Best in scope · " : ""}0x{hex(m.pid, 8)}
                          </strong>
                          <small
                            className="spinda-usefulness"
                            aria-label="Useful untested SID digits"
                          >
                            {WILD_METHODS.map(
                              (method) =>
                                method +
                                ": " +
                                (m.encounters.some((e) =>
                                  e.methods.includes(method),
                                )
                                  ? usefulness.counts[method]
                                  : "—"),
                            ).join(" · ")}{" "}
                            useful digits
                          </small>
                          {usefulness.suggested && (
                            <small>
                              Catch in{" "}
                              {
                                FACT_CATALOGS.balls.find(
                                  (b) => b.id === usefulness.ball,
                                )?.name
                              }
                            </small>
                          )}
                          <span>{m.score.toFixed(1)}% similarity</span>
                          <span>
                            {NATURES[m.pid % 25]} ·{" "}
                            {genderForPid(SPINDA_SPECIES, m.pid)}
                          </span>
                          {m.identicalPatterns > 1 && (
                            <strong>
                              {m.identicalPatterns} visually identical PIDs
                            </strong>
                          )}
                          <details>
                            <summary>
                              {new Set(m.encounters.map((e) => e.advance)).size}{" "}
                              possible advance(s) ·{" "}
                              {[
                                ...new Set(
                                  m.encounters.flatMap((e) => e.methods),
                                ),
                              ].join(" / ")}
                            </summary>
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Advance</th>
                                    <th>Method</th>
                                    <th>Slot / level</th>
                                    <th>IVs: HP/Atk/Def/Spe/SpA/SpD</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {m.encounters.map((e, j) => (
                                    <tr key={j}>
                                      <td>{e.advance}</td>
                                      <td>{e.methods.join("/")}</td>
                                      <td>
                                        {e.slot + 1} / {e.level}
                                      </td>
                                      <td>{e.ivs.join("/")}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                          <button onClick={() => useGuide(m.pid)}>
                            This matches my Spinda
                          </button>
                        </article>
                      );
                    },
                  )}
                </div>
                {limit < matches.length && (
                  <button onClick={() => setLimit((n) => n + 20)}>
                    Show 20 more patterns
                  </button>
                )}
              </>
            )}
            <details>
              <summary>How patterns are compared</summary>
              <p>
                65% exact pixel overlap and 35% overlap within two sprite
                pixels, with symmetric penalties for extra and missing spots.
                Only pixels that can carry a PID spot are compared. The score is
                visual similarity, not a probability. Hidden or overlapping
                spots can leave multiple PIDs indistinguishable.
              </p>
            </details>
          </section>
        )}
        {step === "pixels" && value.guide?.enabled && (
          <SpindaSidGuide
            compact
            language={language}
            value={value.guide}
            facts={
              lab.activeSnapshot?.itemTest
                ? { ...lab.itemTestBaseline.knownFacts, ...lab.identity }
                : lab.facts
            }
            infoError={
              !!lab.factError ||
              !!lab.summaryError ||
              !!lab.ppError ||
              !!lab.pendingItemTest
            }
            sidDigitFilters={remaining}
            baseSids={baseSids}
            tested={progress.tested}
            rngCandidate={
              ready
                ? matches.find((m) => m.pid === value.guide?.pid)
                : undefined
            }
            rngStatus={
              !ready
                ? "Searching encounter IVs…"
                : "PID not found in this RNG range."
            }
            summaryDraft={
              lab.activeSnapshot?.itemTest
                ? summaryToDraft(lab.itemTestBaseline.summaryStats)
                : lab.summaryDraft
            }
            onSummaryChange={
              lab.activeSnapshot?.itemTest ? undefined : lab.editSummaryStat
            }
            onBallChange={
              lab.activeSnapshot?.itemTest
                ? undefined
                : (ball) => lab.editFact("ball", String(ball))
            }
            onChange={(guide) => update({ ...value, guide })}
            onLocate={locatePixel}
            onTargetsChange={onTargetsChange}
            analysisPending={lab.analysisBusy || !!lab.analysisError}
            onNext={() => go("plan")}
          />
        )}
        {step === "plan" && (
          <section>
            <p>
              {currentSids?.length.toLocaleString() ?? "…"} SID possibilities
              remain.
            </p>
            <div className="spinda-sid-digits">
              {countRemaining
                .slice()
                .reverse()
                .map((mask, i) => (
                  <div key={i}>
                    S{i + 1}
                    <strong>
                      {Array.from({ length: 16 }, (_, n) => n)
                        .filter((n) => mask & (1 << n))
                        .map((n) => hex(n, 1))
                        .join(" ")}
                    </strong>
                    <small>
                      {mask.toString(2).replaceAll("0", "").length} possible
                    </small>
                  </div>
                ))}
            </div>
            {lab.analysisError && <p role="alert">{lab.analysisError}</p>}
            {lab.analysisBusy ? (
              <p role="status">
                Comparing useful experiments with another catch…
              </p>
            ) : currentSids?.length === 1 ? (
              <p role="status">
                <strong>
                  SID found: {currentSids[0]} · 0x{hex(currentSids[0], 4)}
                </strong>
              </p>
            ) : !currentSids?.length ? (
              <p role="alert">
                No SID matches. Review the information, PID and pixel answers
                below.
              </p>
            ) : (
              <>
                {nextRoute?.kind === "vitamins" && vitaminRoute && (
                  <SpindaVitaminShopping
                    route={vitaminRoute}
                    value={journey}
                    onChange={setJourney}
                  />
                )}
                {vitaminRoute && lab.nextSpinda && (
                  <details>
                    <summary>Why this route?</summary>
                    <p>
                      For these remaining digit values, the vitamin checkpoints
                      gain about {vitaminRoute.informationGain.toFixed(2)} bits.
                      The shopping trip breaks even with more catches at{" "}
                      {Math.max(
                        0,
                        Math.round(
                          vitaminShoppingBreakEven(
                            vitaminRoute,
                            lab.nextSpinda,
                            journey.shoppingSeconds,
                          ),
                        ),
                      )}{" "}
                      seconds. Your estimate is {journey.shoppingSeconds}{" "}
                      seconds; available move and item tests are compared too.
                    </p>
                  </details>
                )}
                {selectedExperiment && (
                  <>
                    <h3>Next: {selectedExperiment.name}</h3>
                    <p>
                      {selectedExperiment.action
                        ? displayActionInstructions(selectedExperiment.action)
                        : "Use the PC item controls to give this item to your Spinda."}
                    </p>
                    <p className="help">
                      Estimated {effortLabel(selectedExperiment.seconds)} for
                      this test. The route compares expected SID information per
                      minute with another catch
                      {lab.nextSpinda
                        ? ` (about ${lab.nextSpinda.informationGain.toFixed(2)} bits in ${effortLabel(lab.nextSpinda.seconds)})`
                        : ""}
                      .
                    </p>
                    <button
                      disabled={
                        disabled ||
                        !!(
                          nextRoute?.kind === "vitamins" &&
                          vitaminRoute &&
                          (vitaminRoute.buyIron || vitaminRoute.buyCarbos)
                        )
                      }
                      onClick={() => beginExperiment(selectedExperiment)}
                    >
                      Start this experiment
                    </button>
                  </>
                )}
                {(!nextRoute || nextRoute.kind === "catch") && (
                  <>
                    <h3>Next: catch one more Spinda</h3>
                    <p>
                      A new PID is the most useful available route. Your SID
                      exclusions will carry over; the guide will ask for this
                      new catch’s level, moves, PP and other known information
                      again.
                    </p>
                    <button disabled={disabled} onClick={catchNext}>
                      Continue to the next encounter
                    </button>
                  </>
                )}
                {nextRoute && nextRoute.kind !== "catch" && (
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={catchNext}
                  >
                    Catch another Spinda instead
                  </button>
                )}
                <SpindaStockInputs value={journey} onChange={setJourney} />
              </>
            )}
          </section>
        )}
        {step === "experiment" && (
          <section>
            {lab.pendingItemTest ? (
              <>
                <h3>
                  {lab.pendingItemTest.itemTest?.action?.name ??
                    lab.pendingItemTest.name}
                </h3>
                <p>
                  {lab.pendingItemTest.itemTest?.action
                    ? displayActionInstructions(
                        lab.pendingItemTest.itemTest.action,
                      )
                    : "Give the selected item using the PC item controls."}
                </p>
                <p>
                  Put this Spinda in Box {placement.box}, slot {placement.slot}.
                  Leave and reenter Rustboro’s Trainers’ School, then check this
                  pixel.
                </p>
                {lab.experimentTargets?.[0] !== undefined ? (
                  <div className="spinda-experiment-question">
                    <SpindaCurtainLocator nibble={lab.experimentTargets[0]} />
                    <div>
                      <SidPixelQuestion
                        target={{
                          nibble: lab.experimentTargets[0],
                          field: "Experiment pixel",
                        }}
                        disabled={disabled}
                        onAnswer={(a) =>
                          lab.answerTarget(lab.experimentTargets![0], a)
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p role="status">
                    {lab.analysisBusy
                      ? "Finding the next useful pixel…"
                      : "No useful pixels remain for this test."}
                  </p>
                )}
                <button
                  disabled={
                    disabled ||
                    !lab.activeSnapshot.observations.some((v) => v !== -1)
                  }
                  onClick={lab.saveVerifiedTargets}
                >
                  Keep answers and finish test
                </button>
                {lab.canUndoExperimentAnswer && (
                  <button
                    disabled={disabled}
                    onClick={lab.undoLastExperimentAnswer}
                  >
                    Undo last answer
                  </button>
                )}
                <button
                  onClick={() => {
                    lab.cancelItemTest();
                    go("restore");
                  }}
                >
                  Cancel test
                </button>
              </>
            ) : (
              <>
                <h3>Test recorded</h3>
                <p>{journey.restore}</p>
                <button disabled={disabled} onClick={() => go("plan")}>
                  Original Spinda restored — choose next step
                </button>
              </>
            )}
          </section>
        )}
        {step === "restore" && (
          <section>
            <h3>Restore the original Spinda</h3>
            <p>{journey.restore}</p>
            <button disabled={disabled} onClick={() => go("plan")}>
              Restored — continue
            </button>
          </section>
        )}
        {pageNavigation}
        {!!lab.pendingItemTest && step === "experiment" && (
          <p className="help">
            Finish or cancel the active experiment before changing pages.
          </p>
        )}
        {!beforeCatch && (
          <details className="spinda-review">
            <summary>Review or correct recorded information</summary>
            <p>
              Changing an answer recalculates candidates. Complete any active
              experiment first.
            </p>
            <div className="inline-buttons">
              {(
                [
                  ["stats", "Summary stats"],
                  ["information", "Pokémon information"],
                  ["moves", "Moves and PP"],
                  ["details", "Trainer and other data"],
                  ["draw", "Spots / PID"],
                  ["pixels", "Pixel answers"],
                ] as const
              ).map(([s, label]) => (
                <button
                  key={s}
                  disabled={!!lab.pendingItemTest}
                  onClick={() => go(s)}
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
        )}
      </section>
    </>
  );
}
