import { useEffect, useRef, useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { PokemonInfoForm } from "./PokemonInfoForm";
import { PixelGrid } from "./PixelGrid";
import { PixelInspector } from "./PixelInspector";
import { GroupedHex } from "./GroupedHex";
import { RecoveryOverview } from "./RecoveryOverview";
import { stripLayout } from "./WorkbenchData";
import { InvestigationResults, ObservationManager } from "./Investigator";
import { ItemTestControls } from "./ItemTestControls";
import { SidRngPanel } from "./SidRngPanel";
import { WildRngPanel } from "./WildRngPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { RecordInput } from "./RecordInput";
import { ResearchArticle } from "./ResearchArticle";
import { RESEARCH_EXAMPLES } from "../core/examples";
import { isRecorded } from "../core/itemTests";
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
    [brush, setBrush] = useState<-1 | 0 | 1>(1);
  const scroll = useRef<HTMLDivElement>(null),
    layout = stripLayout(),
    highlight = lab.hover ?? lab.selectedPixel;
  const open = (next: string, focus = "hidden data") => {
    setTab("investigate");
    setSection(next);
    setField(focus);
  };
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [tab, section]);
  useEffect(() => {
    if (lab.pendingItemTest) {
      open("items");
      setPaint(true);
    }
  }, [lab.pendingItemTest?.id]);
  const finish = () => {
    if (lab.completeDrawing()) open("items");
  };
  const newPokemon = () => {
    lab.resetSolver();
    setTab("info");
    setSection("items");
    setField("hidden data");
    setPaint(true);
    setBrush(1);
    scroll.current?.scrollTo({ top: 0 });
  };
  return (
    <main
      className="workbench"
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
            ["investigate", "Investigate"],
            ["about", "About"],
          ].map(([id, name]) => (
            <button
              role="tab"
              key={id}
              id={`work-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`work-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onKeyDown={(e) => {
                const ids = ["info", "investigate", "about"],
                  index = ids.indexOf(id);
                const next =
                  e.key === "ArrowRight"
                    ? (index + 1) % 3
                    : e.key === "ArrowLeft"
                      ? (index + 2) % 3
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? 2
                          : -1;
                if (next < 0) return;
                e.preventDefault();
                setTab(ids[next]);
                document.getElementById(`work-tab-${ids[next]}`)?.focus();
              }}
              onClick={() => setTab(id)}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="left-scroll" ref={scroll}>
          {(lab.error || lab.factError || lab.summaryError) && (
            <p className="alert error" role="alert">
              {lab.error || lab.factError || lab.summaryError}
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
                  ["wild", "Wild RNG"],
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
                Investigating <strong>{field}</strong>. Every result uses saved
                observations and active assumptions.
              </div>
              <ObservationManager lab={lab} />
              <ItemTestControls
                lab={lab}
                openEditor={() => {
                  lab.setMode("solver");
                  setPaint(true);
                  open("items", field);
                }}
                openResults={() => open("items", field)}
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
                    Select Wild encounter under Pokémon info to use H1/H2/H4
                    seed and advance searching.
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
                  Enter known Pokémon information on the left. The fixed right
                  panel shows your curtain, remaining values and the 80-byte
                  encrypted record. Unknown values stay unknown.
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
                  Predictions are outlines, not observations.
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
        </footer>
      </section>
      <section
        className="visual-workspace"
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
          <div>
            <button
              disabled={lab.mode === "renderer"}
              aria-pressed={paint}
              onClick={() => setPaint(!paint)}
            >
              {paint ? "Draw" : "Inspect"}
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
            <button disabled={lab.mode === "renderer"} onClick={finish}>
              {lab.pendingItemTest ? "Save test drawing" : "Calculate"}
            </button>
          </div>
        </div>
        <div className="curtain-and-results">
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
              solver={lab.mode === "solver" && paint}
              memory={lab.memory}
              observations={lab.obs}
              tool={brush}
              contradictions={lab.conflicts}
              predictions={lab.showPredictions ? lab.predictions : undefined}
              targets={lab.activeSnapshot.targets}
              highlightedNibble={highlight?.nibble}
              onSelect={lab.setSelectedPixel}
              onHover={lab.setHover}
              onStart={lab.start}
              onPaint={lab.paint}
              onEnd={lab.finish}
            />
          </div>
          <RecoveryOverview
            lab={lab}
            onInvestigate={(name) =>
              open(name === "SID" ? "sid" : "items", name)
            }
          />
        </div>
        <PixelInspector lab={lab} />
        <GroupedHex lab={lab} />
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
