import { useEffect, useMemo, useState } from "react";
import { allowedValues, type KnownFacts } from "../core/constraints";
import { hex } from "../core/pokemon";
import { FACT_CATALOGS } from "../core/catalogs";
import { summaryFromDraft } from "../core/stats";
import {
  spindaBlockOrder,
  spindaInfoPlaintext,
  spindaRngEvidence,
  spindaSidTargets,
  guidePlaintextDetails,
  type SpindaSidGuideState,
} from "../core/spindaSidGuide";
import {
  sidCandidateMasks,
  spindaRemainingSids,
  spindaStatCandidate,
  testedSpindaDigits,
  usefulSpindaTargets,
  type SpindaSidProgress,
} from "../core/spindaUsefulness";
import type { SpindaCandidate } from "../core/spindaMatcher";
import { hitForNibble, recordStripLayout } from "./WorkbenchData";
import { SummaryStatInputs } from "./SummaryStatInputs";
import { SidPixelQuestion } from "./SidPixelQuestion";
import { SpindaCurtainLocator } from "./SpindaJourneyPages";
import { spindaStoragePlacement } from "../core/spindaJourney";

// Coordinates come from the actual flipped school tiles.
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
  sidDigitFilters = [65535, 65535, 65535, 65535],
  rngCandidate,
  rngStatus,
  tested = [0, 0, 0, 0],
  baseSids,
  onNext,
  onTargetsChange,
  summaryDraft,
  onSummaryChange,
  onBallChange,
  analysisPending,
  compact = false,
  language,
}: {
  value: SpindaSidGuideState;
  onChange: (next: SpindaSidGuideState) => void;
  onLocate?: (nibble: number) => void;
  facts?: KnownFacts;
  infoError?: boolean;
  sidDigitFilters?: number[];
  rngCandidate?: SpindaCandidate;
  rngStatus?: string;
  tested?: number[];
  baseSids?: number[];
  onNext?: (progress: SpindaSidProgress) => void;
  onTargetsChange?: (targets: number[]) => void;
  summaryDraft?: Record<string, string>;
  onSummaryChange?: (key: string, value: string) => void;
  onBallChange?: (ball: number) => void;
  analysisPending?: boolean;
  compact?: boolean;
  language?: number;
}) {
  const placement = spindaStoragePlacement(language ?? facts?.language);
  const [selectedNibble, setSelectedNibble] = useState<number | null>(null);
  const info = useMemo(
    () => (infoError ? undefined : spindaInfoPlaintext(facts)),
    [facts, infoError],
  );
  const candidate = useMemo(() => {
    if (infoError) return undefined;
    try {
      return spindaStatCandidate(
        rngCandidate,
        facts ?? {},
        summaryDraft ? summaryFromDraft(summaryDraft) : undefined,
      );
    } catch {
      return undefined;
    }
  }, [rngCandidate, facts, summaryDraft, infoError]);
  const rng = useMemo(
    () => spindaRngEvidence(value.pid, candidate, info),
    [value.pid, candidate, info],
  );
  const remainingSids = useMemo(
    () =>
      spindaRemainingSids(
        value,
        baseSids,
        sidDigitFilters,
        info,
        rng?.plaintexts,
      ),
    [value, baseSids, sidDigitFilters, info, rng],
  );
  const remaining = sidCandidateMasks(remainingSids),
    digits = remaining.map(allowedValues).reverse();
  const currentTested = testedSpindaDigits(value, info, rng?.masks);
  const missingIvEvidence =
    !rng &&
    ([1, 2, 3, 4] as const).some((digit) => {
      const t = spindaSidTargets(value.pid, digit)[10];
      return (
        value.observations[t.nibble] !== undefined &&
        guidePlaintextDetails(value, t, info).value === undefined
      );
    });
  const allUseful = usefulSpindaTargets(
    value,
    remaining,
    tested.map((m, n) => m | currentTested[n]),
    info,
    rng?.masks,
  );
  const frequencies = Array.from({ length: 4 }, () =>
    Array<number>(16).fill(0),
  );
  if (compact)
    for (const sid of remainingSids)
      for (let n = 0; n < 4; n++)
        frequencies[n][(sid >>> ((3 - n) * 4)) & 15]++;
  const targets = compact
    ? allUseful.slice().sort((a, b) => {
        const probability = (t: typeof a) =>
          frequencies[t.digit - 1][t.candidate] /
          Math.max(1, remainingSids.length);
        return Math.abs(probability(a) - 0.5) - Math.abs(probability(b) - 0.5);
      })
    : allUseful.filter((t) => t.digit === value.digit);
  const target = targets.find((t) => t.nibble === selectedNibble) ?? targets[0];
  const targetKey = targets.map((t) => t.nibble).join(",");
  useEffect(() => {
    onTargetsChange?.(targetKey ? targetKey.split(",").map(Number) : []);
  }, [targetKey, onTargetsChange]);
  const answer = (observed: 0 | 1) => {
    if (!target) return;
    const next = {
      ...value,
      observations: { ...value.observations, [target.nibble]: observed },
    };
    const sids = spindaRemainingSids(
      next,
      baseSids,
      sidDigitFilters,
      info,
      rng?.plaintexts,
    );
    const useful = usefulSpindaTargets(
      next,
      sidCandidateMasks(sids),
      tested.map((m, n) => m | testedSpindaDigits(next, info, rng?.masks)[n]),
      info,
      rng?.masks,
    );
    if (!useful.some((t) => t.digit === next.digit) && useful.length)
      next.digit = useful[0].digit;
    onChange(next);
  };
  const rows = [
    ...targets,
    ...spindaSidTargets(value.pid, value.digit)
      .filter((t) => value.observations[t.nibble] !== undefined)
      .map((t) => {
        const plaintext = guidePlaintextDetails(
          value,
          t,
          info,
          rng?.masks,
        ).value;
        return {
          ...t,
          plaintext,
          candidate:
            plaintext === undefined ? undefined : plaintext ^ t.pidDigit,
        };
      }),
  ];
  const ivRows =
    candidate?.encounters.filter(
      (e, i, all) =>
        all.findIndex(
          (other) =>
            other.ivs.join() === e.ivs.join() &&
            other.abilitySlot === e.abilitySlot &&
            other.methods.join() === e.methods.join(),
        ) === i,
    ) ?? [];
  if (compact)
    return (
      <section className="spinda-sid-guide" aria-label="Spinda SID checks">
        <div className="spinda-sid-digits">
          {digits.map((values, i) => (
            <div key={i}>
              S{i + 1}
              <strong>{values.length === 1 ? hex(values[0], 1) : "?"}</strong>
              <small>{values.length} possible</small>
            </div>
          ))}
        </div>
        <p>
          With Spinda in Box {placement.box}, slot {placement.slot}, leave and
          reenter Rustboro’s Trainers’ School to refresh the curtain.
        </p>
        {infoError && (
          <p role="alert">
            Correct the Pokémon information or stats before answering.
          </p>
        )}
        {!remainingSids.length && (
          <p role="alert">
            No SID matches. Review the PID, information and saved pixel answers.
          </p>
        )}
        {rng && !rng.ivs.length && (
          <p role="alert">
            No encounter spread matches the recorded information. Correct the
            stats, level or PID.
          </p>
        )}
        {target ? (
          <div className="spinda-experiment-question">
            <SpindaCurtainLocator nibble={target.nibble} />
            <div>
              <SidPixelQuestion
                target={target}
                disabled={!!infoError || !!analysisPending}
                onAnswer={answer}
              />
            </div>
          </div>
        ) : (
          <p>
            {remainingSids.length === 1
              ? `SID found: ${remainingSids[0]} · 0x${hex(remainingSids[0], 4)}.`
              : "The useful checks for this catch are complete. Next, compare an experiment with another catch."}
          </p>
        )}
        <button
          disabled={
            !!infoError ||
            !!analysisPending ||
            !remainingSids.length ||
            !!target ||
            missingIvEvidence
          }
          onClick={() =>
            onNext?.({
              remainingSids,
              tested: tested.map((m, n) => m | currentTested[n]),
            })
          }
        >
          {analysisPending
            ? "Updating candidates…"
            : "Continue to the next useful step"}
        </button>
        <details>
          <summary>Review saved pixel answers and remaining digits</summary>
          {digits.map((v, i) => (
            <p key={i}>
              S{i + 1}: {v.map((n) => hex(n, 1)).join(" ") || "none"}
            </p>
          ))}
          {Object.entries(value.observations).map(([n, observed]) => (
            <label key={n}>
              {location(Number(n))}
              <select
                value={observed}
                onChange={(e) => {
                  const observations = { ...value.observations };
                  if (e.target.value === "") delete observations[Number(n)];
                  else
                    observations[Number(n)] = Number(e.target.value) as 0 | 1;
                  onChange({ ...value, observations });
                }}
              >
                <option value="">Unanswered</option>
                <option value={0}>Transparent</option>
                <option value={1}>Black</option>
              </select>
            </label>
          ))}
          {!!Object.keys(value.observations).length && (
            <button onClick={() => onChange({ ...value, observations: {} })}>
              Clear guide answers
            </button>
          )}
        </details>
      </section>
    );
  return (
    <section className="spinda-sid-guide" aria-label="Spinda SID pixel guide">
      <h3>Check curtain pixels for SID digits</h3>
      <p>
        PID <strong>0x{hex(value.pid, 8)}</strong> · Catch this Spinda, then
        check the highlighted pixels in Box {placement.box}, slot{" "}
        {placement.slot}.
      </p>
      <p className="help">
        Stored order: {spindaBlockOrder(value.pid).join(" → ")}
      </p>
      {onBallChange && (
        <label>
          Caught in
          <select
            aria-label="Caught in Poké Ball"
            value={facts?.ball ?? ""}
            onChange={(e) => onBallChange(Number(e.target.value))}
          >
            <option value="" disabled>
              Choose ball
            </option>
            {FACT_CATALOGS.balls.map((ball) => (
              <option key={ball.id} value={ball.id}>
                {ball.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {rng ? (
        <>
          <strong>Encounter IVs for this exact PID</strong>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>IVs: HP / Atk / Def / Spe / SpA / SpD</th>
                  <th>IV bytes 3 / 4 (hex)</th>
                </tr>
              </thead>
              <tbody>
                {ivRows.map((e, i) => {
                  const word =
                    (e.ivs.reduce((v, iv, n) => v | (iv << (n * 5)), 0) |
                      (e.abilitySlot << 31)) >>>
                    0;
                  return (
                    <tr key={i}>
                      <td>{e.methods.join(" / ")}</td>
                      <td>{e.ivs.join(" / ")}</td>
                      <td>
                        <code>
                          {hex((word >>> 16) & 255, 2)} / {hex(word >>> 24, 2)}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rng.ivs.length && (
            <p role="alert">
              No IV spread matches. Check the stats, EVs and Pokémon info.
            </p>
          )}
        </>
      ) : (
        rngStatus && <p role="status">{rngStatus}</p>
      )}
      {summaryDraft && onSummaryChange && (
        <details className="stat-details">
          <summary>Check summary stats to identify H1 / H2 / H4</summary>
          <SummaryStatInputs draft={summaryDraft} onChange={onSummaryChange} />
        </details>
      )}
      {infoError && (
        <p role="alert">
          Correct the invalid Pokémon info or summary stats before checking
          pixels.
        </p>
      )}
      <div className="spinda-sid-digits" aria-label="Select SID digit">
        {([1, 2, 3, 4] as const).map((digit) => (
          <button
            key={digit}
            aria-pressed={value.digit === digit}
            onClick={() => onChange({ ...value, digit })}
          >
            S{digit}
            <strong>
              {digits[digit - 1].length === 1
                ? hex(digits[digit - 1][0], 1)
                : digits[digit - 1].length
                  ? "?"
                  : "!"}
            </strong>
            <small>{digits[digit - 1].length} possible</small>
          </button>
        ))}
      </div>
      <p role="status">
        SID:{" "}
        <code>
          0x
          {digits
            .map((d) => (d.length === 1 ? hex(d[0], 1) : d.length ? "?" : "!"))
            .join("")}
        </code>
        {!remainingSids.length &&
          " Conflicting answers: check the selected PID, stats and pixel answers."}
      </p>
      <div className="spinda-guide-workspace">
        <div>
          <p>
            <strong>
              S{value.digit}: {targets.length} useful pixels
            </strong>
          </p>
          <div
            className="spinda-guide-map"
            aria-label={`Curtain pixels for SID digit S${value.digit}`}
          >
            <span />
            {Array.from({ length: 8 }, (_, i) => (
              <small key={i}>{i + 1}</small>
            ))}
            {Array.from({ length: 20 }, (_, row) => (
              <div className="spinda-guide-row" key={row}>
                <small>{row + 1}</small>
                {cells
                  .filter((c) => c.row === row + 1)
                  .map((cell) => {
                    const t = targets.find((t) => t.nibble === cell.nibble);
                    return (
                      <button
                        key={cell.nibble}
                        disabled={!t}
                        aria-label={`${location(cell.nibble)}${t ? `: ${t.field}, plaintext ${hex(t.plaintext, 1)}, tests S${t.digit}=${hex(t.candidate, 1)}` : ": other field"}`}
                        aria-pressed={!!t && t.nibble === target?.nibble}
                        className={`${t ? "target" : ""} ${t && t.nibble === target?.nibble ? "selected" : ""} unknown`}
                        onClick={() => {
                          setSelectedNibble(cell.nibble);
                          onLocate?.(cell.nibble);
                        }}
                      >
                        {t ? hex(t.candidate, 1) : "·"}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
        <div className="spinda-guide-answer">
          {target ? (
            <SidPixelQuestion
              target={target}
              disabled={!!infoError}
              onAnswer={answer}
              onLocate={onLocate ? () => onLocate(target.nibble) : undefined}
            />
          ) : (
            <p>
              {digits.every((d) => d.length === 1)
                ? "SID found."
                : allUseful.length
                  ? "No untested candidates for this digit."
                  : "No useful untested pixels remain. Check the stats to resolve IV values, or catch the next Spinda."}
            </p>
          )}
          <p>
            Remaining S{value.digit}:{" "}
            <code>
              {digits[value.digit - 1].map((n) => hex(n, 1)).join(" ") ||
                "none"}
            </code>
          </p>
          {!!Object.keys(value.observations).length && (
            <button
              className="text-button"
              onClick={() => onChange({ ...value, observations: {} })}
            >
              Clear guide answers
            </button>
          )}
        </div>
      </div>
      {!!rows.length && (
        <div className="table-scroll">
          <table className="spinda-guide-fields">
            <thead>
              <tr>
                <th>Field</th>
                <th>Curtain pixel</th>
                <th>Plaintext (hex)</th>
                <th>Tests</th>
                <th>Answer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.nibble}
                  className={t.nibble === target?.nibble ? "selected" : ""}
                >
                  <td>
                    <button onClick={() => setSelectedNibble(t.nibble)}>
                      {t.field}
                    </button>
                  </td>
                  <td>{location(t.nibble)}</td>
                  <td>
                    <code>
                      {t.plaintext === undefined ? "?" : hex(t.plaintext, 1)}
                    </code>
                  </td>
                  <td>
                    S{t.digit}=
                    {t.candidate === undefined ? "?" : hex(t.candidate, 1)}
                  </td>
                  <td>
                    <select
                      aria-label={`Answer for ${location(t.nibble)}`}
                      value={value.observations[t.nibble] ?? -1}
                      disabled={!!infoError}
                      onChange={(e) => {
                        const observations = { ...value.observations };
                        const answer = Number(e.target.value);
                        if (answer === -1) delete observations[t.nibble];
                        else observations[t.nibble] = answer as 0 | 1;
                        onChange({ ...value, observations });
                      }}
                    >
                      <option value={-1}>Unanswered</option>
                      <option value={0}>Transparent</option>
                      <option value={1}>Black</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onNext && (
        <button
          disabled={
            !!infoError ||
            !!analysisPending ||
            !remainingSids.length ||
            missingIvEvidence
          }
          onClick={() =>
            onNext({
              remainingSids,
              tested: tested.map((m, n) => m | currentTested[n]),
            })
          }
        >
          Catch next Spinda
        </button>
      )}
    </section>
  );
}
