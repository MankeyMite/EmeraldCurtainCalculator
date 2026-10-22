import { useState } from "react";
import { hex } from "../core/pokemon";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { DewfordPanel } from "./DewfordPanel";
import { SidDigitControls } from "./SidDigitControls";
import {
  DEFAULT_SID_RNG,
  sidWindowFromSeconds,
  widenSidRng,
} from "../core/sidRng";
export function SidRngPanel({
  lab,
  compact = false,
  onCandidates,
}: {
  lab: CurtainLab;
  compact?: boolean;
  onCandidates?: () => void;
}) {
  const [error, setError] = useState("");
  const settings = lab.sidRngSettings ?? DEFAULT_SID_RNG;
  const update = (key: "minAdvance" | "maxAdvance", value: string) => {
    try {
      lab.setSidRngSettings({ ...settings, [key]: Number(value) });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const result = lab.sidRngResult;
  const [showAll, setShowAll] = useState(false);
  const widen = () => lab.setSidRngSettings(widenSidRng(settings));
  return (
    <>
      <SidDigitControls lab={lab} />
      <section
        className={`sid-rng-panel ${compact ? "compact" : ""}`}
        aria-label="New-game SID RNG Filter"
      >
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!lab.sidRngSettings}
            onChange={(e) => {
              lab.setSidRngSettings(
                e.target.checked ? DEFAULT_SID_RNG : undefined,
              );
              setError("");
            }}
          />
          New-game SID RNG Filter
        </label>
        {!compact && (
          <p>
            Automatically seeded with original trainer TID{" "}
            <strong>{lab.facts.tid ?? "— enter TID first"}</strong>. This models
            that trainer's Emerald new game. Fixed in-game trade IDs do not use
            this sequence.
          </p>
        )}
        {!compact && <DewfordPanel lab={lab} />}
        {lab.sidRngSettings && (
          <>
            <p className="micro">
              Time from leaving the player naming screen to entering the game
              world. Use a wider range if unsure.
            </p>
            <div className="timing-inputs">
              <label>
                Min seconds
                <input
                  aria-label="SID minimum seconds"
                  type="number"
                  min={0}
                  step="0.5"
                  value={
                    settings.minAdvance === 1 ? 0 : settings.minAdvance / 60
                  }
                  onChange={(e) => {
                    try {
                      lab.setSidRngSettings({
                        ...settings,
                        ...sidWindowFromSeconds(
                          Number(e.target.value),
                          settings.maxAdvance / 60,
                        ),
                      });
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
              <label>
                Max seconds
                <input
                  aria-label="SID maximum seconds"
                  type="number"
                  min={0}
                  step="0.5"
                  value={settings.maxAdvance / 60}
                  onChange={(e) => {
                    try {
                      lab.setSidRngSettings({
                        ...settings,
                        ...sidWindowFromSeconds(
                          settings.minAdvance === 1
                            ? 0
                            : settings.minAdvance / 60,
                          Number(e.target.value),
                        ),
                      });
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
            </div>
            <details>
              <summary>Custom SID RNG advances</summary>
              <div className="timing-inputs">
                <label>
                  Minimum advance
                  <input
                    aria-label="SID minimum advance"
                    type="number"
                    min={1}
                    value={settings.minAdvance}
                    onChange={(e) => update("minAdvance", e.target.value)}
                  />
                </label>
                <label>
                  Maximum advance
                  <input
                    aria-label="SID maximum advance"
                    type="number"
                    min={1}
                    value={settings.maxAdvance}
                    onChange={(e) => update("maxAdvance", e.target.value)}
                  />
                </label>
              </div>
              <p className="micro">
                Inclusive bounds. Advance 1 is the first Random() result after
                seeding with TID. Seconds use approximately 60 calls per second;
                extra calls and transitions change the actual count.
              </p>
            </details>
            {lab.facts.tid === undefined ? (
              <p className="micro">
                Enter the public original trainer TID to generate SIDs.
              </p>
            ) : (
              <p className="sid-counts">
                <strong>{lab.sidRngRows.length.toLocaleString()}</strong>{" "}
                distinct RNG-compatible SIDs
                {lab.curtainSidAnalysis && !lab.rngActive && (
                  <>
                    {" "}
                    ·{" "}
                    <strong>
                      {lab.curtainSidAnalysis.sidValues.length.toLocaleString()}
                    </strong>{" "}
                    curtain-compatible SIDs
                  </>
                )}
                {result && (
                  <>
                    {" "}
                    → <strong>
                      {result.rows.length.toLocaleString()}
                    </strong>{" "}
                    {result.exact
                      ? "in the actual intersection"
                      : "not ruled out"}
                  </>
                )}
                .
              </p>
            )}
            {settings.dewford && settings.dewford.enabled !== false && (
              <p className="micro">
                The RNG-compatible pool includes active Dewford phrase evidence
                and recorded phrase tests. Disable Dewford evidence above to
                compare with timing alone.
              </p>
            )}
            {lab.sidRngBusy && (
              <p role="status" className="micro">
                {lab.analysisStatus}
              </p>
            )}
            {result && !result.exact && (
              <p className="micro">
                Some broad PID relationships remain unresolved. They are
                retained, not reported as proven matches or silently excluded.
              </p>
            )}
            {(error || lab.sidRngError) && (
              <p role="alert">{error || lab.sidRngError}</p>
            )}
            {result?.rows.length === 0 && (
              <p role="alert">
                No SID survives this timing window and the saved evidence. The
                timing window, known facts or observations may be incorrect.
              </p>
            )}
            <div className="inline-buttons">
              <button
                disabled={
                  settings.maxAdvance - settings.minAdvance + 1 >=
                  (settings.dewford && settings.dewford.enabled !== false
                    ? 100000
                    : 1000000)
                }
                onClick={widen}
              >
                Widen SID window
              </button>
              <button onClick={() => lab.setSidRngSettings(undefined)}>
                Disable SID filter
              </button>
              {compact && (
                <button onClick={onCandidates}>View candidate SIDs</button>
              )}
            </div>
            {!compact && result && (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>SID</th>
                        <th>RNG advances</th>
                        <th>Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows
                        .slice(0, showAll ? undefined : 50)
                        .map((row) => (
                          <tr key={row.sid}>
                            <td>
                              {row.sid} - 0x{hex(row.sid, 4)}
                            </td>
                            <td>{row.advances.join(", ")}</td>
                            <td>
                              <button
                                onClick={() =>
                                  lab.validateSidCandidate(row.sid)
                                }
                              >
                                Validate {row.sid}
                              </button>
                              {row.unresolved && " · unresolved"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {result.rows.length > 50 && (
                  <button onClick={() => setShowAll(!showAll)}>
                    {showAll
                      ? "Show first 50"
                      : `Show all ${result.rows.length} SIDs`}
                  </button>
                )}
                {lab.sidCandidateCheck && (
                  <p role="status">{lab.sidCandidateCheck}</p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
