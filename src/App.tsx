import { useRef, useState, type KeyboardEvent } from "react";
import { useCurtainLab } from "./hooks/useCurtainLab";
import { PixelGrid } from "./components/PixelGrid";
import { PixelInspector } from "./components/PixelInspector";
import { KnownFactsForm } from "./components/KnownFactsForm";
import { RecordInput } from "./components/RecordInput";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { MAPPING } from "./core/tiles";
import { RESEARCH_EXAMPLES } from "./core/examples";

const tabs = ["Curtain", "Reconstruction", "About"] as const;
export default function App() {
  const lab = useCurtainLab();
  const [tab, setTab] = useState<number>(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
        <h1>Emerald Curtain Calculator</h1>
        <p>Rustboro Trainer’s School · Pokémon Emerald</p>
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
              setTab(0);
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

      <section
        role="tabpanel"
        id="panel-0"
        aria-labelledby="tab-0"
        hidden={tab !== 0}
        className="workspace"
      >
        <p className="setup-instructions">
          <strong>English Emerald only.</strong> Put the Pokémon you want to
          analyze in <strong>Box 8, slot 5</strong>, and keep slots 4 and 6
          empty. Enter Rustboro City’s Trainer’s School in Pokémon Emerald, draw
          every black pixel on the curtains below, add the information you know
          under Known Pokémon information, then click{" "}
          <strong>Calculate Pokémon data</strong>.
        </p>
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
                  lab.completeDrawing();
                  setTab(1);
                }}
              >
                Calculate Pokémon data
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
                Draw every black pixel and add known information before
                calculating. Remaining displayed cells will count as
                transparent. Click black pixels again to erase.
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
              Reset drawing and known information
            </button>
          </details>
        </aside>
        <div className="curtain-column">
          <div className="canvas-toolbar">
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
                onHover={(hit) => {
                  if (hit) lab.setHover(hit);
                }}
                onStart={lab.start}
                onPaint={lab.paint}
                onEnd={lab.finish}
              />
            </div>
          </div>
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
              <button className="text-button" onClick={() => setTab(1)}>
                View comparison
              </button>
            </p>
          )}
          <PixelInspector lab={lab} />
        </div>
      </section>

      <section
        role="tabpanel"
        id="panel-1"
        aria-labelledby="tab-1"
        hidden={tab !== 1}
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
        <AnalysisPanel lab={lab} />
      </section>

      <section
        role="tabpanel"
        id="panel-2"
        aria-labelledby="tab-2"
        hidden={tab !== 2}
        className="about-panel"
      >
        <h2>What is this tool about?</h2>
        <p>
          A graphics glitch in Pokémon Emerald makes data from boxed Pokémon
          appear as black patterns along the windows of Rustboro Trainer’s
          School. These patterns change with the stored Pokémon data.
        </p>
        <p>
          This is primarily a tool for understanding the glitch. Hover over a
          curtain pixel to inspect its byte, nibble and, when identifiable,
          Pokémon data field. You can import an encrypted Pokémon record to
          preview its pattern, or draw the pattern you see in-game. Combined
          with known information, your drawing can also narrow down that
          Pokémon’s IVs and PID, sometimes to an exact value.
        </p>
        <h2>How to use the calculator</h2>
        <ol>
          <li>
            In English Pokémon Emerald, place the Pokémon in Box 8, slot 5, keep
            slots 4 and 6 empty, then enter Rustboro Trainer’s School.
          </li>
          <li>
            Draw every black curtain pixel, add the Pokémon information you
            know, then choose Calculate Pokémon data. Remaining displayed cells
            count as transparent. Click a black pixel again to erase it, or use
            Undo to fix a mistake.
          </li>
          <li>
            Open Reconstruction to see guaranteed digits, remaining
            possibilities and candidate comparisons. Use PID possibilities there
            to check guesses without treating them as known information.
          </li>
        </ol>
        <p>
          The first editable row in the default view starts at PID byte 0. The
          top and bottom two neighboring rows are hidden. Hiding rows never
          assumes the neighboring slots are empty.
        </p>
        <p>
          Review the labeled newly caught defaults before calculating. They
          assume zero EVs, contest condition, PP Ups, ribbons, Pokérus and
          markings, and that the Pokémon is not an Egg. Edit these values or
          choose Clear defaults when they do not apply. Blank inputs stay
          unknown.
        </p>
        <h2>What the tool can establish</h2>
        <p>
          Each pixel reveals whether one stored four-bit value (nibble) is zero
          or nonzero. The header is unencrypted; the final 48 bytes are
          encrypted. Black alone cannot distinguish the 15 nonzero values.
          Species, gender, ability, IVs, EVs, contest condition, nature and
          trainer IDs can narrow possibilities through PID rules, XOR encryption
          and block order.
        </p>
        <p>
          All exact values are conditional on accurate painting and true
          supplied information. Summary stats can narrow IV ranges; exact IVs
          you apply also constrain the PID search. Unresolved IV ranges are not
          searched jointly. Checksum equality, encounter legality, EV totals and
          inferred names are not part of the PID search. Counts marked ≤ are
          upper bounds.
        </p>
        <h2>Supported game version</h2>
        <p>
          This tool currently supports English Pokémon Emerald only. Its storage
          offsets, window layout and pixel mapping have been validated against
          English Emerald. Other language versions have not been validated here;
          changing the box position alone may not be sufficient.
        </p>
        <h2>Source and validation</h2>
        <p>
          Developed with AI assistance. Mapping and solver behavior are checked
          through source analysis, emulator captures and automated tests.
          Calculations run locally using deterministic code.
        </p>
        <p>
          Background information and earlier reports of the affected storage
          slots and memory region are documented by{" "}
          <a
            href="https://bulbapedia.bulbagarden.net/wiki/List_of_overworld_glitches_(Generation_III)#Trainer's_School_window_tile_quirks"
            target="_blank"
            rel="noreferrer"
          >
            Bulbapedia
          </a>{" "}
          and{" "}
          <a
            href="https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html"
            target="_blank"
            rel="noreferrer"
          >
            Glitch City researchers
          </a>
          . This project builds on that earlier work.
        </p>
        <p>
          The exact graphics and record mapping is derived from{" "}
          <a
            href={`https://github.com/pret/pokeemerald/tree/${MAPPING.commit}`}
            target="_blank"
            rel="noreferrer"
          >
            pret/pokeemerald
          </a>
          . Tiles 791–793 leak 96 bytes: the last 8 of slot 4, all 80 of slot 5,
          and the first 8 of slot 6. Mirrored appearances share the same
          nibbles. All 192 nibbles are visible in the static school layout;
          sprites, menus and clipping can temporarily obscure them.
        </p>
        <p>
          Independent English Emerald mGBA captures match the 96 bytes and 768
          displayed pixels. The absolute live-storage address can move; the
          byte-to-pixel mapping stays tied to the captured graphics upload.
          Other ROMs and runtime configurations need validation.
        </p>
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
                  setTab(0);
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
                setTab(0);
              }}
            >
              Load synthetic Pokémon
            </button>
            <button
              onClick={() => {
                lab.example("pattern");
                lab.setMode("renderer");
                setTab(0);
              }}
            >
              Load nibble test pattern
            </button>
          </div>
        </details>
        <h2>Privacy and credits</h2>
        <p>
          Records and drawings are processed in your browser. There are no
          uploads, accounts, analytics or external fonts. Save a drawing as JSON
          to keep it between visits; it does not contain the imported candidate.
        </p>
        <p>
          Pokémon artwork and names belong to their respective owners. This is
          an independent research tool.
        </p>
      </section>
      <footer className="app-footer">
        All calculations run in your browser. Save your drawing before closing
        the page.
      </footer>
    </div>
  );
}
