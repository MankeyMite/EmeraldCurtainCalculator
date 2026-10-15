import { useMemo, useRef, useState, useEffect } from "react";
import type { Hit } from "../components/PixelGrid";
import { parseRecord, decodePokemon, exampleRecord } from "../core/pokemon";
import { assembleMemory, type Records, type Slot } from "../core/memory";
import { RAW_PLACEMENTS, nibbleValue } from "../core/tiles";
import {
  emptyObservations,
  completeObservations,
  recordMasks,
  compareCandidate,
  constraintHex,
  type Observations,
  type Observation,
  type KnownFacts,
} from "../core/constraints";
import { loadSession, saveSession } from "../core/session";
import { loadResearchExample, type ResearchExampleId } from "../core/examples";
import { freshCatchFacts, factsToDraft, draftToFacts } from "../core/facts";
import { windowLayout } from "../core/window";
import {
  analyzeConstraints,
  fieldPossibilities,
  ivPossibilities,
} from "../core/inference";
import {
  estimateIVs,
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
export function useCurtainLab() {
  const [mode, setMode] = useState<"solver" | "renderer">("solver"),
    [records, setRecords] = useState<Records>({}),
    [names, setNames] = useState<Partial<Record<Slot, string>>>({});
  const [obs, setObs] = useState<Observations>(emptyObservations),
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
    [facts, setFacts] = useState<KnownFacts>(freshCatchFacts),
    [factDraft, setFactDraft] = useState<Record<string, string>>(() =>
      factsToDraft(freshCatchFacts()),
    ),
    [factError, setFactError] = useState("");
  const [summaryDraft, setSummaryDraft] = useState<Record<string, string>>({});
  const summaryState = useMemo(() => {
    try {
      return { value: summaryFromDraft(summaryDraft), error: "" };
    } catch (error) {
      return { value: null, error: (error as Error).message };
    }
  }, [summaryDraft]);
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
      undo,
      redo,
    };
  }
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
  const inference = useMemo(
    () => analyzeConstraints(suppliedMasks, mode === "solver" ? facts : {}),
    [suppliedMasks, mode, facts],
  );
  const displayedMasks =
    mode === "solver" && hexSource === "inferred"
      ? inference.masks
      : suppliedMasks;
  const ivEstimates = useMemo(
    () =>
      estimateIVs(
        {
          ...facts,
          ...(facts.nature === undefined && inference.natures.length === 1
            ? { nature: inference.natures[0] }
            : {}),
        },
        summaryState.value ?? { stats: [null, null, null, null, null, null] },
        Array.from({ length: 6 }, (_, i) => ivPossibilities(inference, i)),
      ),
    [facts, summaryState, inference],
  );
  const comparison = useMemo(
    () => compareCandidate(obs, records, facts),
    [obs, records, facts],
  );
  const conflicts = useMemo(
    () =>
      new Set(
        mode === "solver" && showConflicts ? comparison.contradictions : [],
      ),
    [comparison, mode, showConflicts],
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
      (!inference.cryptoFacts && facts.gender === undefined) ||
        mode === "renderer",
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
        "Saved observations and known facts loaded. The reference record is used only for comparison. Open Reconstruction to explore the results.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function restoreWorkspace() {
    const before = exampleBackup.current;
    if (!before) return;
    stroke.current = null;
    update(before.observations);
    setFacts(before.facts);
    setFactDraft(before.factDraft);
    setFactError(before.factError);
    setSummaryDraft(before.summaryDraft);
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
    if (!file) return;
    try {
      const s = loadSession(await file.text());
      change(s.observations);
      setFacts(s.knownFacts);
      setFactDraft(factsToDraft(s.knownFacts));
      setSummaryDraft(summaryToDraft(s.summaryStats));
      setFactError("");
      setMode("solver");
      setError("");
      setNotice("Observations restored. Candidate records are independent.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function editFact(key: string, value: string) {
    const draft = { ...factDraft, [key]: value };
    if (key === "species") {
      draft.ability = "";
      if (!value) draft.gender = "";
    }
    setFactDraft(draft);
    try {
      setFacts(
        draftToFacts(
          draft,
          facts.assumed?.filter((k) => k !== key),
        ),
      );
      setFactError("");
    } catch (e) {
      setFactError((e as Error).message + "; last valid facts remain active.");
    }
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
    download(
      "curtain-observations.json",
      new Blob([saveSession(obs, facts, summaryState.value ?? undefined)], {
        type: "application/json",
      }),
    );
  }
  function resetSolver() {
    change(emptyObservations());
    setFacts(freshCatchFacts());
    setFactDraft(factsToDraft(freshCatchFacts()));
    setFactError("");
    setSummaryDraft({});
    setNotice(
      "Drawing reset; newly caught defaults restored. These are assumptions, not recovered values.",
    );
  }
  function removeRecord(slot: Slot) {
    setRecords((r) => ({ ...r, [slot]: undefined }));
    setNames((n) => ({ ...n, [slot]: undefined }));
    setNotice("");
  }
  function zeroEVs() {
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
    const next = { ...facts, ...freshCatchFacts() };
    setFacts(next);
    setFactDraft(factsToDraft(next));
    setFactError("");
    setNotice(
      "Newly caught defaults applied. They can be changed or cleared to unknown.",
    );
  }
  function clearFacts() {
    setFacts({});
    setFactDraft({});
    setFactError("");
    setSummaryDraft({});
  }
  function applyEstimatedIVs() {
    if (
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
    // Explicit user action: blanks in the displayed scope are observations
    // of transparency. Never silently fill neighboring rows hidden by default.
    change(
      completeObservations(obsRef.current, view !== "room" || showNeighbors),
    );
    setMode("solver");
    setNotice(
      "Remaining displayed cells marked transparent. Undo restores the unfinished drawing.",
    );
  }
  return {
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
    editSummaryStat: (key: string, value: string) =>
      setSummaryDraft((draft) => ({ ...draft, [key]: value })),
    clearSummaryStats: () => setSummaryDraft({}),
    applyEstimatedIVs,
    canvasRef,
    fileRef,
    sessionRef,
    memory,
    masks,
    suppliedMasks,
    inference,
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
    finish,
  };
}
export type CurtainLab = ReturnType<typeof useCurtainLab>;
