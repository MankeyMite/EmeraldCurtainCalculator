import { useMemo, useRef, useState, useEffect } from "react";
import type { Hit } from "../components/PixelGrid";
import { parseRecord, decodePokemon, exampleRecord } from "../core/pokemon";
import { assembleMemory, type Records, type Slot } from "../core/memory";
import { RAW_PLACEMENTS, nibbleValue } from "../core/tiles";
import {
  emptyObservations,
  recordMasks,
  compareCandidate,
  constraintHex,
  type Observations,
  type Observation,
  type KnownFacts,
} from "../core/constraints";
import {
  loadInvestigation,
  saveInvestigation,
  investigationFileName,
  splitFacts,
  newSnapshot,
  type Snapshot,
  type Origin,
} from "../core/investigation";
import { diagnoseHypothesis, makeHypothesis } from "../core/sid";
import { validateFacts } from "../core/session";
import { validateSidRng, type SidRngSettings } from "../core/sidRng";
import { useDeduction } from "./useDeduction";
import {
  correctStarterCheckpointEvs,
  correctStarterCheckpointFacts,
} from "../core/starterEvidence";
import { GUIDE_LAB_KEY } from "../core/starterGuide";
import {
  starterExperimentSource,
  hasStarterDrawing,
  continueStarterExperiment,
  updatedStarterCheckpoint,
} from "../core/starterExperimentFlow";
import { createControlledTest } from "../core/controlledExperiments";
import {
  createItemTest,
  answerItemTest,
  finishItemTest,
  isRecorded,
  itemTestBaseline,
  recordItemTest,
  isEvidence,
  targetExperiment,
  answerExperimentPixel,
  finishPixelExperiment,
  experimentToUndo,
  undoExperimentAnswer,
} from "../core/itemTests";
import { AUTOSAVE_KEY, readAutosave } from "../core/autosave";
import {
  validateRngSettings,
  rngAppliesToOrigin,
  type RngSettings,
} from "../core/rng";
import { EMPTY_DEDUCTION } from "../core/deduction";
import { ppInputError } from "../core/pp";
import { PROFILE } from "../core/memory";
import { completeAssistedDrawing } from "../core/pixelAssistance";
import { validateSidDigitFilters } from "../core/sidDigitFilters";
import { loadResearchExample, type ResearchExampleId } from "../core/examples";
import {
  freshCapturePreset,
  refreshCaptureDefaults,
  factsToDraft,
  draftToFacts,
  newPokemonFacts,
  ppUpDraftChange,
  wildStoragePreset,
} from "../core/facts";
import { windowLayout } from "../core/window";
import {
  defaultSpindaMatcher,
  spindaEstimatedFacts,
  validateSpindaMatcher,
  type SpindaMatcherState,
} from "../core/spindaMatcher";
import { fieldPossibilities } from "../core/inference";
import { newSpindaSidGuide } from "../core/spindaSidGuide";
import {
  sidCandidateMasks,
  spindaTrainerFacts,
  type SpindaSidProgress,
} from "../core/spindaUsefulness";
import {
  summaryFromDraft,
  summaryToDraft,
  promoteExactIVs,
} from "../core/stats";

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useCurtainLab(autosaveKey = AUTOSAVE_KEY) {
  const [restored] = useState(() => {
    try {
      return typeof window === "undefined"
        ? null
        : readAutosave(window.localStorage, autosaveKey);
    } catch {
      return null;
    }
  });
  const initialSnapshot = restored?.snapshots.find(
    (s) => s.id === restored.activeId,
  );
  const initialFacts = restored
    ? {
        ...restored?.identity,
        ...initialSnapshot?.knownFacts,
      }
    : newPokemonFacts();
  const [mode, setMode] = useState<"solver" | "renderer">("solver"),
    [records, setRecords] = useState<Records>({}),
    [names, setNames] = useState<Partial<Record<Slot, string>>>({});
  const [obs, setObs] = useState<Observations>(
      () => initialSnapshot?.observations.slice() ?? emptyObservations(),
    ),
    obsRef = useRef(obs),
    [undo, setUndo] = useState<Observations[]>([]),
    [redo, setRedo] = useState<Observations[]>([]),
    stroke = useRef<Observations | null>(null);
  const [hexSource, setHexSource] = useState<"inferred" | "pixels">("inferred"),
    [zoom, setZoom] = useState(20),
    [grid, setGrid] = useState(true),
    [gameBackground, setGameBackground] = useState(true),
    [showNeighbors, setShowNeighbors] = useState(false),
    [view, setView] = useState<"raw" | "room" | "research">("room"),
    [showConflicts, setShowConflicts] = useState(true);
  const [hover, setHover] = useState<Hit | null>(null),
    [target, setTarget] = useState<Slot>(5),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [facts, setFacts] = useState<KnownFacts>(initialFacts),
    [factDraft, setFactDraft] = useState<Record<string, string>>(() =>
      factsToDraft(initialFacts),
    ),
    [factError, setFactError] = useState("");
  const [selectedPixel, setSelectedPixel] = useState<Hit | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<Record<string, string>>(() =>
    summaryToDraft(initialSnapshot?.summaryStats),
  );
  const [origin, setOrigin] = useState<Origin>(restored?.origin ?? "unknown");
  const [rngSettings, setRngSettings] = useState<RngSettings | undefined>(
    restored?.rng,
  );
  const [sidRngSettings, setSidRngSettings] = useState<
    SidRngSettings | undefined
  >(restored?.sidRng);
  const [sidDigitFilters, setSidDigitFilters] = useState<number[] | undefined>(
    restored?.sidDigitFilters,
  );
  const [sidCandidateCheck, setSidCandidateCheck] = useState("");
  const [spindaMatcher, setSpindaMatcher] = useState<SpindaMatcherState>(
    () => restored?.spindaMatcher ?? defaultSpindaMatcher(),
  );
  const [snapshots, setSnapshots] = useState<Snapshot[]>(
    restored?.snapshots ?? [newSnapshot("first", "Observation 1")],
  );
  const [activeId, setActiveId] = useState(restored?.activeId ?? "first");
  const [ownedItems, setOwnedItems] = useState<number[]>(
    restored?.ownedItems ?? [],
  );
  const [saveStatus, setSaveStatus] = useState("Saving on this device…");
  const [showPredictions, setShowPredictions] = useState(true);
  const [drawingInProgress, setDrawingInProgress] = useState(false);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const frozenAssistance = useRef(EMPTY_DEDUCTION.assistance);
  const summaryState = useMemo(() => {
    try {
      return { value: summaryFromDraft(summaryDraft), error: "" };
    } catch (error) {
      return { value: null, error: (error as Error).message };
    }
  }, [summaryDraft]);
  const identity = useMemo(() => splitFacts(facts).identity, [facts]);
  const currentSnapshots = useMemo(
    () =>
      snapshots.map((s) =>
        s.id === activeId
          ? {
              ...s,
              observations: obs,
              knownFacts: splitFacts(facts).mutable,
              summaryStats: summaryState.value ?? undefined,
            }
          : s,
      ),
    [snapshots, activeId, obs, facts, summaryState],
  );
  const activeSnapshot = currentSnapshots.find((s) => s.id === activeId)!;
  const guided = autosaveKey === GUIDE_LAB_KEY;
  const originalItemBaseline = guided
    ? starterExperimentSource(currentSnapshots, activeId)
    : itemTestBaseline(currentSnapshots);
  const lastCompletedItemTest = [...currentSnapshots]
    .reverse()
    .find((s) => s.itemTest?.phase === "recorded");
  const pendingItemTest = currentSnapshots.find((s) => !isRecorded(s));
  const undoableExperiment = experimentToUndo(currentSnapshots);
  const evidenceSnapshot = isRecorded(activeSnapshot)
    ? activeSnapshot
    : currentSnapshots.find((s) => s.id === activeSnapshot.itemTest!.sourceId)!;
  const canvasRef = useRef<HTMLCanvasElement | null>(null),
    fileRef = useRef<HTMLInputElement | null>(null),
    sessionRef = useRef<HTMLInputElement | null>(null);
  const exampleBackup = useRef<ReturnType<typeof snapshot> | null>(null);
  const [activeResearchExample, setActiveResearchExample] = useState<
    string | null
  >(null);
  function snapshot() {
    return {
      observations: obsRef.current.slice(),
      facts,
      factDraft,
      factError,
      summaryDraft,
      records,
      names,
      mode,
      view,
      showNeighbors,
      target,
      zoom,
      grid,
      gameBackground,
      hexSource,
      showConflicts,
      showPredictions,
      undo,
      redo,
      snapshots: currentSnapshots,
      activeId,
      origin,
      ownedItems,
      rngSettings,
      sidRngSettings,
      sidDigitFilters,
      spindaMatcher,
    };
  }
  const autosaveText = useMemo(() => {
    if (factError || summaryState.error || activeResearchExample) return null;
    try {
      return saveInvestigation({
        format: "emerald-curtain-investigation",
        schemaVersion: 1,
        mappingVersion: PROFILE.id,
        origin,
        identity,
        snapshots: currentSnapshots,
        activeId,
        ownedItems,
        ...(rngSettings ? { rng: rngSettings } : {}),
        ...(sidRngSettings ? { sidRng: sidRngSettings } : {}),
        ...(sidDigitFilters ? { sidDigitFilters } : {}),
        spindaMatcher,
      });
    } catch {
      return null;
    }
  }, [
    factError,
    summaryState.error,
    activeResearchExample,
    origin,
    identity,
    currentSnapshots,
    activeId,
    ownedItems,
    rngSettings,
    sidRngSettings,
    sidDigitFilters,
    spindaMatcher,
  ]);
  useEffect(() => {
    if (!autosaveText) {
      setSaveStatus(
        activeResearchExample
          ? "Example workspace · autosave paused"
          : "Autosave paused until inputs are valid",
      );
      return;
    }
    setSaveStatus("Saving on this device…");
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(autosaveKey, autosaveText);
        setSaveStatus("Saved on this device");
      } catch {
        setSaveStatus("Autosave unavailable · use Save investigation");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [autosaveText, activeResearchExample, autosaveKey]);
  const memory = useMemo(() => assembleMemory(records), [records]),
    masks = useMemo(() => recordMasks(obs, 5), [obs]),
    suppliedMasks = useMemo(
      () =>
        mode === "renderer" && records[5]
          ? Array.from(
              { length: 160 },
              (_, i) => 1 << ((records[5]![i >> 1] >> ((i % 2) * 4)) & 15),
            )
          : mode === "renderer"
            ? Array<number>(160).fill(0xffff)
            : masks,
      [mode, records, masks],
    );
  const rngActive = rngAppliesToOrigin(rngSettings, origin);
  const ppError =
    Array.from({ length: 4 }, (_, i) =>
      ppInputError(facts.moves?.[i] ?? undefined, factDraft[`pp_${i}`] ?? ""),
    ).find(Boolean) ?? "";
  const combinedSidFilters = useMemo(
    () =>
      sidCandidateMasks(spindaMatcher.sidProgress?.remainingSids).map(
        (mask, n) => mask & (sidDigitFilters?.[n] ?? 65535),
      ),
    [spindaMatcher.sidProgress?.remainingSids, sidDigitFilters],
  );
  const deduction = useDeduction(
    {
      identity,
      snapshots: currentSnapshots,
      activeId,
      ...(autosaveKey === GUIDE_LAB_KEY ? { starterGuide: true } : {}),
      ...(rngActive && identity.species !== undefined
        ? { rng: rngSettings }
        : {}),
      ...(sidRngSettings ? { sidRng: sidRngSettings } : {}),
      sidDigitFilters: combinedSidFilters,
      ...(spindaMatcher.sidProgress?.remainingSids
        ? { sidCandidates: spindaMatcher.sidProgress.remainingSids }
        : {}),
      ...(mode === "renderer" ? { renderMasks: suppliedMasks } : {}),
      ...(spindaMatcher.guide &&
      identity.species === 308 &&
      identity.pid === spindaMatcher.guide.pid
        ? {
            spindaGuide: {
              guide: spindaMatcher.guide,
              settings: spindaMatcher.settings,
            },
          }
        : {}),
      ...(identity.species === 308 && identity.pid !== undefined
        ? {
            spindaPlanning: {
              settings: spindaMatcher.settings,
              tested: spindaMatcher.sidProgress?.tested ?? [0, 0, 0, 0],
            },
          }
        : {}),
    },
    drawingInProgress,
    !factError && !summaryState.error && !ppError,
    analysisRevision,
  );
  const {
    investigationInference,
    inference,
    recovery,
    experiments,
    controlledExperiments,
    domainQuestions,
    experimentStatus,
    experimentLimitations,
    experimentProgress,
    ivEstimates,
    curtainSidAnalysis,
    sidAnalysis,
  } = deduction.data;
  const sidRngRows = deduction.data.sidRows,
    sidRngResult = deduction.data.sidResult;
  const wildRng = {
    result: deduction.data.wildResult,
    busy: rngActive && deduction.busy,
    progress: deduction.progress,
    error: rngActive ? deduction.error : "",
    retry: () => setAnalysisRevision((n) => n + 1),
  };
  const sidWorker = {
    busy: !!sidRngSettings && deduction.busy,
    progress: deduction.progress,
    error: sidRngSettings ? deduction.error : "",
  };
  const assistance = drawingInProgress
    ? frozenAssistance.current
    : deduction.data.assistance;
  const predictions =
    mode !== "solver" ||
    factError ||
    (!drawingInProgress && (!deduction.current || deduction.error))
      ? emptyObservations()
      : assistance.predictions;
  const displayedMasks =
    mode === "solver" && hexSource === "inferred"
      ? inference.masks
      : suppliedMasks;
  const experimentTargets =
    deduction.current && !deduction.error
      ? deduction.data.experimentTargets
      : (activeSnapshot.targets ?? []).filter(
          (n) => activeSnapshot.observations[n] === -1,
        );
  useEffect(() => {
    if (
      !deduction.current ||
      deduction.busy ||
      deduction.error ||
      factError ||
      summaryState.error ||
      ppError ||
      deduction.error ||
      ppError ||
      drawingInProgress ||
      activeSnapshot.itemTest?.mode !== "pixels" ||
      isRecorded(activeSnapshot) ||
      experimentTargets.length
    )
      return;
    if (activeSnapshot.observations.some((v) => v !== -1))
      saveVerifiedTargets();
  }, [deduction.current, deduction.data, drawingInProgress, activeId]);
  const comparison = useMemo(
    () => compareCandidate(obs, records, facts),
    [obs, records, facts],
  );
  const conflicts = useMemo(
    () =>
      new Set(
        mode === "solver" && showConflicts
          ? [...comparison.contradictions, ...assistance.contradictions]
          : [],
      ),
    [comparison, mode, showConflicts, assistance],
  );
  const imported = useMemo(
    () => (records[5] ? decodePokemon(records[5]) : null),
    [records],
  );
  const layout = windowLayout("left");
  const placements = view === "room" ? layout.placements : RAW_PLACEMENTS;
  const bounds =
    view === "room"
      ? { x: layout.bounds.x, y: 14, w: 32, h: 26 }
      : { x: 0, y: 0, w: 28, h: 8 };
  const field = (offset: number, size: number) =>
    fieldPossibilities(
      inference.masks,
      inference.byteValues,
      offset,
      size,
      (!inference.cryptoFacts &&
        facts.gender === undefined &&
        facts.shiny === undefined) ||
        mode === "renderer",
      inference.byteCountsExact,
    );
  const pid = { ...field(0, 4), count: inference.pidCount, countExact: true },
    tid = field(4, 2),
    sid = field(6, 2),
    orders = inference.orders,
    natures = inference.natures;
  const missing = 96 - memory.filter((b) => b !== null).length;
  const missingNeighbors = memory
    .slice(0, 8)
    .concat(memory.slice(88))
    .filter((b) => b === null).length;
  function update(next: Observations) {
    obsRef.current = next;
    setObs(next);
  }
  function change(next: Observations) {
    if (next.some((o, i) => o !== obsRef.current[i])) {
      const before = obsRef.current.slice();
      setUndo((h) => [...h.slice(-99), before]);
      setRedo([]);
      update(next);
    }
  }
  function start() {
    if (!drawingInProgress)
      frozenAssistance.current = {
        ...assistance,
        predictions: predictions.slice(),
      };
    setDrawingInProgress(true);
    stroke.current = obsRef.current.slice();
  }
  function paint(indices: number[], value: Observation) {
    const next = obsRef.current.slice();
    let changed = false;
    for (const i of indices)
      if (next[i] !== value) {
        next[i] = value;
        changed = true;
      }
    if (changed) update(next);
  }
  function finish() {
    const before = stroke.current;
    stroke.current = null;
    if (before && before.some((o, i) => o !== obsRef.current[i])) {
      setUndo((h) => [...h.slice(-99), before]);
      setRedo([]);
    }
  }
  function undoStroke() {
    if (!undo.length) return;
    const before = obsRef.current.slice();
    setRedo((h) => [...h, before]);
    update(undo.at(-1)!);
    setUndo((h) => h.slice(0, -1));
  }
  function redoStroke() {
    if (!redo.length) return;
    const before = obsRef.current.slice();
    setUndo((h) => [...h, before]);
    update(redo.at(-1)!);
    setRedo((h) => h.slice(0, -1));
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        e.shiftKey ? redoStroke() : undoStroke();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function importBytes(bytes: Uint8Array, name: string, slot = target) {
    const b = parseRecord(bytes);
    setRecords((r) => ({ ...r, [slot]: b }));
    setNames((n) => ({ ...n, [slot]: name }));
    setError("");
    setNotice(`Loaded ${name}: 80 encrypted bytes in slot ${slot}.`);
    // New users importing a record expect to see its pixels immediately.
    // Preserve a painted workspace in comparison mode instead.
    if (slot === 5 && obsRef.current.every((o) => o === -1)) {
      setMode("renderer");
      setView("room");
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".pk3"))
        throw Error(
          "A .pk3 may be decrypted. Supply the original encrypted .ek3 bytes.",
        );
      importBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function example(kind: "pattern" | "pokemon") {
    importBytes(
      exampleRecord(kind),
      kind === "pattern" ? "Nibble ordering fixture" : "Synthetic Pikachu",
      5,
    );
  }
  function researchExample(id: ResearchExampleId) {
    try {
      const example = loadResearchExample(id);
      if (!exampleBackup.current) exampleBackup.current = snapshot();
      stroke.current = null;
      update(example.session.observations);
      setUndo([]);
      setRedo([]);
      setFacts(example.session.knownFacts);
      setFactDraft(factsToDraft(example.session.knownFacts));
      setSummaryDraft(summaryToDraft(example.session.summaryStats));
      setSnapshots([newSnapshot("example", example.title)]);
      setActiveId("example");
      setOrigin("unknown");
      setRngSettings(undefined);
      setSidRngSettings(undefined);
      setSidDigitFilters(undefined);
      setOwnedItems([]);
      setRecords(example.records);
      setNames({
        5: example.title + " - reference .ek3",
        ...(example.records[4] ? { 4: "Captured empty slot" } : {}),
        ...(example.records[6] ? { 6: "Captured empty slot" } : {}),
      });
      setFactError("");
      setError("");
      setHover(null);
      setTarget(5);
      setMode("solver");
      setView("room");
      setShowNeighbors(false);
      setZoom(20);
      setGrid(true);
      setGameBackground(true);
      setHexSource("inferred");
      setShowConflicts(true);
      setActiveResearchExample(example.title);
      setNotice(
        "Saved observations and known facts loaded. The reference record is used only for comparison. Open Data Recovery to explore the results.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function restoreWorkspace() {
    setDrawingInProgress(false);
    const before = exampleBackup.current;
    if (!before) return;
    stroke.current = null;
    update(before.observations);
    setFacts(before.facts);
    setFactDraft(before.factDraft);
    setFactError(before.factError);
    setSummaryDraft(before.summaryDraft);
    setSnapshots(before.snapshots);
    setActiveId(before.activeId);
    setOrigin(before.origin);
    setRngSettings(before.rngSettings);
    setSidRngSettings(before.sidRngSettings);
    setSidDigitFilters(before.sidDigitFilters);
    setSpindaMatcher(before.spindaMatcher);
    setOwnedItems(before.ownedItems);
    setRecords(before.records);
    setNames(before.names);
    setMode(before.mode);
    setView(before.view);
    setShowNeighbors(before.showNeighbors);
    setTarget(before.target);
    setZoom(before.zoom);
    setGrid(before.grid);
    setGameBackground(before.gameBackground);
    setHexSource(before.hexSource);
    setShowConflicts(before.showConflicts);
    setShowPredictions(before.showPredictions);
    setUndo(before.undo);
    setRedo(before.redo);
    setHover(null);
    setError("");
    setActiveResearchExample(null);
    exampleBackup.current = null;
    setNotice("Your previous workspace has been restored.");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        constraintHex(
          mode === "renderer"
            ? suppliedMasks
            : hexSource === "inferred"
              ? inference.masks
              : masks,
        ),
      );
      setNotice(
        `Copied ${mode === "solver" && hexSource === "inferred" ? "inferred" : "pixel"} constraints: + means nonzero; ? means unresolved.`,
      );
    } catch {
      setError("Clipboard unavailable. Select the copyable constraints below.");
    }
  }
  function exportPng() {
    canvasRef.current?.toBlob((b) => {
      if (b) download(`curtain-${mode}-${view}.png`, b);
    }, "image/png");
  }
  async function importSession(file?: File) {
    setDrawingInProgress(false);
    if (!file) return;
    try {
      const investigation = loadInvestigation(await file.text());
      const s = investigation.snapshots.find(
        (s) => s.id === investigation.activeId,
      )!;
      const loadedFacts = { ...investigation.identity, ...s.knownFacts };
      update(s.observations);
      setUndo([]);
      setRedo([]);
      setFacts(loadedFacts);
      setFactDraft(factsToDraft(loadedFacts));
      setSummaryDraft(summaryToDraft(s.summaryStats));
      setSnapshots(investigation.snapshots);
      setActiveId(s.id);
      setOrigin(investigation.origin);
      setRngSettings(investigation.rng);
      setSidRngSettings(investigation.sidRng);
      setSidDigitFilters(investigation.sidDigitFilters);
      setSpindaMatcher(investigation.spindaMatcher ?? defaultSpindaMatcher());
      setOwnedItems(investigation.ownedItems);
      exampleBackup.current = null;
      setActiveResearchExample(null);
      setFactError("");
      setMode("solver");
      setError("");
      setNotice("Observations restored. Candidate records are independent.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function editFact(
    key: string,
    value: string,
    related: Record<string, string> = {},
  ) {
    setDrawingInProgress(false);
    const draft = { ...factDraft, ...related, [key]: value };
    if (key === "species") {
      draft.ability = "";
      if (!value) draft.gender = "";
    }
    setFactDraft(draft);
    try {
      const next = refreshCaptureDefaults(
        draftToFacts(
          draft,
          facts.assumed?.filter((k) => k !== key && !(k in related)),
        ),
        key,
      );
      setFacts(next);
      // Preserve the user's text while updating dependent assumed defaults.
      const refreshed = factsToDraft(next);
      setFactDraft({
        ...draft,
        ...Object.fromEntries(
          [
            "friendship",
            "nickname",
            "headerFlags",
            "ppBonuses",
            ...Array.from({ length: 4 }, (_, i) => `pp_${i}`),
          ]
            .filter((k) => k !== key)
            .map((k) => [k, refreshed[k] ?? ""]),
        ),
      });
      setFactError("");
    } catch (e) {
      setFactError((e as Error).message + "; last valid facts remain active.");
    }
  }
  function editMovePpUps(index: number, stage: number) {
    const patch = ppUpDraftChange(facts, index, stage);
    editFact(`pp_${index}`, patch[`pp_${index}`], patch);
  }
  const hv = hover ? nibbleValue(memory, hover.nibble) : null,
    ob = hover ? obs[hover.nibble] : -1;
  const fieldText = (f: ReturnType<typeof field>) =>
    f.count === 0n
      ? "Contradiction"
      : f.exact !== null
        ? `${f.exact.toString()} · ${mode === "renderer" ? "supplied record value" : "exact under active constraints"}`
        : `${f.countExact ? "" : "≤ "}${f.count.toLocaleString()} possible values${f.countExact ? "" : " (upper bound)"}`;
  function saveDrawing() {
    if (factError || summaryState.error) {
      setError(factError || summaryState.error);
      return;
    }
    try {
      download(
        investigationFileName(identity.species),
        new Blob(
          [
            saveInvestigation({
              format: "emerald-curtain-investigation",
              schemaVersion: 1,
              mappingVersion: PROFILE.id,
              identity,
              snapshots: currentSnapshots,
              activeId,
              origin,
              ownedItems,
              ...(rngSettings ? { rng: rngSettings } : {}),
              ...(sidRngSettings ? { sidRng: sidRngSettings } : {}),
              ...(sidDigitFilters ? { sidDigitFilters } : {}),
              spindaMatcher,
            }),
          ],
          {
            type: "application/json",
          },
        ),
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function resetSolver() {
    setDrawingInProgress(false);
    const id = crypto.randomUUID();
    update(emptyObservations());
    setUndo([]);
    setRedo([]);
    stroke.current = null;
    const defaults = newPokemonFacts();
    setFacts(defaults);
    setFactDraft(factsToDraft(defaults));
    setFactError("");
    setSummaryDraft({});
    setSnapshots([newSnapshot(id, "Observation 1")]);
    setRngSettings(undefined);
    setSidRngSettings(undefined);
    setSidDigitFilters(undefined);
    setActiveId(id);
    setOrigin("unknown");
    setOwnedItems([]);
    setRecords({});
    setNames({});
    setMode("solver");
    setView("room");
    setTarget(5);
    setShowNeighbors(false);
    setHexSource("inferred");
    setHover(null);
    setSelectedPixel(null);
    setSidCandidateCheck("");
    setSpindaMatcher(defaultSpindaMatcher());
    setError("");
    setActiveResearchExample(null);
    exampleBackup.current = null;
    if (fileRef.current) fileRef.current.value = "";
    if (sessionRef.current) sessionRef.current.value = "";
    setNotice(
      "Ready for a new Pokémon. Previous evidence cleared; editable English Emerald, normal flags and empty-move defaults applied. Autosave is active.",
    );
  }
  function removeRecord(slot: Slot) {
    setRecords((r) => ({ ...r, [slot]: undefined }));
    setNames((n) => ({ ...n, [slot]: undefined }));
    setNotice("");
  }
  function zeroEVs() {
    setDrawingInProgress(false);
    if (factError) return;
    const next = {
      ...facts,
      evs: [0, 0, 0, 0, 0, 0],
      assumed: (facts.assumed ?? []).filter((k) => !k.startsWith("ev_")),
    };
    setFacts(next);
    setFactDraft((draft) => ({
      ...draft,
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [`ev_${i}`, "0"]),
      ),
    }));
    setFactError("");
  }
  function applyFreshDefaults() {
    setDrawingInProgress(false);
    const next = freshCapturePreset(facts);
    setFacts(next);
    setFactDraft(factsToDraft(next));
    setFactError("");
    setNotice(
      "Newly caught defaults applied. They can be changed or cleared to unknown.",
    );
  }
  function applyWildStorageDefaults() {
    setDrawingInProgress(false);
    if (origin !== "wild" || factError) return;
    const next = wildStoragePreset(facts);
    setFacts(next);
    setFactDraft(factsToDraft(next));
    setNotice(
      "Normal Emerald wild-catch storage assumptions applied: zero filler and no unused/fateful bits. These are assumptions, not recovered bytes.",
    );
  }
  function clearFacts() {
    setDrawingInProgress(false);
    setFacts({});
    setFactDraft({});
    setFactError("");
    setSummaryDraft({});
  }
  function applyEstimatedIVs() {
    setDrawingInProgress(false);
    if (
      mode !== "solver" ||
      !isRecorded(activeSnapshot) ||
      summaryState.error ||
      factError ||
      !inference.consistent ||
      ivEstimates.some((row) => row.stats !== null && row.combined.length === 0)
    )
      return;
    const next = promoteExactIVs(facts, ivEstimates);
    setFacts(next);
    setFactDraft(factsToDraft(next));
    setNotice(
      "Exact IVs from the current stats/curtain intersection added to known information. Ranges were left unresolved.",
    );
  }
  function clearDefaults() {
    setDrawingInProgress(false);
    const draft = { ...factDraft };
    for (const key of facts.assumed ?? []) draft[key] = "";
    setFactDraft(draft);
    try {
      setFacts(draftToFacts(draft));
      setFactError("");
    } catch (error) {
      setFactError(
        (error as Error).message + "; last valid facts remain active.",
      );
    }
  }
  function completeDrawing() {
    if (factError || summaryState.error || ppError) {
      setError(factError || summaryState.error || ppError);
      return false;
    }
    // Finish explicitly confirms the whole visible baseline, including any
    // untouched automatic pixels. Targeted experiments save only real answers.
    if (!activeSnapshot.itemTest)
      change(
        completeAssistedDrawing(
          obsRef.current,
          showPredictions ? predictions : emptyObservations(),
        ),
      );
    setDrawingInProgress(false);
    setAnalysisRevision((n) => n + 1);
    setMode("solver");
    setNotice(
      activeSnapshot.itemTest
        ? "Verified experiment pixels submitted. Unexamined pixels stay unrecorded."
        : "Visible drawing confirmed and saved, including unchanged automatic pixels. Painted overrides are preserved; remaining blanks are transparent. Undo can restore the previous drawing.",
    );
    return true;
  }
  function activateSnapshot(id: string) {
    setDrawingInProgress(false);
    if (factError || summaryState.error) {
      setError("Correct invalid inputs before changing observations.");
      return;
    }
    const next = currentSnapshots.find((s) => s.id === id);
    if (!next) return;
    setSnapshots(currentSnapshots);
    setActiveId(id);
    const nextFacts = { ...next.knownFacts, ...identity };
    setFacts(nextFacts);
    setFactDraft(factsToDraft(nextFacts));
    setSummaryDraft(summaryToDraft(next.summaryStats));
    stroke.current = null;
    update(next.observations);
    setUndo([]);
    setRedo([]);
    setHover(null);
    setMode("solver");
  }
  function addObservation(itemId?: number) {
    if (itemId !== undefined) {
      startItemTest(itemId);
      return;
    }
    if (factError || summaryState.error || currentSnapshots.length >= 100)
      return;
    const next = newSnapshot(
      crypto.randomUUID(),
      `Observation ${currentSnapshots.length + 1}`,
    );
    useItemSnapshot(next, [...currentSnapshots, next]);
    setNotice(
      "New observation: earlier drawings preserved. Record only what you can see; other pixels stay unknown.",
    );
  }
  function editSnapshot(key: "name" | "notes", value: string) {
    setSnapshots(
      currentSnapshots.map((s) =>
        s.id === activeId ? { ...s, [key]: value } : s,
      ),
    );
  }
  function removeObservation() {
    if (
      currentSnapshots.length < 2 ||
      factError ||
      summaryState.error ||
      currentSnapshots.some(
        (s) => s.itemTest?.sourceId === activeId || s.supersededBy === activeId,
      )
    )
      return;
    const remaining = currentSnapshots.filter((s) => s.id !== activeId),
      next = remaining[0];
    activateSnapshot(next.id);
    setSnapshots(remaining);
  }
  function observePixel(index: number, value: Observation) {
    if (
      activeSnapshot.itemTest?.mode === "pixels" &&
      activeSnapshot.targets?.includes(index)
    ) {
      answerTarget(index, value);
      return;
    }
    if (!drawingInProgress)
      frozenAssistance.current = {
        ...assistance,
        predictions: predictions.slice(),
      };
    setDrawingInProgress(true);
    const next = obsRef.current.slice();
    next[index] = value;
    change(next);
  }
  function highlightReferenceConflicts() {
    setSnapshots(
      currentSnapshots.map((s) =>
        s.id === activeId
          ? {
              ...s,
              targets: comparison.contradictions.filter(
                (n) => n >= 16 && n < 176,
              ),
            }
          : s,
      ),
    );
    setNotice(
      "Reference disagreements highlighted in orange. Open Curtain Editor and check them in game; your observations have not been changed.",
    );
  }
  function useItemSnapshot(next: Snapshot, all: Snapshot[]) {
    setAnalysisRevision((n) => n + 1);
    setDrawingInProgress(false);
    setSnapshots(all);
    setActiveId(next.id);
    const nextFacts = { ...next.knownFacts, ...identity };
    setFacts(nextFacts);
    setFactDraft(factsToDraft(nextFacts));
    setSummaryDraft(summaryToDraft(next.summaryStats));
    update(next.observations.slice());
    setUndo([]);
    setRedo([]);
    stroke.current = null;
    setHover(null);
    setMode("solver");
  }
  function startItemTest(itemId: number, guidedTargets?: number[]) {
    if (
      factError ||
      summaryState.error ||
      pendingItemTest ||
      deduction.busy ||
      drawingInProgress ||
      currentSnapshots.length >= 100
    )
      return;
    const recommendation = experiments.find((e) => e.item.id === itemId);
    if (!recommendation) return;
    const next = createItemTest(
      originalItemBaseline,
      crypto.randomUUID(),
      itemId,
      guidedTargets ?? recommendation.pixels.map((p) => p.index),
      sidAnalysis?.candidates.length ?? Number(investigationInference.pidCount),
    );
    const targeted = guided
      ? continueStarterExperiment(targetExperiment(next))
      : targetExperiment(next);
    useItemSnapshot(targeted, [...currentSnapshots, targeted]);
    setNotice(
      `Item test selected. Compare the new item's curtain with original drawing “${originalItemBaseline.name}”.`,
    );
  }
  function startControlledTest(id: string, guidedTargets?: number[]) {
    if (
      factError ||
      summaryState.error ||
      pendingItemTest ||
      deduction.busy ||
      drawingInProgress ||
      currentSnapshots.length >= 100
    )
      return;
    const recommendation = controlledExperiments.find(
      (r) => r.action.id === id,
    );
    if (!recommendation) return;
    const next = createControlledTest(
      originalItemBaseline,
      crypto.randomUUID(),
      recommendation.action,
      guidedTargets ?? recommendation.pixels.map((p) => p.index),
      sidAnalysis?.candidates.length ?? Number(investigationInference.pidCount),
    );
    const targeted = guided
      ? continueStarterExperiment(targetExperiment(next))
      : targetExperiment(next);
    useItemSnapshot(targeted, [...currentSnapshots, targeted]);
    setNotice(
      guided
        ? "Experiment selected. Apply the change to the current setup and keep it after answering."
        : "Experiment selected. Follow its instructions and compare with the original drawing. Restore the original Pokémon state after recording this test.",
    );
  }
  function answerTarget(index: number, value: Observation) {
    if (activeSnapshot.itemTest?.mode !== "pixels") return;
    const next = answerExperimentPixel(activeSnapshot, index, value);
    const all = currentSnapshots.map((s) => (s.id === next.id ? next : s));
    useItemSnapshot(
      isRecorded(next) && !guided ? itemTestBaseline(all) : next,
      all,
    );
    setNotice(
      isRecorded(next)
        ? guided
          ? "Answer saved. Keep the current setup; next experiments are being reranked."
          : "Verified experiment pixels saved. Original drawing restored; next experiments are being reranked."
        : "Verified pixel saved; unexamined pixels remain unknown. Candidates are updating.",
    );
  }
  function saveVerifiedTargets() {
    try {
      const next = finishPixelExperiment(activeSnapshot),
        all = currentSnapshots.map((s) => (s.id === next.id ? next : s));
      useItemSnapshot(guided ? next : itemTestBaseline(all), all);
      setNotice(
        "Verified pixels saved. Unexamined pixels remain unknown; recommendations are updating.",
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function undoLastExperimentAnswer() {
    if (
      !undoableExperiment ||
      factError ||
      summaryState.error ||
      deduction.busy ||
      drawingInProgress
    )
      return;
    const next = undoExperimentAnswer(undoableExperiment);
    useItemSnapshot(
      next,
      currentSnapshots.map((s) => (s.id === next.id ? next : s)),
    );
    setNotice(
      "Last experiment answer cleared. Candidates are recalculating. Apply this experiment's setup and check the highlighted pixel again.",
    );
  }
  function reportItemChange(changed: boolean) {
    if (factError || summaryState.error || !activeSnapshot.itemTest)
      return false;
    const source = currentSnapshots.find(
      (s) => s.id === activeSnapshot.itemTest!.sourceId,
    )!;
    const next = answerItemTest(activeSnapshot, source, changed);
    if (changed)
      useItemSnapshot(
        next,
        currentSnapshots.map((s) => (s.id === next.id ? next : s)),
      );
    else {
      const saved = recordItemTest(currentSnapshots, next);
      useItemSnapshot(saved.baseline, saved.snapshots);
    }
    setNotice(
      changed
        ? `Edit the differences from “${source.name}”, then save this item test. The original drawing stays preserved.`
        : `Matching pattern saved for the new item. Original drawing “${originalItemBaseline.name}” restored; findings and item rankings updated.`,
    );
    return true;
  }
  function confirmItemTest() {
    if (factError || summaryState.error || !activeSnapshot.itemTest)
      return false;
    try {
      const source = currentSnapshots.find(
        (s) => s.id === activeSnapshot.itemTest!.sourceId,
      )!;
      const next = finishItemTest(activeSnapshot, source);
      const saved = recordItemTest(currentSnapshots, next);
      useItemSnapshot(saved.baseline, saved.snapshots);
      setNotice(
        `Item test saved separately. Original drawing “${saved.baseline.name}” restored; findings and next-item rankings include the saved test.`,
      );
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  }
  function cancelItemTest() {
    if (!activeSnapshot.itemTest || isRecorded(activeSnapshot)) return;
    useItemSnapshot(
      originalItemBaseline,
      currentSnapshots.filter((s) => s.id !== activeId),
    );
    setNotice("Draft item test cancelled. Earlier observations are preserved.");
  }
  return {
    spindaMatcher,
    useSpindaPid: (pid: number, ball: number, level?: number) => {
      if (pendingItemTest || factError || summaryState.error) return false;
      const sameSpinda =
        facts.species === 308 && (facts.pid === undefined || facts.pid === pid);
      const next = {
        ...freshCapturePreset(
          wildStoragePreset({ species: 308, metGame: 3, isEgg: 0 }),
        ),
        ...(sameSpinda ? facts : spindaTrainerFacts(facts)),
        species: 308,
        pid,
        ball,
        ...(level === undefined ? {} : { metLevel: level }),
      };
      if (!sameSpinda) {
        const first = newSnapshot(`spinda-${Date.now()}`, "Spinda curtain");
        setSnapshots([first]);
        setActiveId(first.id);
        obsRef.current = first.observations;
        setObs(first.observations);
        setUndo([]);
        setRedo([]);
        setSummaryDraft({});
        setRngSettings(undefined);
      }
      setOrigin("wild");
      setFacts(next);
      setFactDraft(factsToDraft(next));
      if (level !== undefined)
        setSummaryDraft((draft) => ({
          ...draft,
          level: draft.level || String(level),
        }));
      setSpindaMatcher((s) => ({
        ...s,
        appliedPid: pid,
        guide: {
          ...(s.guide?.pid === pid ? s.guide : newSpindaSidGuide(pid)),
          enabled: true,
          freshZeros: true,
          paddingZero: true,
        },
      }));
      setNotice("");
      return true;
    },
    catchNextSpinda: (progress?: SpindaSidProgress) => {
      if (
        deduction.busy ||
        deduction.error ||
        pendingItemTest ||
        factError ||
        summaryState.error
      )
        return;
      const current = deduction.data.spindaGuideProgress;
      const remainingSids =
        sidAnalysis?.sidValues ??
        current?.remainingSids ??
        progress?.remainingSids ??
        spindaMatcher.sidProgress?.remainingSids;
      if (!remainingSids?.length) return;
      const tested = (spindaMatcher.sidProgress?.tested ?? [0, 0, 0, 0]).map(
        (mask, n) =>
          mask | (current?.tested[n] ?? 0) | (progress?.tested[n] ?? 0),
      );
      setSpindaMatcher((s) => ({
        ...s,
        appliedPid: undefined,
        guide: undefined,
        sidProgress: { remainingSids, tested },
      }));
      const next = {
        ...newPokemonFacts(),
        ...spindaTrainerFacts(facts),
      };
      const first = newSnapshot(`spinda-${Date.now()}`, "Spinda curtain");
      setSnapshots([first]);
      setActiveId(first.id);
      obsRef.current = first.observations;
      setObs(first.observations);
      setFacts(next);
      setFactDraft(factsToDraft(next));
      setSummaryDraft({});
      setUndo([]);
      setRedo([]);
      setRngSettings(undefined);
      setNotice("");
    },
    sidDigitFilters,
    setSidDigitFilters: (masks?: number[]) =>
      setSidDigitFilters(masks ? validateSidDigitFilters(masks) : undefined),
    setSpindaMatcher: (next: SpindaMatcherState) =>
      setSpindaMatcher(validateSpindaMatcher(next)),
    applySpindaEstimate: (pid: number) => {
      const next = spindaEstimatedFacts(facts, pid);
      if (!next || pendingItemTest || factError || summaryState.error)
        return false;
      // The panel explicitly confirms the PID and fills an unspecified species.
      // Existing drawings, snapshots, encounter scopes and IVs remain intact.
      setFacts(next);
      setFactDraft(factsToDraft(next));
      setSpindaMatcher((s) => ({
        ...s,
        appliedPid: pid,
        shortlist: [...new Set([...s.shortlist, pid])],
      }));
      setNotice(
        "Visually estimated Spinda PID applied as a conditional input. It is not independently verified; recheck against caught data and curtain pixels.",
      );
      return true;
    },
    sidRngSettings,
    sidRngRows,
    sidRngResult,
    sidRngBusy: sidWorker.busy,
    sidRngProgress: sidWorker.progress,
    sidRngError: sidWorker.error,
    curtainSidAnalysis,
    sidCandidateCheck,
    setSidRngSettings: (s: SidRngSettings | undefined) => {
      setSidRngSettings(s ? validateSidRng(s) : undefined);
      setSidCandidateCheck("");
    },
    validateSidCandidate: (sid: number) => {
      const h = sidAnalysis?.candidates.find((h) => h.sid === sid);
      const row = sidRngResult?.rows.find((r) => r.sid === sid);
      const witness =
        h ??
        (row?.witnessPid !== undefined && identity.tid !== undefined
          ? makeHypothesis(row.witnessPid, identity.tid, sid)
          : null);
      const problem = witness
        ? currentSnapshots
            .filter(isEvidence)
            .map((s) => diagnoseHypothesis(identity, s, witness))
            .find(Boolean)
        : null;
      setSidCandidateCheck(
        problem ??
          (witness
            ? `SID ${sid}: compatible with all saved curtain and stored-data constraints for at least one possible PID. This does not identify the true trainer ID.`
            : `SID ${sid}: compatibility remains unresolved; no PID was selected or applied.`),
      );
    },
    itemTestBaseline: originalItemBaseline,
    starterHasDrawing: hasStarterDrawing(currentSnapshots),
    updateStarterCheckpoint: (supplied: KnownFacts) => {
      if (pendingItemTest || drawingInProgress || deduction.busy)
        throw Error(
          "Finish the current drawing or experiment before updating the setup.",
        );
      const next = updatedStarterCheckpoint(
        originalItemBaseline,
        identity,
        supplied,
        sidAnalysis?.candidates ?? [],
        crypto.randomUUID(),
      );
      if (next) useItemSnapshot(next, [...currentSnapshots, next]);
    },
    correctStarterCheckpointFacts: (changes: KnownFacts) => {
      if (pendingItemTest || drawingInProgress)
        throw Error(
          "Finish the drawing or current experiment before correcting its setup.",
        );
      const corrected = correctStarterCheckpointFacts(
        currentSnapshots,
        originalItemBaseline.id,
        changes,
      );
      const active = corrected.find((s) => s.id === activeId)!;
      const next = validateFacts({ ...identity, ...active.knownFacts });
      setSnapshots(corrected);
      setFacts(next);
      setFactDraft(factsToDraft(next));
      setFactError("");
      setAnalysisRevision((revision) => revision + 1);
    },
    correctStarterCheckpointEvs: (evs: (number | null)[]) => {
      const corrected = correctStarterCheckpointEvs(
        currentSnapshots,
        originalItemBaseline.id,
        evs,
      );
      const active = corrected.find((s) => s.id === activeId)!;
      const next = validateFacts({ ...identity, ...active.knownFacts });
      setSnapshots(corrected);
      setFacts(next);
      setFactDraft(factsToDraft(next));
      setFactError("");
      setAnalysisRevision((revision) => revision + 1);
    },
    configureStarterInvestigation: (
      supplied: KnownFacts,
      readings: Snapshot[],
      rng: RngSettings,
      sidRng: SidRngSettings,
    ) => {
      if (pendingItemTest)
        throw Error(
          "Finish or cancel the current experiment before updating the Pokémon checkpoint.",
        );
      const next = validateFacts(supplied);
      const first = newSnapshot(
        `starter-checkpoint-${Date.now()}`,
        "Starter curtain",
        next,
      );
      first.starterCheckpointId = first.id;
      // Earlier observations retain their own mutable facts. Never reinterpret
      // old pixels after training, changing moves, or replacing a held item.
      const earlier = currentSnapshots.filter(
        (s) => s.observations.some((v) => v !== -1) || s.itemTest,
      );
      const ids = new Set(earlier.map((s) => s.id));
      setSnapshots([
        first,
        ...earlier,
        ...readings.filter((s) => !ids.has(s.id)),
      ]);
      setActiveId(first.id);
      obsRef.current = first.observations;
      setObs(first.observations);
      setFacts(next);
      setFactDraft(factsToDraft(next));
      setFactError("");
      setSummaryDraft({});
      setOrigin("static");
      setRngSettings(validateRngSettings(rng));
      setSidRngSettings(validateSidRng(sidRng));
      setSidDigitFilters(undefined);
      setSpindaMatcher(defaultSpindaMatcher());
      setUndo([]);
      setRedo([]);
      setDrawingInProgress(false);
      setMode("solver");
    },
    lastCompletedItemTest,
    rngSettings,
    rngActive,
    wildRng,
    hypothesisLabel: rngActive ? "PID/SID/IV hypotheses" : "PID/SID pairs",
    runRngSearch: (settings: RngSettings) => {
      setRngSettings(validateRngSettings(settings));
      wildRng.retry();
      setNotice(
        "Encounter RNG search enabled. Matching spreads will update automatically when saved evidence changes.",
      );
    },
    stopRngSearch: () => setRngSettings(undefined),
    pendingItemTest,
    saveStatus,
    startItemTest,
    startControlledTest,
    controlledExperiments,
    domainQuestions,
    experimentStatus,
    experimentLimitations,
    experimentProgress,
    answerTarget,
    canUndoExperimentAnswer: !!undoableExperiment,
    undoLastExperimentAnswer,
    saveVerifiedTargets,
    experimentTargets,
    starterQuestions:
      deduction.current && !deduction.error
        ? deduction.data.starterQuestions
        : [],
    referenceObservations:
      activeSnapshot.itemTest?.mode === "pixels"
        ? currentSnapshots.find(
            (s) => s.id === activeSnapshot.itemTest!.sourceId,
          )?.observations
        : undefined,
    drawingInProgress,
    ppError,
    analysisBusy: deduction.busy,
    analysisStatus: deduction.status,
    analysisError: deduction.error,
    reportItemChange,
    confirmItemTest,
    cancelItemTest,
    canRemoveObservation:
      currentSnapshots.length > 1 &&
      !currentSnapshots.some(
        (s) => s.itemTest?.sourceId === activeId || s.supersededBy === activeId,
      ),
    evidenceSnapshot,
    highlightReferenceConflicts,
    origin,
    setOrigin: (next: Origin) => {
      setOrigin(next);
      setDrawingInProgress(false);
      if (next !== origin) setRngSettings(undefined);
    },
    currentSnapshots,
    activeSnapshot,
    activeId,
    activateSnapshot,
    addObservation,
    editSnapshot,
    removeObservation,
    ownedItems,
    setOwnedItems,
    sidAnalysis,
    spindaBaseSidValues: deduction.data.spindaBaseSidValues,
    nextSpinda: deduction.data.nextSpinda,
    identity,
    recovery,
    experiments,
    predictions,
    assistance,
    showPredictions,
    setShowPredictions,
    observePixel,
    mode,
    setMode,
    records,
    names,
    obs,
    hexSource,
    setHexSource,
    zoom,
    setZoom,
    grid,
    setGrid,
    gameBackground,
    setGameBackground,
    showNeighbors,
    setShowNeighbors,
    view,
    setView,
    showConflicts,
    setShowConflicts,
    hover,
    selectedPixel,
    setSelectedPixel,
    setHover,
    target,
    setTarget,
    error,
    setError,
    notice,
    setNotice,
    facts,
    factDraft,
    factError,
    summaryDraft,
    summaryError: summaryState.error,
    ivEstimates,
    editSummaryStat: (key: string, value: string) => {
      setDrawingInProgress(false);
      setSummaryDraft((draft) => ({ ...draft, [key]: value }));
    },
    clearSummaryStats: () => {
      setDrawingInProgress(false);
      setSummaryDraft({});
    },
    applyEstimatedIVs,
    setExperimentPokeblock: (values?: number[]) =>
      setSnapshots(
        currentSnapshots.map((s) =>
          s.id === originalItemBaseline.id
            ? { ...s, experimentPokeblock: values }
            : s,
        ),
      ),
    setIvJudge: (evidence: KnownFacts["ivJudge"]) =>
      editFact(
        "ivJudge",
        evidence === undefined ? "" : JSON.stringify(evidence),
      ),
    canvasRef,
    fileRef,
    sessionRef,
    memory,
    masks,
    suppliedMasks,
    inference,
    investigationInference,
    displayedMasks,
    comparison,
    conflicts,
    imported,
    placements,
    bounds,
    pid,
    tid,
    sid,
    orders,
    natures,
    missing,
    missingNeighbors,
    hv,
    ob,
    fieldText,
    editFact,
    importBytes,
    importFile,
    importSession,
    example,
    researchExample,
    activeResearchExample,
    restoreWorkspace,
    copy,
    exportPng,
    saveDrawing,
    resetSolver,
    removeRecord,
    zeroEVs,
    applyFreshDefaults,
    applyWildStorageDefaults,
    clearDefaults,
    clearFacts,
    completeDrawing,
    undoStroke,
    redoStroke,
    canUndo: undo.length > 0,
    canRedo: redo.length > 0,
    clear: () => change(emptyObservations()),
    start,
    paint,
    editMovePpUps,
    finish,
  };
}
export type CurtainLab = ReturnType<typeof useCurtainLab>;
