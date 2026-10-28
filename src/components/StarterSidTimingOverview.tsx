import type {
  SidTimingCandidate,
  SidTimingPriority,
} from "../core/starterSidPriority";
import { signedAdvanceDifference } from "../core/starterSidPriority";

const sidLabel = (row: SidTimingCandidate) =>
  `0x${row.sid.toString(16).toUpperCase().padStart(4, "0")} (${String(row.sid).padStart(5, "0")})`;
const advanceLabel = (row: SidTimingCandidate, target: number) =>
  row.closestAdvances.length
    ? row.closestAdvances
        .map((a) => `${a} (${signedAdvanceDifference(a - target)})`)
        .join(" / ")
    : "Timing unavailable";

export function StarterSidTimingOverview({
  value,
  updating = false,
}: {
  value: SidTimingPriority;
  updating?: boolean;
}) {
  if (!value.candidates.length || !value.leaders.length) return null;
  const leader = value.leaders[0],
    alternative = value.candidates.find((row) => !value.leaders.includes(row));
  const gap =
    alternative?.closestAdvances.length && leader.closestAdvances.length
      ? Math.min(
          ...value.leaders
            .flatMap((row) => row.closestAdvances)
            .flatMap((a) =>
              alternative.closestAdvances.map((b) => Math.abs(a - b)),
            ),
        )
      : null;
  return (
    <div
      className="starter-sid-timing"
      aria-label="SID timing overview"
      aria-busy={updating}
    >
      <p className="help">
        Estimated SID-generation target: advance {value.target}
      </p>
      {value.candidates.length === 1 ? (
        <p>
          Surviving SID: <strong>{sidLabel(leader)}</strong> · Generating
          advance {advanceLabel(leader, value.target)}.
        </p>
      ) : value.leaders.length === 1 ? (
        <p>
          <strong>Most likely by timing: {sidLabel(leader)}</strong>
          <br />
          Closest generating advance: {advanceLabel(leader, value.target)}.
        </p>
      ) : (
        <p>
          <strong>
            {value.leaders.length} SIDs tied closest to the target
          </strong>
          <br />
          {value.leaders.map((row, n) => (
            <span key={row.sid}>
              {n > 0 && "; "}
              {sidLabel(row)} at {advanceLabel(row, value.target)}
            </span>
          ))}
          .
        </p>
      )}
      {alternative && (
        <p>
          Next closest: {sidLabel(alternative)} at{" "}
          {advanceLabel(alternative, value.target)}.
          {gap !== null && (
            <> Gap between closest generating advances: {gap}.</>
          )}
        </p>
      )}
      {value.candidates.length > 1 && (
        <p className="help">
          Timing is an estimate, not confirmation. All {value.candidates.length}{" "}
          surviving SIDs in the configured window remain possible.
        </p>
      )}
      <details>
        <summary>
          All {value.candidates.length} surviving SIDs by timing distance
        </summary>
        <div className="table-scroll">
          <table aria-label="Surviving SID timing distances">
            <thead>
              <tr>
                <th scope="col">SID (hex / decimal)</th>
                <th scope="col">Closest advance (difference)</th>
                <th scope="col">Distance</th>
                <th scope="col">All generating advances</th>
              </tr>
            </thead>
            <tbody>
              {value.candidates.map((row) => (
                <tr
                  key={row.sid}
                  className={
                    value.leaders.includes(row)
                      ? "starter-outlook-target"
                      : undefined
                  }
                >
                  <td>
                    <code>{sidLabel(row)}</code>
                    {value.leaders.length > 1 &&
                      value.leaders.includes(row) &&
                      " · tied"}
                  </td>
                  <td>{advanceLabel(row, value.target)}</td>
                  <td>{row.distance ?? "Unknown"}</td>
                  <td>{row.advances.join(", ") || "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
