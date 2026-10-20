import { useEffect, useRef, useState } from "react";
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
export function Workbench({
  lab,
  onClassic,
}: {
  lab: CurtainLab;
  onClassic: () => void;
}) {
  const [tab, setTab] = useState("info"),
    [section, setSection] = useState("items"),
    [field, setField] = useState("hidden data");
  const [paint, setPaint] = useState(true),
    [brush, setBrush] = useState<-1 | 0 | 1>(1),
    [showCurtain, setShowCurtain] = useState(false),
    [drawingOptions, setDrawingOptions] = useState(false),
    [largeCurtain, setLargeCurtain] = useState(false),
    [recoveryOpen, setRecoveryOpen] = useState(false);
  const mobile = useMobileLayout(),
    curtainOpen = mobile && showCurtain;
  const scroll = useRef<HTMLDivElement>(null),
    locateTarget = useRef<number | null>(null),
    layout = mobile && !largeCurtain ? recordStripLayout() : stripLayout(),
    highlight = lab.hover ?? lab.selectedPixel;
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
    if (lab.pendingItemTest) {
      open("items");
      setPaint(!mobile);
    }
  }, [lab.pendingItemTest?.id]);
  const finish = () => {
    if (lab.completeDrawing()) open("items");
  };
  const newPokemon = () => {
    lab.resetSolver();
    setShowCurtain(false);
    setTab("info");
    setSection("items");
    setField("hidden data");
    setPaint(!mobile);
    setBrush(1);
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
            ["info", "Pokémon info"],
            ...(mobile ? [["curtain", "Curtain"]] : []),
            ["investigate", "Investigate"],
            ["about", "About"],
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
                    ? ["info", "curtain", "investigate", "about"]
                    : ["info", "investigate", "about"],
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
          {tab === "info" && (
            <section
              role="tabpanel"
              id="work-panel-info"
              aria-labelledby="work-tab-info"
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
          )}
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
                  ["sid", "SID Finder"],
                  ["data", "Data Recovery"],
                  ["wild", "Encounter RNG"],
                ].map(([id, name]) => (
                  <button
                    key={id}
                    aria-pressed={section === id}
                    onClick={() => setSection(id)}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              <div className="investigation-goal">
                Investigating <strong>{field}</strong>. Every result uses
                verified observations and active assumptions.
              </div>
              <ObservationManager lab={lab} />
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
              {section === "sid" && <SidRngPanel lab={lab} />}
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
              {section !== "wild" && (
                <div id="panel-2" data-investigation-focus={section}>
                  <InvestigationResults lab={lab} />
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
                  Automatic pixels have dashed borders. Only pixels you record
                  are observations.
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
              ? " · Calculating in background…"
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
          </strong>
          <div className="toolbar-primary">
            <button
              disabled={lab.mode === "renderer"}
              aria-pressed={paint}
              onClick={() => setPaint(!paint)}
            >
              {mobile ? "Draw" : paint ? "Draw" : "Inspect"}
            </button>
            <select
              aria-label="Pixel paint value"
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value) as -1 | 0 | 1)}
            >
              <option value={1}>Black</option>
              <option value={0}>Transparent</option>
              <option value={-1}>Unknown</option>
            </select>
            <button
              className={`finish-drawing${lab.drawingInProgress ? " drawing-pending" : ""}`}
              disabled={lab.mode === "renderer"}
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
                  ? "Draw is on: tap or drag to record pixels. Tap Draw again to inspect and scroll."
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
              tool={brush}
              contradictions={lab.conflicts}
              predictions={lab.showPredictions ? lab.predictions : undefined}
              targets={
                lab.pendingItemTest?.itemTest?.mode === "pixels"
                  ? lab.experimentTargets
                  : lab.activeSnapshot.targets
              }
              highlightedNibble={highlight?.nibble}
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
              open(name === "SID" ? "sid" : "items", name)
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
