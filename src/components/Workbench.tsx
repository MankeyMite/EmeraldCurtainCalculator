import { useCallback, useEffect, useRef, useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { PokemonInfoForm } from "./PokemonInfoForm";
import { PixelGrid } from "./PixelGrid";
import { PixelInspector } from "./PixelInspector";
import { GroupedHex } from "./GroupedHex";
import { RecoveryOverview } from "./RecoveryOverview";
import { stripLayout, recordStripLayout, hitForNibble } from "./WorkbenchData";
import { InvestigationResults, ObservationManager } from "./Investigator";
import { ItemTestControls } from "./ItemTestControls";
import { SidRngPanel } from "./SidRngPanel";
import { WildRngPanel } from "./WildRngPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { RecordInput } from "./RecordInput";
import { ResearchArticle } from "./ResearchArticle";
import { RESEARCH_EXAMPLES } from "../core/examples";
import { isRecorded } from "../core/itemTests";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { IVAnalysis } from "./IVAnalysis";
import { SpindaMatcher } from "./SpindaMatcher";

export function Workbench({
  lab,
  onClassic,
  onStarterGuide,
}: {
  lab: CurtainLab;
  onClassic: () => void;
  onStarterGuide?: () => void;
}) {
  const [tab, setTab] = useState("about"),
    [section, setSection] = useState("items"),
    [field, setField] = useState("hidden data");
  const [paint, setPaint] = useState(false),
    [showCurtain, setShowCurtain] = useState(false),
    [drawingOptions, setDrawingOptions] = useState(false),
    [largeCurtain, setLargeCurtain] = useState(false),
    [recoveryOpen, setRecoveryOpen] = useState(false);
  const [spindaTargets, setSpindaTargets] = useState<number[]>([]);
  const [guideFocus, setGuideFocus] = useState<number | null>(null);
  const handleSpindaTargets = useCallback((targets: number[]) => {
    setSpindaTargets(targets);
    setGuideFocus(targets[0] ?? null);
  }, []);
  const spindaGuide =
    section === "sid" &&
    tab === "investigate" &&
    lab.spindaMatcher?.guide?.enabled
      ? lab.spindaMatcher.guide
      : undefined;
  const mobile = useMobileLayout(),
    curtainOpen = mobile && showCurtain;
  const scroll = useRef<HTMLDivElement>(null),
    locateTarget = useRef<number | null>(null),
    previousPendingTest = useRef(lab.pendingItemTest?.id),
    layout = mobile && !largeCurtain ? recordStripLayout() : stripLayout(),
    highlight = lab.hover;
  const open = (next: string, focus = "hidden data") => {
    setShowCurtain(false);
    setTab("investigate");
    setSection(next);
    setField(focus);
  };
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
    if (mobile) window.scrollTo({ top: 0 });
    if (curtainOpen && locateTarget.current !== null) {
      const index = locateTarget.current;
      locateTarget.current = null;
      if (!largeCurtain) return;
      const frame = requestAnimationFrame(() => {
        const hit = hitForNibble(index),
          rect = lab.canvasRef.current?.getBoundingClientRect();
        if (!hit || !rect) return;
        const y =
          rect.top +
          window.scrollY +
          (rect.height * (hit.displayY - layout.bounds.y + 0.5)) /
            layout.bounds.h;
        window.scrollTo({ top: Math.max(0, y - window.innerHeight * 0.55) });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [tab, section, curtainOpen, mobile, largeCurtain]);
  useEffect(() => {
    if (mobile) setPaint(false);
  }, [mobile]);
  useEffect(() => {
    if (
      lab.pendingItemTest &&
      lab.pendingItemTest.id !== previousPendingTest.current
    ) {
      open("items");
      setPaint(false);
      // Starting another test can leave tab/section unchanged. Scroll on the
      // test ID itself, after its instructions and answer controls have mounted.
      const frame = requestAnimationFrame(() => {
        const container = scroll.current,
          target = container?.querySelector<HTMLElement>("#current-item-test");
        if (!container || !target) return;
        if (mobile) {
          const tabsHeight =
            container.parentElement
              ?.querySelector(".workspace-tabs")
              ?.getBoundingClientRect().height ?? 0;
          window.scrollTo({
            top: Math.max(
              0,
              window.scrollY +
                target.getBoundingClientRect().top -
                tabsHeight -
                12,
            ),
            behavior: "smooth",
          });
        } else {
          container.scrollTo({
            top:
              container.scrollTop +
              target.getBoundingClientRect().top -
              container.getBoundingClientRect().top -
              12,
            behavior: "smooth",
          });
        }
      });
      previousPendingTest.current = lab.pendingItemTest.id;
      return () => cancelAnimationFrame(frame);
    }
    previousPendingTest.current = lab.pendingItemTest?.id;
  }, [lab.pendingItemTest?.id]);
  const finish = () => {
    if (lab.completeDrawing()) {
      setPaint(false);
      open("items");
    }
  };
  const newPokemon = () => {
    lab.resetSolver();
    setShowCurtain(false);
    setTab("info");
    setSection("items");
    setField("hidden data");
    setPaint(false);
    scroll.current?.scrollTo({ top: 0 });
  };
  return (
    <main
      className="workbench"
      data-curtain-view={
        curtainOpen ? (largeCurtain ? "large" : "compact") : undefined
      }
      aria-label="Emerald Curtain Investigator workspace"
    >
      <section
        className="input-workspace"
        aria-label="Pokémon inputs and investigation"
      >
        <header className="workbench-heading">
          <div>
            <h1>Emerald Curtain Investigator</h1>
            <span>Emerald Curtain Calculator · English Emerald</span>
          </div>
          <div className="file-actions">
            <button
              onClick={lab.saveDrawing}
              disabled={!!(lab.factError || lab.summaryError)}
            >
              Save
            </button>
            <button onClick={() => lab.sessionRef.current?.click()}>
              Load
            </button>
            <button
              onClick={newPokemon}
              title="Start a clean investigation. Use Save first to keep the current Pokémon's test."
            >
              New Pokémon
            </button>
          </div>
        </header>
        <nav
          className="workspace-tabs"
          aria-label="Workspace pages"
          role="tablist"
        >
          {[
            ["about", "About"],
            ["info", "Pokémon info"],
            ...(mobile ? [["curtain", "Curtain"]] : []),
            ["investigate", "Investigate"],
          ].map(([id, name]) => (
            <button
              role="tab"
              key={id}
              id={`work-tab-${id}`}
              aria-selected={
                id === "curtain" ? curtainOpen : !curtainOpen && tab === id
              }
              aria-controls={`work-panel-${id}`}
              tabIndex={
                (id === "curtain" ? curtainOpen : !curtainOpen && tab === id)
                  ? 0
                  : -1
              }
              onKeyDown={(e) => {
                const ids = mobile
                    ? ["about", "info", "curtain", "investigate"]
                    : ["about", "info", "investigate"],
                  index = ids.indexOf(id);
                const next =
                  e.key === "ArrowRight"
                    ? (index + 1) % ids.length
                    : e.key === "ArrowLeft"
                      ? (index + ids.length - 1) % ids.length
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? ids.length - 1
                          : -1;
                if (next < 0) return;
                e.preventDefault();
                setShowCurtain(ids[next] === "curtain");
                if (ids[next] !== "curtain") setTab(ids[next]);
                document.getElementById(`work-tab-${ids[next]}`)?.focus();
              }}
              onClick={() => {
                setShowCurtain(id === "curtain");
                if (id !== "curtain") setTab(id);
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="left-scroll" ref={scroll} hidden={curtainOpen}>
          {(lab.error ||
            lab.factError ||
            lab.summaryError ||
            lab.analysisError) && (
            <p className="alert error" role="alert">
              {lab.error ||
                lab.factError ||
                lab.summaryError ||
                lab.analysisError}
              <button onClick={() => lab.setError("")}>Dismiss</button>
            </p>
          )}
          {lab.notice && (
            <div className="workspace-notice" role="status">
              {lab.notice}
              <button
                aria-label="Dismiss message"
                onClick={() => lab.setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {lab.activeResearchExample && (
            <p className="workspace-notice">
              Example: {lab.activeResearchExample}{" "}
              <button onClick={lab.restoreWorkspace}>
                Restore previous workspace
              </button>
            </p>
          )}
          {
            <section
              role="tabpanel"
              id="work-panel-info"
              aria-labelledby="work-tab-info"
              hidden={tab !== "info"}
            >
              <PokemonInfoForm lab={lab} onSid={() => open("sid", "SID")} />
              <details className="workspace-files">
                <summary>Drawing files, record comparison and reset</summary>
                <div className="inline-buttons">
                  <button onClick={lab.saveDrawing}>
                    Save investigation JSON
                  </button>
                  <button onClick={() => lab.sessionRef.current?.click()}>
                    Load investigation / old drawing
                  </button>
                  <button onClick={lab.exportPng}>Save curtain PNG</button>
                  <button onClick={newPokemon}>
                    Reset entire investigation
                  </button>
                </div>
                <RecordInput lab={lab} />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={lab.mode === "renderer"}
                    onChange={(e) =>
                      lab.setMode(e.target.checked ? "renderer" : "solver")
                    }
                  />
                  Preview imported record (kept separate from observations)
                </label>
              </details>
            </section>
          }
          {tab === "investigate" && (
            <section
              role="tabpanel"
              id="work-panel-investigate"
              aria-labelledby="work-tab-investigate"
            >
              <nav
                className="investigation-tabs"
                aria-label="Investigation views"
              >
                {[
                  ["items", "Experiments"],
                  ["ivs", "IVs"],
                  ["sid", "SID Finder"],
                  ["data", "Data Recovery"],
                  ["wild", "Encounter RNG"],
                ].map(([id, name]) => (
                  <button
                    key={id}
                    aria-pressed={section === id}
                    onClick={() => {
                      setSection(id);
                      if (id === "ivs") setField("IVs");
                    }}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              <div className="investigation-goal">
                Investigating <strong>{field}</strong>. Every result uses
                verified observations and active assumptions.
              </div>
              {section === "ivs" && <IVAnalysis lab={lab} />}
              {section !== "sid" && (
                <details className="observation-tools">
                  <summary>Saved observations and notes · advanced</summary>
                  <p>
                    Experiments save their observations automatically. Use these
                    controls to review or name saved snapshots, or add a
                    separate observation of this same Pokémon after another
                    change.
                  </p>
                  <ObservationManager lab={lab} />
                </details>
              )}
              <ItemTestControls
                lab={lab}
                openEditor={() => {
                  lab.setMode("solver");
                  setPaint(true);
                  open("items", field);
                  if (mobile) setShowCurtain(true);
                }}
                openResults={() => open("items", field)}
                locatePixel={(index) => {
                  if (mobile) locateTarget.current = index;
                  setShowCurtain(true);
                }}
              />
              {section === "sid" && (
                <>
                  <SpindaMatcher
                    lab={lab}
                    onTargetsChange={handleSpindaTargets}
                    locatePixel={(index) => {
                      setGuideFocus(index);
                      lab.setHover(null);
                      lab.setSelectedPixel(hitForNibble(index));
                      lab.setMode("solver");
                      if (mobile) locateTarget.current = index;
                      setShowCurtain(true);
                    }}
                  />
                  <SidRngPanel lab={lab} />
                  <p>
                    {onStarterGuide && (
                      <button onClick={onStarterGuide}>
                        New Game SID Finder → Shiny Starter
                      </button>
                    )}
                    <button onClick={() => open("items")}>
                      Test experiments for further deduction
                    </button>
                  </p>
                </>
              )}
              {section === "data" && (
                <>
                  <SidRngPanel lab={lab} />
                  <details>
                    <summary>Advanced stored-data analysis</summary>
                    <AnalysisPanel lab={lab} />
                  </details>
                </>
              )}
              {section === "wild" && (
                <>
                  <p>
                    Select Wild or Static under Pokémon info to use the
                    appropriate seed and advance search.
                  </p>
                  <WildRngPanel lab={lab} />
                </>
              )}
              {section !== "wild" && section !== "sid" && (
                <div id="panel-2" data-investigation-focus={section}>
                  <InvestigationResults
                    lab={lab}
                    onCatchSpinda={() => {
                      lab.catchNextSpinda();
                      setSpindaTargets([]);
                      setGuideFocus(null);
                      open("sid");
                      scroll.current?.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </div>
              )}
            </section>
          )}
          {tab === "about" && (
            <section
              role="tabpanel"
              id="work-panel-about"
              aria-labelledby="work-tab-about"
              className="workbench-about"
            >
              <section
                className="getting-started"
                aria-labelledby="getting-started-title"
              >
                <h2 id="getting-started-title">
                  Reveal the Pokémon behind the curtains
                </h2>
                <p>
                  Use Emerald’s curtain glitch to narrow your Pokémon’s PID,
                  IVs, Secret ID and XOR encryption key. Known information fills
                  provable pixels; guided experiments help uncover more. Exact
                  recovery depends on the evidence.
                </p>
                <h3>How to use the tool</h3>
                <ol>
                  <li>
                    In <strong>English Pokémon Emerald</strong>, put your
                    Pokémon in <strong>Box 8, slot 5</strong>. Keep slots 4 and
                    6 empty.
                  </li>
                  <li>
                    Open <strong>Pokémon info</strong> and enter its known
                    summary-screen details. Leave uncertain values blank.
                    Provable pixels fill automatically.
                  </li>
                  <li>
                    Visit <strong>Rustboro Trainer’s School</strong> and copy
                    its curtain pattern. Open <strong>Curtain</strong> on
                    mobile; choose <strong>Draw</strong>. Click to toggle black
                    / transparent, or drag to continue that color.
                  </li>
                  <li>
                    Check the whole pattern, then click{" "}
                    <strong>Finish drawing</strong> to confirm remaining blanks
                    as transparent. <strong>Investigate</strong> shows results
                    and useful experiments.
                  </li>
                </ol>
                <button onClick={() => setTab("info")}>
                  Start with Pokémon info
                </button>
                {onStarterGuide && (
                  <button onClick={onStarterGuide}>
                    New Game SID Finder → Shiny Starter
                  </button>
                )}
              </section>
              <ResearchArticle />
              <details className="workspace-help">
                <summary>Using this workspace</summary>
                <p>
                  Enter known Pokémon information under Pokémon info. On phones,
                  open Curtain for drawing and recovered values. Larger screens
                  keep the curtain beside the form. Unknown values stay unknown.
                </p>
                <p>
                  In English Emerald, place this Pokémon in Box 8 slot 5, keep
                  slots 4 and 6 empty and reenter Rustboro Trainer’s School. The
                  single strip contains every main-record pixel; mirrored
                  curtains repeat the same data.
                </p>
                <p>
                  Click a hex digit or curtain pixel to pin their
                  correspondence. Inspector mode selects without painting.
                  Automatic pixels have dashed borders. Click toggles black and
                  transparent. Finish drawing saves the whole visible baseline,
                  including unchanged automatic pixels and transparent blanks.
                </p>
                <p>
                  Each experiment starts from the original drawing, saves its
                  own evidence and restores the original afterward. Restore the
                  original state in-game too; consumable experiments require a
                  saved game to reload.
                </p>
                <p>
                  The optional new-game SID filter uses TID as the seed after
                  the naming screen. It intersects generated SIDs with
                  stored-data constraints. Approximate seconds are not exact RNG
                  advances.
                </p>
              </details>
              <h3>Research examples</h3>
              {RESEARCH_EXAMPLES.map((example) => (
                <article key={example.id}>
                  <strong>{example.title}</strong>
                  <p>{example.description}</p>
                  <button
                    onClick={() => {
                      lab.researchExample(example.id);
                      setTab("info");
                    }}
                  >
                    Load {example.title} example
                  </button>
                </article>
              ))}
              <details>
                <summary>Synthetic record previews</summary>
                <button
                  onClick={() => {
                    lab.example("pokemon");
                    lab.setMode("renderer");
                  }}
                >
                  Load synthetic Pokémon
                </button>
                <button
                  onClick={() => {
                    lab.example("pattern");
                    lab.setMode("renderer");
                  }}
                >
                  Load nibble test pattern
                </button>
              </details>
              <h3>Privacy and sources</h3>
              <p>
                Calculations and autosave stay in your browser. JSON backups
                exclude imported comparison files. Pokémon names and artwork
                belong to their respective owners.
              </p>
              <p>
                <a
                  href="https://github.com/pret/pokeemerald"
                  target="_blank"
                  rel="noreferrer"
                >
                  pret/pokeemerald source
                </a>{" "}
                ·{" "}
                <a
                  href="https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Glitch City research
                </a>
              </p>
              <button onClick={onClassic}>
                Open classic workspace and full research notes
              </button>
            </section>
          )}
        </div>
        <footer className="workspace-footer">
          {lab.saveStatus} · {lab.currentSnapshots.filter(isRecorded).length}{" "}
          saved observations
          {lab.drawingInProgress
            ? " · Drawing: predictions paused until Finish drawing"
            : lab.analysisBusy
              ? ` · ${lab.analysisStatus}`
              : ""}
        </footer>
      </section>
      <section
        id="work-panel-curtain"
        className="visual-workspace"
        data-curtain-size={mobile && !largeCurtain ? "compact" : "large"}
        role={mobile ? "tabpanel" : undefined}
        aria-labelledby={mobile ? "work-tab-curtain" : undefined}
        hidden={mobile && !curtainOpen}
        aria-label="Fixed curtain and byte recovery"
      >
        <div className="visual-toolbar">
          <strong>
            {lab.mode === "renderer"
              ? "Imported record preview"
              : lab.activeSnapshot.itemTest?.phase === "editing"
                ? `Editing ${lab.activeSnapshot.name}`
                : lab.activeId === lab.itemTestBaseline.id
                  ? "Original curtain baseline"
                  : lab.activeSnapshot.name}
            {spindaGuide && (
              <small>
                {" "}
                · Orange: Spinda S{spindaGuide.digit} pixels, PID 0x
                {spindaGuide.pid.toString(16).toUpperCase().padStart(8, "0")}.
                Guide answers are separate.
              </small>
            )}
          </strong>
          <div className="toolbar-primary">
            <button
              disabled={lab.mode === "renderer"}
              aria-pressed={paint}
              onClick={() => setPaint(!paint)}
            >
              Draw
            </button>
            <button
              className={`finish-drawing${lab.drawingInProgress ? " drawing-pending" : ""}`}
              disabled={lab.mode === "renderer"}
              title={
                lab.activeSnapshot.itemTest
                  ? "Calculate using only verified experiment pixels. Unexamined cells stay unrecorded."
                  : "Confirm and save the visible pattern, including unchanged automatic pixels. Blank cells are transparent."
              }
              onClick={finish}
            >
              Finish drawing
            </button>
          </div>
          <details
            className="drawing-options"
            open={!mobile || drawingOptions}
            onToggle={(e) => {
              if (mobile) setDrawingOptions(e.currentTarget.open);
            }}
          >
            <summary>Drawing options</summary>
            <div className="toolbar-secondary">
              {mobile && (
                <button
                  aria-pressed={largeCurtain}
                  onClick={() => {
                    setLargeCurtain(!largeCurtain);
                    if (largeCurtain) {
                      setDrawingOptions(false);
                      setRecoveryOpen(false);
                    }
                  }}
                >
                  {largeCurtain
                    ? "Fit curtain, inspector & bytes"
                    : "Larger drawing & byte targets"}
                </button>
              )}
              <button
                aria-label="Pixel grid lines"
                aria-pressed={lab.grid}
                title="Show or hide the pixel helper lines"
                onClick={() => lab.setGrid(!lab.grid)}
              >
                {lab.grid ? "Lines on" : "Lines off"}
              </button>
              <button onClick={lab.undoStroke} disabled={!lab.canUndo}>
                Undo
              </button>
              <button onClick={lab.redoStroke} disabled={!lab.canRedo}>
                Redo
              </button>
              <button
                aria-pressed={lab.showPredictions}
                title="Known facts and deductions already constrain the solver. This toggles their pixel display; you do not need to paint them again."
                onClick={() => lab.setShowPredictions(!lab.showPredictions)}
              >
                Auto pixels {lab.showPredictions ? "on" : "off"}
              </button>
            </div>
          </details>
        </div>
        <div className="mobile-only drawing-help">
          {lab.pendingItemTest && (
            <button onClick={() => open("items", field)}>
              Back to experiment questions
            </button>
          )}
          <p role="status" className="drawing-guidance">
            {lab.drawingInProgress
              ? "Predictions paused until Finish drawing."
              : lab.analysisBusy
                ? "Calculating in background…"
                : paint
                  ? "Tap to toggle black / transparent; drag to paint or erase. Finish drawing saves the visible pattern, including automatic pixels."
                  : "Inspect: swipe to scroll, or tap a pixel for details. Choose Draw to record observations."}
          </p>
        </div>
        <div className="curtain-workspace">
          <div className="curtain-viewport">
            <PixelGrid
              key={lab.activeId}
              canvasRef={lab.canvasRef}
              placements={layout.placements}
              bounds={layout.bounds}
              zoom={20}
              grid={lab.grid}
              annotated={false}
              gameBackground={lab.gameBackground}
              mainOnly={!lab.showNeighbors}
              solver={lab.mode === "solver"}
              editable={paint}
              memory={lab.memory}
              observations={lab.obs}
              referenceObservations={lab.referenceObservations}
              contradictions={lab.conflicts}
              predictions={lab.showPredictions ? lab.predictions : undefined}
              targets={
                spindaGuide
                  ? spindaTargets
                  : lab.pendingItemTest?.itemTest?.mode === "pixels"
                    ? lab.experimentTargets.slice(0, 1)
                    : lab.activeSnapshot.targets
              }
              highlightedNibble={
                highlight?.nibble ?? (spindaGuide ? guideFocus : null)
              }
              onSelect={lab.setSelectedPixel}
              onHover={lab.setHover}
              onStart={lab.start}
              onPaint={lab.paint}
              onEnd={lab.finish}
            />
          </div>
          <PixelInspector lab={lab} />
          <GroupedHex lab={lab} />
        </div>
        <details
          className="recovery-details"
          open={!mobile || recoveryOpen}
          onToggle={(e) => {
            if (mobile) setRecoveryOpen(e.currentTarget.open);
          }}
        >
          <summary>Recovered values</summary>
          <RecoveryOverview
            lab={lab}
            onInvestigate={(name) =>
              open(
                name === "SID" ? "sid" : name === "IVs" ? "ivs" : "items",
                name,
              )
            }
          />
        </details>
      </section>
      <input
        ref={lab.sessionRef}
        hidden
        type="file"
        accept=".json"
        aria-label="Load observation JSON"
        onChange={(e) => {
          void lab.importSession(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </main>
  );
}
