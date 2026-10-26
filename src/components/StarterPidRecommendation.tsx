import type { StarterPidRecommendation as Recommendation } from "../core/starterRecommendation";
import { speciesTraits } from "../core/traits";
import { canSearchOptimalPid } from "../core/starterRecommendation";

export function OptimalPidSearch({
  tid,
  busy,
  progress,
  complete,
  onSearch,
}: {
  tid: string;
  busy: boolean;
  progress: number;
  complete: boolean;
  onSearch: () => void;
}) {
  const percent = busy ? progress : 100;
  return (
    <div className="starter-pid-search">
      <button disabled={!canSearchOptimalPid(tid) || busy} onClick={onSearch}>
        Search optimal PID
      </button>
      {(busy || complete) && (
        <div className="starter-search-progress">
          <progress
            aria-label="Optimal PID search progress"
            max={100}
            value={percent}
          />
          <span role="status">
            {busy ? "Searching" : "Search complete"} · {percent}%
          </span>
        </div>
      )}
    </div>
  );
}

export function StarterPidRecommendation({
  value,
  applied,
}: {
  value: Recommendation;
  applied: boolean;
}) {
  return (
    <div aria-label="Suggested starter target">
      <p>
        <strong>
          {speciesTraits(value.species)!.name}: target advance {value.advance}.
        </strong>{" "}
        {applied
          ? "The timer is set for this target."
          : "Suggested target; your current timer or starter differs."}
      </p>
      <details>
        <summary>11 nearby starter PIDs</summary>
        <div className="table-scroll">
          <table aria-label="Recommended starter PID window">
            <thead>
              <tr>
                <th>Advance</th>
                <th>PID</th>
                <th>Drawing only</th>
                <th>Without EV training</th>
              </tr>
            </thead>
            <tbody>
              {value.rows.map((row) => (
                <tr
                  key={row.advance}
                  aria-current={
                    row.advance === value.advance ? "true" : undefined
                  }
                  className={`${row.drawingOnly === value.priorityCount && !row.ambiguous ? "starter-outlook-easy" : "starter-outlook-moderate"}${row.advance === value.advance ? " starter-outlook-target" : ""}`}
                >
                  <td>
                    {row.advance}
                    {row.advance === value.advance ? " · target" : ""}
                  </td>
                  <td>
                    <code>
                      {row.pid.toString(16).toUpperCase().padStart(8, "0")}
                    </code>
                  </td>
                  <td>
                    {row.drawingOnly}/{value.priorityCount}
                    {row.ambiguous ? " · stats overlap" : ""}
                  </td>
                  <td>
                    {row.withoutTraining}/{value.priorityCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="help">
          Estimated outcomes across {value.priorityCount} likely SID timings,
          compared with all {value.fullSidCount} SID candidates. Without EV
          training counts timing-aware rehearsals resolved using item changes
          and move swaps. Ranking favours fewer inexpensive experiments and
          lower EV training at the exact target and nearby advances, with more
          weight on SIDs close to the estimated timing. These counts are
          unweighted. Overlapping stats may require another starter attempt.
        </p>
      </details>
    </div>
  );
}
