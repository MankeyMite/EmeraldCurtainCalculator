import { useMemo, useState } from "react";
import { allowedValues, type KnownFacts } from "../core/constraints";
import { hex } from "../core/pokemon";
import {
  guidePlaintextMask,
  sidDigitMaskForPlaintext,
  spindaRngEvidence,
  guidePlaintextDetails,
  spindaInfoPlaintext,
  spindaSidMasks,
  spindaSidTargets,
  spindaBlockOrder,
  type SpindaSidGuideState,
} from "../core/spindaSidGuide";
import type { SpindaCandidate } from "../core/spindaMatcher";
import { hitForNibble, recordStripLayout } from "./WorkbenchData";

// Read coordinates from the actual flipped school tiles, rather than drawing
// an idealized byte rectangle with a different orientation.
const bounds = recordStripLayout().bounds;
const cells = Array.from({ length: 160 }, (_, i) => {
  const nibble = i + 16,
    hit = hitForNibble(nibble)!;
  return {
    nibble,
    row: hit.displayY - bounds.y + 1,
    col: hit.displayX - bounds.x + 1,
  };
}).sort((a, b) => a.row - b.row || a.col - b.col);
const location = (nibble: number) => {
  const cell = cells.find((c) => c.nibble === nibble)!;
  return `row ${cell.row}, column ${cell.col}`;
};

export function SpindaSidGuide({
  value,
  onChange,
  onLocate,
  facts,
  infoError,
  sidDigitFilters,
  rngCandidate,
  rngStatus,
}: {
  value: SpindaSidGuideState;
  onChange: (next: SpindaSidGuideState) => void;
  onLocate?: (nibble: number) => void;
  facts?: KnownFacts;
  infoError?: boolean;
  sidDigitFilters?: number[];
  rngCandidate?: SpindaCandidate;
  rngStatus?: string;
}) {
  const [fieldIndex, setFieldIndex] = useState(0);
  const infoPlaintext = useMemo(
    () => (infoError ? undefined : spindaInfoPlaintext(facts)),
    [facts, infoError],
  );
  const rng = useMemo(
    () =>
      infoError
        ? undefined
        : spindaRngEvidence(value.pid, rngCandidate, infoPlaintext),
    [value.pid, rngCandidate, infoPlaintext, infoError],
  );
  const targets = spindaSidTargets(value.pid, value.digit),
    target = targets[fieldIndex],
    resolved = guidePlaintextDetails(value, target, infoPlaintext, rng?.masks),
    plaintext = resolved.value,
    plaintextMask = guidePlaintextMask(
      value,
      target,
      infoPlaintext,
      rng?.masks,
    ),
    plaintextValues = allowedValues(plaintextMask),
    implication = allowedValues(
      sidDigitMaskForPlaintext(target.pidDigit, plaintextMask, 0),
    ),
    observed = value.observations[target.nibble] ?? -1,
    masks = spindaSidMasks(
      value,
      infoPlaintext,
      rng?.plaintexts,
      sidDigitFilters,
    ),
    digits = masks.map(allowedValues),
    update = (patch: Partial<SpindaSidGuideState>) =>
      onChange({ ...value, ...patch });
  const answer = (answer: -1 | 0 | 1) => {
    const observations = { ...value.observations };
    if (answer === -1) delete observations[target.nibble];
    else observations[target.nibble] = answer;
    update({ observations });
  };
  return (
    <section className="spinda-sid-guide" aria-label="Spinda SID pixel guide">
      <h3>Check curtain pixels for SID digits</h3>
      <p>
        Using estimated PID <strong>0x{hex(value.pid, 8)}</strong>. No Pokémon
        info or TID is required. Catch this Spinda before observing its curtain.
        This guide does not apply the PID to your investigation.
      </p>
      <p className="help">
        Permutation {value.pid % 24} (PID % 24), left to right in stored data:
        <br />
        <strong>{spindaBlockOrder(value.pid).join(" → ")}</strong>
      </p>
      <div className="spinda-sid-digits" aria-label="Select SID digit">
        {([1, 2, 3, 4] as const).map((digit) => (
          <button
            key={digit}
            aria-pressed={value.digit === digit}
            onClick={() => update({ digit })}
          >
            S{digit}
            <strong>
              {digits[digit - 1].length === 1
                ? hex(digits[digit - 1][0], 1)
                : masks[digit - 1]
                  ? "?"
                  : "!"}
            </strong>
            <small>{digits[digit - 1].length} possible</small>
          </button>
        ))}
      </div>
      <p role="status">
        Conditional SID:{" "}
        <code>
          0x
          {digits
            .map((d) => (d.length === 1 ? hex(d[0], 1) : d.length ? "?" : "!"))
            .join("")}
        </code>
        .
        {masks.some((m) => !m)
          ? " Conflicting answers: review the PID, known values and observations."
          : " Unknown digits stay open; a visual PID estimate is not verified by this calculation."}
      </p>
      {sidDigitFilters?.some((m) => m !== 65535) && (
        <p className="help">
          Manual SID digit limits from SID Finder are also applied here. Clear
          them there to compare without prior exclusions.
        </p>
      )}
      {rng ? (
        <div className="investigation-card" aria-label="RNG-derived Spinda IVs">
          <strong>Encounter IVs for this exact PID</strong>
          <p>
            {rng.ivs.length ? (
              <>
                {rng.ivs.length} possible IV spread(s), HP / Atk / Def / Spe /
                SpA / SpD:
                {rng.ivs.slice(0, 6).map((ivs, i) => (
                  <code key={i} style={{ display: "block" }}>
                    {ivs.join(" / ")}
                  </code>
                ))}
                {rng.ivs.length > 6 && (
                  <span>
                    Plus {rng.ivs.length - 6} other spreads; all are included in
                    deduction.
                  </span>
                )}
              </>
            ) : (
              "No encounter IV spread agrees with the entered IV/flag information. Review the PID, RNG settings or Pokémon info."
            )}
          </p>
          <p className="help">
            Conditional on the estimated PID and current RNG range, methods and
            encounter settings. Wild non-Egg and generated ability-slot flags
            are included. Exact nibbles fill automatically; ambiguous values
            stay alternatives. Saved Pokémon info is preserved.
          </p>
        </div>
      ) : (
        !infoError && rngStatus && <p role="status">{rngStatus}</p>
      )}
      <div className="spinda-guide-options">
        <label>
          <input
            type="checkbox"
            checked={value.freshZeros}
            onChange={(e) => update({ freshZeros: e.target.checked })}
          />
          Assume fresh, untouched ordinary wild Spinda: zero EVs, contest
          conditions and ribbon / unused flags
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.paddingZero}
            onChange={(e) => update({ paddingZero: e.target.checked })}
          />
          Separately assume Growth padding is zero
        </label>
      </div>
      <p className="help">
        Known nibbles fill automatically from the active Spinda’s Pokémon info,
        including its entered assumptions, and update when those values change.
        Matching RNG encounters also supply IVs and packed flags without filling
        in Pokémon info. Partially known nibbles stay unknown. Manual entries,
        including “unknown”, override automatic values; Pokémon info takes
        precedence over the guide’s zero presets.
      </p>
      {infoError && (
        <p role="status">
          Correct the invalid Pokémon info inputs to resume automatic plaintext.
          Manual values and guide presets remain available.
        </p>
      )}
      {!infoError && !infoPlaintext && (
        <p className="help">
          To fill values from Pokémon info, select Spinda there. You can still
          use this guide immediately with manual values or the optional presets.
        </p>
      )}
      {!!Object.keys(value.plaintext).length && (
        <button onClick={() => update({ plaintext: {} })}>
          Use automatic plaintext for all fields
        </button>
      )}
      <div className="spinda-guide-workspace">
        <div>
          <p>
            <strong>
              S{value.digit}: {targets.length} highlighted pixels
            </strong>
            <br />
            Main record only, 8 columns × 20 rows. Orange cells test S
            {value.digit}; the green outline is the selected field.
          </p>
          <div
            className="spinda-guide-map"
            aria-label={`Curtain pixels for SID digit S${value.digit}`}
          >
            <span />
            {Array.from({ length: 8 }, (_, i) => (
              <small key={`c${i}`}>{i + 1}</small>
            ))}
            {Array.from({ length: 20 }, (_, r) => (
              <div className="spinda-guide-row" key={r}>
                <small>{r + 1}</small>
                {cells
                  .filter((c) => c.row === r + 1)
                  .map((cell) => {
                    const index = targets.findIndex(
                        (t) => t.nibble === cell.nibble,
                      ),
                      isTarget = index !== -1,
                      state = value.observations[cell.nibble];
                    return (
                      <button
                        key={cell.nibble}
                        disabled={!isTarget}
                        aria-label={`${location(cell.nibble)}${isTarget ? `: ${targets[index].field}, ${targets[index].half} nibble` : ": other field"}`}
                        aria-pressed={isTarget && index === fieldIndex}
                        className={`${isTarget ? "target" : ""} ${isTarget && index === fieldIndex ? "selected" : ""} ${state === 0 ? "transparent" : state === 1 ? "black" : "unknown"}`}
                        onClick={() => setFieldIndex(index)}
                      >
                        {isTarget
                          ? state === undefined
                            ? "?"
                            : state === 0
                              ? "○"
                              : "●"
                          : "·"}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
        <div className="spinda-guide-answer">
          <h4>
            {target.field} · {target.half} nibble
          </h4>
          <p>
            <strong>{location(target.nibble)}</strong> · S{value.digit} ↔ PID
            digit {value.digit} (<code>{hex(target.pidDigit, 1)}</code>),
            counting from the left.
          </p>
          {onLocate && (
            <button onClick={() => onLocate(target.nibble)}>
              Locate selected pixel in main curtain
            </button>
          )}
          <label>
            Known plaintext nibble (hex)
            <select
              aria-label="Known plaintext nibble"
              value={plaintext ?? -1}
              onChange={(e) =>
                update({
                  plaintext: {
                    ...value.plaintext,
                    [target.logicalNibble]: Number(e.target.value),
                  },
                })
              }
            >
              <option value={-1}>
                {rng &&
                plaintext === undefined &&
                plaintextValues.length > 1 &&
                plaintextValues.length < 16
                  ? `Multiple: ${plaintextValues.map((n) => hex(n, 1)).join(" / ")}`
                  : "Unknown"}
              </option>
              {Array.from({ length: 16 }, (_, n) => (
                <option key={n} value={n}>
                  {hex(n, 1)}
                </option>
              ))}
            </select>
          </label>
          <p className="help">
            {resolved.source === "rng"
              ? "Automatically from matching RNG encounters (conditional on this PID and RNG scope)."
              : resolved.source === "info"
                ? "Automatically from Pokémon info (including active assumptions)."
                : resolved.source === "preset"
                  ? "Automatically from a guide zero assumption."
                  : resolved.source === "manual"
                    ? "Manual override; automatic values are paused for this field."
                    : "No exact plaintext nibble is known yet."}
          </p>
          {resolved.source === "manual" && (
            <button
              onClick={() => {
                const plaintext = { ...value.plaintext };
                delete plaintext[target.logicalNibble];
                update({ plaintext });
              }}
            >
              Use automatic value for this field
            </button>
          )}
          {plaintext === undefined &&
            rng &&
            plaintextValues.length > 1 &&
            plaintextValues.length < 16 && (
              <p className="help">
                Possible plaintext nibbles from encounter IVs:{" "}
                <code>{plaintextValues.map((n) => hex(n, 1)).join(" ")}</code>.
                All alternatives are used below.
              </p>
            )}
          <p>
            {plaintext === undefined && (!rng || plaintextMask === 65535) ? (
              "Choose a known field value or an applicable zero preset to interpret this pixel. Its location is already correct for the estimated PID."
            ) : (
              <>
                Transparent → S{value.digit} ={" "}
                <code>
                  {plaintextValues.map((n) => hex(n, 1)).join(" / ")} XOR{" "}
                  {hex(target.pidDigit, 1)} ={" "}
                  {implication.map((n) => hex(n, 1)).join(" / ") ||
                    "no compatible value"}
                </code>
                .<br />
                {plaintextValues.length === 1 ? (
                  <>
                    Black excludes S{value.digit} ={" "}
                    <code>{hex(plaintextValues[0] ^ target.pidDigit, 1)}</code>.
                  </>
                ) : (
                  "A black answer keeps every spread that can produce a nonzero encrypted nibble; it does not exclude all of these alternatives."
                )}
              </>
            )}
          </p>
          <p>What do you actually see at this pixel?</p>
          <div className="inline-buttons">
            {(
              [
                [-1, "Unobserved"],
                [0, "Transparent"],
                [1, "Black"],
              ] as const
            ).map(([n, label]) => (
              <button
                key={n}
                aria-pressed={observed === n}
                onClick={() => answer(n)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="help">
            A transparent pixel has encrypted nibble zero. Black means nonzero,
            excluding just one SID value when plaintext is known. Unobserved
            adds no evidence.
          </p>
          <p>
            Remaining S{value.digit} values:{" "}
            <code>
              {digits[value.digit - 1].map((n) => hex(n, 1)).join(" ") ||
                "none — contradiction"}
            </code>
          </p>
          <p className="help">
            Guide answers and manual overrides save separately from the curtain
            drawing and solver. Automatic values follow Pokémon info and the
            current complete RNG search. Physical answers stay at the same
            curtain coordinates when you try another PID; logical known values
            follow their fields. Use answers from this same Spinda and the same
            stored state only.
          </p>
          {!!Object.keys(value.observations).length && (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Clear the Spinda guide answers? Your main curtain drawing is preserved.",
                  )
                )
                  update({ observations: {} });
              }}
            >
              Clear guide answers…
            </button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className="spinda-guide-fields">
          <thead>
            <tr>
              <th>Field ({target.half} nibble)</th>
              <th>Curtain pixel</th>
              <th>Plaintext</th>
              <th>Answer</th>
              <th>SID implication</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t, i) => {
              const plainMask = guidePlaintextMask(
                  value,
                  t,
                  infoPlaintext,
                  rng?.masks,
                ),
                values = allowedValues(plainMask),
                a = value.observations[t.nibble],
                possible =
                  a === undefined
                    ? []
                    : allowedValues(
                        sidDigitMaskForPlaintext(t.pidDigit, plainMask, a),
                      );
              return (
                <tr
                  key={t.logicalNibble}
                  className={i === fieldIndex ? "selected" : ""}
                >
                  <td>
                    <button
                      aria-pressed={i === fieldIndex}
                      onClick={() => setFieldIndex(i)}
                    >
                      {t.field}
                    </button>
                  </td>
                  <td>{location(t.nibble)}</td>
                  <td>
                    {plainMask === 65535
                      ? "?"
                      : values.map((n) => hex(n, 1)).join(" / ") || "conflict"}
                  </td>
                  <td>
                    {a === undefined
                      ? "Unobserved"
                      : a === 0
                        ? "Transparent"
                        : "Black"}
                  </td>
                  <td>
                    {plainMask === 65535 || a === undefined
                      ? "-"
                      : `S${value.digit}: ${possible.map((n) => hex(n, 1)).join(" ") || "none"}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Known-value examples and checking PID digits</summary>
        <p>
          For Emerald, regular Poké Ball, male OT, met level 16: Origins bytes
          are <code>90 21</code> (least significant first). Set Origins
          plaintext to S1=2, S2=1, S3=9, S4=0. Female OT changes S1 to A. Levels
          14 / 15 change S3,S4 to 8,E / 8,F.
        </p>
        <p>
          Move IDs in slot 2 or 4: Tackle <code>0021</code>, Uproar{" "}
          <code>00FD</code>, Faint Attack <code>00B9</code>, Psybeam{" "}
          <code>003C</code>. Byte 1 supplies S3/S4; byte 2 supplies S1/S2.
          Current PP 20 (<code>14</code>) in slot 3 supplies S3=1, S4=4; in slot
          4 supplies S1=1, S2=4. Check actual PP, including battle use and PP
          Ups.
        </p>
        <p>
          The SID is the upper half of OTID. For each known plaintext nibble,{" "}
          <code>SID digit = plaintext XOR corresponding upper PID digit</code>{" "}
          only when its pixel is transparent. This can recover SID conditional
          on your estimated PID; it cannot by itself prove that PID correct.
        </p>
        <p>
          The unencrypted PID header can reject some guesses: zero digits must
          be transparent; every nonzero digit must be black. It cannot
          distinguish two nonzero values.
        </p>
        <div className="inline-buttons">
          {Array.from({ length: 8 }, (_, i) => {
            const digit = (value.pid >>> ((7 - i) * 4)) & 15,
              nibble = 16 + 7 - i;
            return (
              <button
                key={i}
                disabled={!onLocate}
                onClick={() => onLocate?.(nibble)}
              >
                PID digit {i + 1}: {hex(digit, 1)} →{" "}
                {digit ? "black" : "transparent"} ({location(nibble)})
              </button>
            );
          })}
        </div>
        <p className="help">
          Layout reference:{" "}
          <a
            href="https://github.com/pret/pokeemerald/blob/master/include/pokemon.h"
            target="_blank"
            rel="noreferrer"
          >
            pret/pokeemerald Pokémon structures
          </a>
          . Byte numbers are little endian; high and low refer to bits 4–7 and
          0–3.
        </p>
      </details>
    </section>
  );
}
