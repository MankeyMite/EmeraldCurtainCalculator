import { HexView } from "./HexView";
import { RecoveredFields } from "./RecoveredFields";
import { constraintHex } from "../core/constraints";
import { hex, NATURES, recordHex } from "../core/pokemon";
import { download, type CurtainLab } from "../hooks/useCurtainLab";
import { HypothesisChecker } from "./HypothesisChecker";
import { IVAnalysis } from "./IVAnalysis";

export function AnalysisPanel({ lab }: { lab: CurtainLab }) {
  const {
    mode,
    inference,
    hexSource,
    setHexSource,
    displayedMasks,
    masks,
    copy,
    facts,
    pid,
    tid,
    sid,
    fieldText,
    orders,
    natures,
    records,
    names,
    comparison,
    showConflicts,
    setShowConflicts,
    imported,
  } = lab;
  return (
    <section className="analysis-content">
      <div className="analysis-title">
        <h2>
          {mode === "renderer"
            ? "Imported encrypted bytes"
            : "Data reconstruction"}
        </h2>
        <span className="live-dot">LIVE</span>
      </div>
      <p className="muted">
        Slot 5 · original encrypted record
        <br />
        High nibble shown first in each byte.
      </p>
      {mode === "solver" && (
        <div className="inference-summary" role="status">
          <strong>
            {inference.consistent
              ? "Reconstructed from the drawing and known information"
              : "Conflicting observations / facts"}
          </strong>
          <small>
            {
              inference.masks.filter((m) => m !== 0 && (m & (m - 1)) === 0)
                .length
            }
            /160 fixed digits · {inference.orders.length}/24 block orders
          </small>
        </div>
      )}
      {mode === "solver" && (
        <>
          <label className="field-label">
            Hex source
            <select
              value={hexSource}
              onChange={(e) =>
                setHexSource(e.target.value as "inferred" | "pixels")
              }
            >
              <option value="inferred">Pixels + known facts</option>
              <option value="pixels">Pixels only</option>
            </select>
          </label>
          <p className="micro">
            Every shown digit is fixed under the selected constraints. Hover
            bytes for exact counts; ? stays unresolved. Candidate bytes are
            never used to fill this hex.
          </p>
        </>
      )}
      <HexView
        masks={displayedMasks}
        byteValues={
          mode === "solver" && hexSource === "inferred"
            ? inference.byteValues
            : undefined
        }
      />
      <div className="hex-legend">
        <span className="exact">
          0 <small>exact</small>
        </span>
        <span className="nonzero">
          ?{" "}
          <small>
            {mode === "solver" && hexSource === "inferred"
              ? "restricted"
              : "1–F"}
          </small>
        </span>
        <span className="unconstrained">
          ? <small>0–F</small>
        </span>
      </div>
      <details>
        <summary>Copyable constraints (+ = nonzero)</summary>
        <textarea
          readOnly
          aria-label="Copyable hex constraints"
          value={constraintHex(displayedMasks)}
        />
        <p className="micro">
          + means all 1–F; ? means unresolved. Other restricted sets are shown
          on hover and can be recomputed from saved observations JSON.
        </p>
        <button onClick={copy}>Copy</button>
      </details>
      {mode === "solver" && <HypothesisChecker lab={lab} />}
      <div className="section-label space-top">
        FIELDS{" "}
        <span>
          {mode === "renderer"
            ? "SUPPLIED RECORD VALUES"
            : "OBSERVATIONS + KNOWN FACTS"}
        </span>
      </div>
      <div className="field-results">
        {[
          ...(mode === "renderer" ? [["PID", pid]] : []),
          [
            `Public trainer ID${mode === "solver" && facts.tid !== undefined ? " · supplied" : ""}`,
            tid,
          ],
          [
            `Secret trainer ID${mode === "solver" && facts.sid !== undefined ? " · supplied" : ""}`,
            sid,
          ],
        ].map(([label, f]) => (
          <div key={label as string}>
            <label>{label as string}</label>
            <code>0x{(f as typeof pid).hex}</code>
            <small>{fieldText(f as typeof pid)}</small>
          </div>
        ))}
        <div>
          <label>Substructure ordering · PID % 24</label>
          <strong>
            {orders.length === 24
              ? "All 24 orders possible"
              : orders.length
                ? orders.join(", ")
                : "No possible order"}
          </strong>
        </div>
        <div>
          <label>Nature · PID % 25</label>
          <strong>
            {natures.length === 25
              ? "All 25 natures possible"
              : natures.length
                ? natures.map((n) => NATURES[n]).join(", ")
                : "No possible nature"}
          </strong>
          <small>
            {mode === "solver" && facts.nature !== undefined
              ? `Supplied ${NATURES[facts.nature]} constrains PID % 25 in the solver.`
              : "Computed from surviving header / encryption constraints."}
          </small>
        </div>
        <div>
          <label>Nickname / OT name / flags / checksum</label>
          <small>
            Inspect bytes 08–1F. A supplied OT name fixes its encoded characters
            and first terminator; later name bytes stay unknown. Other character
            values may remain ambiguous. Checksum equality is not propagated.
          </small>
        </div>
        <div>
          <label>Correlations and count labels</label>
          <small>
            PID and individual byte counts are exact for the applied model. “≤”
            marks an upper bound when field values are correlated. Checksum,
            legality and EV totals are not applied.
          </small>
        </div>
      </div>
      {mode === "solver" && <IVAnalysis lab={lab} />}
      {mode === "solver" && (
        <RecoveredFields
          result={inference}
          facts={facts}
          observedMasks={masks}
        />
      )}
      <div className="section-label space-top">
        COMPARE <span>CANDIDATE CONSISTENCY</span>
      </div>
      {records[5] ? (
        <div className="candidate-card">
          <strong className={comparison.possible ? "possible" : "impossible"}>
            {comparison.possible ? "✓ Still possible" : "× Contradicted"}
          </strong>
          <p className="micro">
            {names[5]} · consistency does not establish identity
          </p>
          <div className="compare-row">
            <span>Observed pixels</span>
            <b>{comparison.observed}</b>
          </div>
          <div className="compare-row">
            <span>Matching</span>
            <b className="possible">{comparison.matches.length}</b>
          </div>
          <div className="compare-row">
            <span>Contradicting</span>
            <b className="impossible">{comparison.contradictions.length}</b>
          </div>
          <div className="compare-row">
            <span>Missing neighbor bytes</span>
            <b>{comparison.unresolved.length}</b>
          </div>
          <label className="micro">
            <input
              type="checkbox"
              checked={showConflicts}
              onChange={(e) => setShowConflicts(e.target.checked)}
            />{" "}
            Highlight contradictions
          </label>
          {comparison.factContradictions.map((s) => (
            <p className="error-text" key={s}>
              {s}
            </p>
          ))}
          {comparison.contradictions.length > 0 && (
            <details className="reference-disagreements">
              <summary>Which pixels differ from the reference?</summary>
              <p className="micro">
                An imported record is a comparison reference. Check these pixels
                in-game before changing your observations.
              </p>
              <ul>
                {comparison.contradictions.map((index) => {
                  const offset = Math.floor((index - 16) / 2),
                    value = lab.memory[Math.floor(index / 2)];
                  const predicted =
                    value === null
                      ? "Unknown"
                      : (value >>> ((index % 2) * 4)) & 15
                        ? "Black"
                        : "Transparent";
                  return (
                    <li key={index}>
                      Pixel {index} ·{" "}
                      {index >= 16 && index < 176
                        ? `record byte 0x${hex(offset)}`
                        : "neighboring slot"}
                      , {index % 2 ? "high" : "low"} nibble: drawn{" "}
                      {lab.obs[index] === 1 ? "Black" : "Transparent"};
                      reference {predicted}.
                    </li>
                  );
                })}
              </ul>
              <button onClick={lab.highlightReferenceConflicts}>
                Highlight reference disagreements in Curtain Editor
              </button>
            </details>
          )}
        </div>
      ) : (
        <div className="empty-candidate">
          <span>◇</span>
          <p>Import an encrypted .ek3 to compare it with your observations.</p>
        </div>
      )}
      <p className="micro">
        Candidate comparison uses the drawn pixels and known stored-data facts.
        Summary-stat ranges are compared separately in IV ranges.
      </p>
      {imported && (
        <details className="candidate-details">
          <summary>Imported Pokémon fields</summary>
          <p className="micro">
            Decoded from the complete candidate, not recovered from the curtain.
          </p>
          <div className="compare-row">
            <span>PID</span>
            <code>0x{hex(imported.pid, 8)}</code>
          </div>
          <div className="compare-row">
            <span>TID / SID</span>
            <b>
              {imported.tid} / {imported.sid}
            </b>
          </div>
          <div className="compare-row">
            <span>Species (internal ID)</span>
            <b>{imported.species}</b>
          </div>
          <div className="compare-row">
            <span>Nature</span>
            <b>{NATURES[imported.nature]}</b>
          </div>
          <div className="compare-row">
            <span>Checksum</span>
            <b className={imported.checksumValid ? "possible" : "impossible"}>
              {imported.checksumValid ? "Valid" : "Mismatch"}
            </b>
          </div>
          <p className="micro">
            IVs (HP/Atk/Def/Speed/SpA/SpD): {imported.ivs.join(" / ")}
            <br />
            EVs: {imported.evs.join(" / ")}
            <br />
            Moves (internal IDs): {imported.moves.join(", ")}
            <br />
            Experience: {imported.experience}
          </p>
          {!imported.checksumValid && (
            <p className="error-text">
              Decryption checksum mismatch: fields may be invalid. File length
              alone cannot identify ciphertext versus decrypted data.
            </p>
          )}
          <button
            onClick={() =>
              download(
                "candidate.ek3",
                new Blob([records[5]!.slice().buffer as ArrayBuffer], {
                  type: "application/octet-stream",
                }),
              )
            }
          >
            Download original .ek3
          </button>
          <details>
            <summary>Original bytes</summary>
            <textarea
              readOnly
              value={recordHex(records[5]!)}
              aria-label="Original encrypted record"
            />
          </details>
        </details>
      )}
    </section>
  );
}
