import { useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { allowedValues } from "../core/constraints";
import { hex } from "../core/pokemon";

export function SidDigitControls({ lab }: { lab: CurtainLab }) {
  const masks = lab.sidDigitFilters ?? [65535, 65535, 65535, 65535],
    active = masks.some((m) => m !== 65535);
  const [open, setOpen] = useState(false);
  return (
    <details
      className="sid-digit-controls investigation-card"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Manually limit SID digit candidates
        {active ? " · exclusions active" : ""}
      </summary>
      <p>
        Turn off hexadecimal values you have ruled out for each SID digit. S1 is
        the leftmost, highest digit; S4 is the rightmost. These reversible
        limits update SID recovery and the best next experiments.
      </p>
      <p className="help">
        Reuse an earlier Spinda’s exclusions only for the same original trainer.
        Public TID alone does not establish that. Manual limits save with this
        investigation; a new Pokémon starts with no exclusions.
      </p>
      {([3, 2, 1, 0] as const).map((n) => {
        const possible = lab.sidAnalysis
          ? lab.sidAnalysis.candidates.reduce(
              (m, h) => m | (1 << ((h.sid >>> (n * 4)) & 15)),
              0,
            )
          : (lab.inference?.masks?.[12 + n] ?? 65535);
        return (
          <fieldset key={n}>
            <legend>
              S{4 - n}
              {n === 3 ? " (highest)" : n === 0 ? " (lowest)" : ""} ·{" "}
              {allowedValues(masks[n]).length} allowed manually
            </legend>
            <div className="sid-digit-options">
              {Array.from({ length: 16 }, (_, digit) => (
                <button
                  key={digit}
                  aria-label={`Allow ${hex(digit, 1)} for SID S${4 - n}`}
                  aria-pressed={!!(masks[n] & (1 << digit))}
                  className={
                    !lab.analysisBusy &&
                    masks[n] & (1 << digit) &&
                    !(possible & (1 << digit))
                      ? "evidence-excluded"
                      : undefined
                  }
                  title={
                    !(masks[n] & (1 << digit))
                      ? "Excluded manually"
                      : !(possible & (1 << digit))
                        ? "Ruled out by current evidence; still allowed manually"
                        : "Allowed by your manual limits"
                  }
                  onClick={() =>
                    lab.setSidDigitFilters(
                      masks.map((m, i) => (i === n ? m ^ (1 << digit) : m)),
                    )
                  }
                >
                  {hex(digit, 1)}
                </button>
              ))}
            </div>
            <p className="help">
              {lab.analysisBusy
                ? "Updating candidates…"
                : `Remaining under current evidence: ${
                    allowedValues(possible)
                      .map((d) => hex(d, 1))
                      .join(" ") ||
                    "none — check facts, pixels and manual limits"
                  }`}
            </p>
            <button
              onClick={() =>
                lab.setSidDigitFilters(
                  masks.map((m, i) => (i === n ? 65535 : m)),
                )
              }
            >
              Allow all values for S{4 - n}
            </button>
          </fieldset>
        );
      })}
      {active && (
        <button onClick={() => lab.setSidDigitFilters(undefined)}>
          Clear all manual SID digit limits
        </button>
      )}
    </details>
  );
}
