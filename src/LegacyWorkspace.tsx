import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ItemTestControls } from "./components/ItemTestControls";
import { WildRngPanel } from "./components/WildRngPanel";
import { isRecorded } from "./core/itemTests";
import type { CurtainLab } from "./hooks/useCurtainLab";
import { PixelGrid } from "./components/PixelGrid";
import { PixelInspector } from "./components/PixelInspector";
import { KnownFactsForm } from "./components/KnownFactsForm";
import { RecordInput } from "./components/RecordInput";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { ResearchArticle } from "./components/ResearchArticle";
import { RESEARCH_EXAMPLES } from "./core/examples";
import {
  InvestigationFlow,
  InvestigationResults,
  ObservationManager,
} from "./components/Investigator";

const tabs = [
  "Investigate",
  "Curtain Editor",
  "Data Recovery",
  "About",
] as const;
export default function LegacyWorkspace({ lab }: { lab: CurtainLab }) {
  const [tab, setTab] = useState<number>(() =>
    lab.pendingItemTest?.itemTest?.phase === "editing" ? 1 : 0,
  );
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (lab.pendingItemTest)
      document
        .getElementById("current-item-test")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lab.pendingItemTest?.id, lab.pendingItemTest?.itemTest?.phase]);
  function tabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : null;
    if (next !== null) {
      e.preventDefault();
      setTab(next);
      tabRefs.current[next]?.focus();
    }
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Emerald Curtain Investigator</h1>
        <p>
          From Emerald Curtain Calculator · Pokémon data investigation and
          recovery
        </p>
      </header>
      <nav className="top-tabs" role="tablist" aria-label="Tool sections">
        {tabs.map((name, i) => (
          <button
            key={name}
            role="tab"
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={`tab-${i}`}
            aria-selected={tab === i}
            aria-controls={`panel-${i}`}
            tabIndex={tab === i ? 0 : -1}
            onKeyDown={(e) => tabKey(e, i)}
            onClick={() => setTab(i)}
          >
            {name}
          </button>
        ))}
      </nav>
      {lab.activeResearchExample && (
        <div className="status-message" role="status">
          <span>
            Example workspace: <strong>{lab.activeResearchExample}</strong>
          </span>
          <button
            onClick={() => {
              lab.restoreWorkspace();
              setTab(1);
            }}
          >
            Restore previous workspace
          </button>
        </div>
      )}
      {lab.error && (
        <div className="alert error" role="alert">
          {lab.error}
          <button onClick={() => lab.setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {lab.factError && (
        <div className="alert error" role="alert">
          {lab.factError}
        </div>
      )}
      {lab.notice && (
        <div className="status-message" role="status">
          {lab.notice}
          <button
            className="text-button"
            onClick={() => lab.setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}
      {tab !== 3 && <ObservationManager lab={lab} />}
      {tab !== 3 && (
        <ItemTestControls
          lab={lab}
          openEditor={() => {
            lab.setMode("solver");
            setTab(1);
          }}
          openResults={() => {
            lab.setMode("solver");
            setTab(2);
          }}
        />
      )}
      <p className="autosave-status" role="status">
        {lab.saveStatus} · Save investigation also exports a JSON backup.
      </p>
      <section
        role="tabpanel"
        id="panel-0"
        aria-labelledby="tab-0"
        hidden={tab !== 0}
      >
        <InvestigationFlow
          lab={lab}
          openEditor={() => {
            lab.setMode("solver");
            setTab(1);
          }}
          openRecovery={() => {
            lab.setMode("solver");
            setTab(2);
          }}
        />
      </section>

      <section
        role="tabpanel"
        id="panel-1"
        aria-labelledby="tab-1"
        hidden={tab !== 1}
        className="workspace"
      >
        {lab.activeSnapshot.itemTest?.phase === "editing" ? (
          <p className="setup-instructions">
            The selected item test is active. Edit the differences from its
            named comparison drawing, then choose{" "}
            <strong>Save drawing &amp; analyze test</strong>. Unreadable pixels
            can stay unknown.
          </p>
        ) : (
          <p className="setup-instructions">
            <strong>English Emerald only.</strong> Put the Pokémon you want to
            analyze in <strong>Box 8, slot 5</strong>, and keep slots 4 and 6
            empty. Enter Rustboro City’s Trainer’s School in Pokémon Emerald,
            draw every black pixel on the curtains below, add the information
            you know under Known Pokémon information, then click{" "}
            <strong>Calculate Pokémon data</strong>.
          </p>
        )}
        <aside className="input-panel" aria-label="Inputs and drawing controls">
          <div className="mode-switch" aria-label="Input method">
            <button
              aria-pressed={lab.mode === "solver"}
              onClick={() => lab.setMode("solver")}
            >
              Draw pixels
            </button>
            <button
              aria-pressed={lab.mode === "renderer"}
              onClick={() => lab.setMode("renderer")}
            >
              Render .ek3
            </button>
          </div>
          {lab.mode === "solver" && (
            <section className="input-section paint-section">
              <h2>Draw your curtain</h2>
              <button
                className="complete-button"
                disabled={!!(lab.factError || lab.summaryError)}
                onClick={() => {
                  if (lab.completeDrawing()) setTab(2);
                }}
              >
                {lab.activeSnapshot.itemTest?.phase === "editing"
                  ? "Save drawing & analyze test"
                  : "Calculate Pokémon data"}
              </button>{" "}
              <div className="inline-buttons history-tools">
                <button onClick={lab.undoStroke} disabled={!lab.canUndo}>
                  Undo
                </button>
                <button onClick={lab.redoStroke} disabled={!lab.canRedo}>
                  Redo
                </button>
                <button onClick={lab.clear}>Clear pixels</button>
              </div>
              <p className="help">
                {lab.activeSnapshot.itemTest?.phase === "editing"
                  ? "Edit the changed pixels. Saving this test keeps unmarked cells unknown. Click black pixels again to erase."
                  : "Draw every black pixel and add known information before calculating. Remaining displayed cells will count as transparent. Click black pixels again to erase."}
              </p>
            </section>
          )}
          {lab.mode === "solver" && <KnownFactsForm lab={lab} />}
          <RecordInput lab={lab} />
          <section className="drawing-files" aria-label="Save and load drawing">
            <div className="inline-buttons">
              <button
                onClick={lab.saveDrawing}
                disabled={!!(lab.factError || lab.summaryError)}
              >
                Save drawing
              </button>
              <button onClick={() => lab.sessionRef.current?.click()}>
                Load drawing
              </button>
              <button onClick={lab.exportPng}>Save PNG</button>
            </div>
            <input
              hidden
              type="file"
              ref={lab.sessionRef}
              accept=".json"
              aria-label="Load observation JSON"
              onChange={(e) => {
                void lab.importSession(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </section>
          <details className="display-options">
            <summary>More options</summary>
            <label className="stacked-label">
              Display
              <select
                aria-label="Tile display"
                value={lab.view}
                onChange={(e) => {
                  lab.setView(e.target.value as typeof lab.view);
                  lab.setHover(null);
                }}
              >
                <option value="room">Window</option>
                <option value="raw">Raw tiles</option>
                <option value="research">Annotated tiles</option>
              </select>
            </label>
            {lab.view === "room" && (
              <>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={lab.showNeighbors}
                    onChange={(e) => {
                      lab.setShowNeighbors(e.target.checked);
                      lab.setHover(null);
                    }}
                  />
                  Show neighboring slot rows
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={lab.gameBackground}
                    onChange={(e) => lab.setGameBackground(e.target.checked)}
                  />
                  Window artwork
                </label>
              </>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={lab.showConflicts}
                onChange={(e) => lab.setShowConflicts(e.target.checked)}
              />
              Highlight candidate contradictions
            </label>
            <button className="text-button" onClick={lab.resetSolver}>
              Reset entire investigation
            </button>
          </details>
        </aside>
        <div className="curtain-column">
          <div className="canvas-toolbar">
            <label className="check-label">
              <input
                type="checkbox"
                checked={lab.showPredictions}
                onChange={(e) => lab.setShowPredictions(e.target.checked)}
              />
              Preview derived pixels
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={lab.grid}
                onChange={(e) => lab.setGrid(e.target.checked)}
              />
              Pixel grid
            </label>
            <label className="zoom-label">
              Zoom{" "}
              <input
                aria-label="Zoom"
                type="range"
                min={4}
                max={28}
                value={lab.zoom}
                onChange={(e) => lab.setZoom(Number(e.target.value))}
              />
              <output>{lab.zoom}×</output>
            </label>
          </div>
          <div className="canvas-scroll">
            <div className="canvas-wrap">
              <PixelGrid
                canvasRef={lab.canvasRef}
                placements={lab.placements}
                bounds={lab.bounds}
                zoom={lab.zoom}
                grid={lab.grid}
                annotated={lab.view === "research"}
                gameBackground={lab.view === "room" && lab.gameBackground}
                mainOnly={lab.view === "room" && !lab.showNeighbors}
                solver={lab.mode === "solver"}
                memory={lab.memory}
                observations={lab.obs}
                tool={1}
                contradictions={lab.conflicts}
                predictions={lab.showPredictions ? lab.predictions : undefined}
                targets={lab.activeSnapshot.targets}
                onHover={(hit) => {
                  if (hit) lab.setHover(hit);
                }}
                onStart={lab.start}
                onPaint={lab.paint}
                onEnd={lab.finish}
              />
            </div>
          </div>
          {lab.mode === "solver" && (
            <p className="help">
              Dashed blue outline: predicted black. Dashed teal: predicted
              transparent. Orange: experiment target. Previews are not
              observations. Compare in-game before recording a pixel.
            </p>
          )}
          {lab.mode === "renderer" && !lab.records[5] && (
            <p className="canvas-hint">
              Import an 80-byte record to preview its pixels.
            </p>
          )}
          {lab.mode === "solver" && lab.records[5] && (
            <p
              className={`candidate-status ${lab.comparison.possible ? "possible" : "impossible"}`}
            >
              <strong>
                {lab.comparison.possible
                  ? "Candidate is consistent so far"
                  : "Candidate conflicts with your drawing or known information"}
              </strong>{" "}
              · {lab.comparison.matches.length} matching,{" "}
              {lab.comparison.contradictions.length} pixel contradictions.{" "}
              <button className="text-button" onClick={() => setTab(2)}>
                View comparison
              </button>
            </p>
          )}
          <PixelInspector lab={lab} />
        </div>
      </section>

      <section
        role="tabpanel"
        id="panel-2"
        aria-labelledby="tab-2"
        hidden={tab !== 2}
        className="reconstruction-panel"
      >
        <div className="section-intro">
          <p>
            Exact digits are shared by every solution under your observations
            and known information. Imported candidates do not fill the solver.
          </p>
          <div className="inline-buttons">
            <button
              aria-pressed={lab.mode === "solver"}
              onClick={() => lab.setMode("solver")}
            >
              Drawn observations
            </button>
            <button
              aria-pressed={lab.mode === "renderer"}
              onClick={() => lab.setMode("renderer")}
            >
              Imported record
            </button>
          </div>
        </div>
        {lab.mode === "solver" &&
          lab.obs.slice(16, 176).some((n) => n === -1) && (
            <div className="partial-pattern">
              <strong>Partial drawing</strong>
              <p>
                Unmarked cells still mean unknown. If every visible black pixel
                has been drawn, you can count the remaining displayed cells as
                transparent.
              </p>
              <button
                onClick={lab.completeDrawing}
                disabled={!!(lab.factError || lab.summaryError)}
              >
                Calculate Pokémon data
              </button>
              <p className="help">
                Recheck any obscured or uncertain pixels in-game before
                completing the drawing.
              </p>
            </div>
          )}
        <WildRngPanel lab={lab} />
        <InvestigationResults lab={lab} />
        {isRecorded(lab.activeSnapshot) ? (
          lab.rngActive ? (
            <details>
              <summary>Advanced: stored-data-only analysis</summary>
              <p>
                This separate view ignores the active RNG scope. Use the RNG
                findings and joint recovered fields above for combined results.
              </p>
              <AnalysisPanel lab={lab} />
            </details>
          ) : (
            <AnalysisPanel lab={lab} />
          )
        ) : (
          <p>
            Save the edited item-test drawing to apply it to advanced recovery.
            Current findings use saved observations.
          </p>
        )}
      </section>

      <section
        role="tabpanel"
        id="panel-3"
        aria-labelledby="tab-3"
        hidden={tab !== 3}
        className="about-panel"
      >
        <ResearchArticle />
        <details>
          <summary>Using the classic workspace</summary>
          <ol>
            <li>
              In English Pokémon Emerald, place the Pokémon in Box 8, slot 5,
              keep slots 4 and 6 empty, then enter Rustboro Trainer’s School.
            </li>
            <li>
              Draw every black curtain pixel, add the Pokémon information you
              know, then choose Calculate Pokémon data. Remaining displayed
              cells count as transparent. Click a black pixel again to erase it,
              or use Undo to fix a mistake.
            </li>
            <li>
              Open Data Recovery to see guaranteed digits, remaining
              possibilities and candidate comparisons. Use PID possibilities
              there to check guesses without treating them as known information.
            </li>
          </ol>
          <p>
            The first editable row in the default view starts at PID byte 0. The
            top and bottom two neighboring rows are hidden. Hiding rows never
            assumes the neighboring slots are empty.
          </p>
          <p>
            Newly caught defaults are optional. If you apply them, they assume
            zero EVs, contest condition, PP Ups, ribbons, Pokérus and markings,
            and that the Pokémon is not an Egg. Edit these values or choose
            Clear defaults when they do not apply. Blank inputs stay unknown.
          </p>
        </details>
        <h2>Research examples</h2>
        <p>
          The Latios capture uses a contributor-reported illegal Pokémon. It
          checks byte-to-pixel rendering, not legality. The DOTS trade capture
          and user-painted Skarmory case provide additional validation.
        </p>
        <p>
          Load a saved drawing, its known information and a matching reference
          record, then open Reconstruction to explore the results. The reference
          bytes are kept separate from the solver facts.
        </p>
        <p className="help">
          Loading an example replaces the current workspace. Restore previous
          workspace brings it back while this page stays open. Save your drawing
          first if you want to keep a file for later.
        </p>
        <div className="research-examples">
          {RESEARCH_EXAMPLES.map((example) => (
            <article key={example.id}>
              <h3>{example.title}</h3>
              <p>{example.description}</p>
              <button
                onClick={() => {
                  lab.researchExample(example.id);
                  setTab(1);
                }}
              >
                Load {example.title} example
              </button>
            </article>
          ))}
        </div>
        <details>
          <summary>Synthetic test patterns</summary>
          <p className="help">
            These change only the imported preview, keeping your drawing
            separate.
          </p>
          <div className="inline-buttons">
            <button
              onClick={() => {
                lab.example("pokemon");
                lab.setMode("renderer");
                setTab(1);
              }}
            >
              Load synthetic Pokémon
            </button>
            <button
              onClick={() => {
                lab.example("pattern");
                lab.setMode("renderer");
                setTab(1);
              }}
            >
              Load nibble test pattern
            </button>
          </div>
        </details>
        <h2>Privacy and credits</h2>
        <p>
          Records and drawings are processed in your browser. There are no
          uploads, accounts, analytics or external fonts. Your investigation and
          unfinished item test save automatically on this device. Download JSON
          for a separate backup; it does not contain the imported candidate.
        </p>
        <p>
          Pokémon artwork and names belong to their respective owners. This is
          an independent research tool.
        </p>
      </section>
      <footer className="app-footer">
        All calculations run in your browser. Investigations save on this
        device; download JSON for a separate backup.
      </footer>
    </div>
  );
}
