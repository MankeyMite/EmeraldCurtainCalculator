import { useId, useMemo } from "react";
import { allowedValues } from "../core/constraints";
import { sidCandidateMasks } from "../core/spindaUsefulness";

/** Both displays project the surviving complete SIDs. Decimal positions cannot
 * be inferred by converting a partially recovered hexadecimal number. */
export function SidProgress({
  sids,
  updating = false,
}: {
  sids?: number[];
  updating?: boolean;
}) {
  const id = useId();
  const digits = useMemo(() => {
    if (!sids) return null;
    const hex = sidCandidateMasks(sids)
      .reverse()
      .map((mask) =>
        allowedValues(mask).map((n) => n.toString(16).toUpperCase()),
      );
    const decimal = Array.from({ length: 5 }, (_, index) =>
      [
        ...new Set(sids.map((sid) => sid.toString().padStart(5, "0")[index])),
      ].sort(),
    );
    return { hex, decimal };
  }, [sids]);
  const display = (values?: string[]) =>
    values?.length === 1 ? values[0] : values?.length === 0 ? "—" : "?";
  return (
    <div
      className="starter-sid-progress"
      role="group"
      aria-label="SID recovery progress"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={updating}
    >
      <div>
        <span className="starter-sid-label">Hex SID</span>
        <div className="starter-sid-hex">
          {Array.from({ length: 4 }, (_, index) => {
            const values = digits?.hex[index];
            const description = values
              ? values.length
                ? `S${index + 1} remaining: ${values.join(", ")}`
                : `S${index + 1}: no candidates match`
              : `S${index + 1}: waiting for SID candidates`;
            const tooltipId = `${id}-sid-${index}`;
            return (
              <div
                key={index}
                className={`starter-sid-digit${values?.length === 1 ? " known" : ""}`}
              >
                <span className="starter-sid-position">S{index + 1}</span>
                <strong aria-label={`S${index + 1}: ${display(values)}`}>
                  {display(values)}
                </strong>
                <span
                  className="starter-sid-count"
                  tabIndex={0}
                  aria-label={
                    values
                      ? `S${index + 1}: ${values.length} possible value${values.length === 1 ? "" : "s"}`
                      : `S${index + 1}: waiting`
                  }
                  aria-describedby={tooltipId}
                >
                  {values ? `${values.length} left` : "—"}
                  <span
                    id={tooltipId}
                    role="tooltip"
                    className="starter-sid-tooltip"
                  >
                    {description}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="starter-sid-decimal">
        <span className="starter-sid-label">Decimal SID</span>
        <code
          aria-label={`Decimal SID: ${Array.from({ length: 5 }, (_, i) => display(digits?.decimal[i])).join("")}`}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className={digits?.decimal[i].length === 1 ? "known" : undefined}
            >
              {display(digits?.decimal[i])}
            </span>
          ))}
        </code>
      </div>
    </div>
  );
}
