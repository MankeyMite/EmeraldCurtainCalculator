import type { StarterSidOutlook, StarterSidCase } from "../core/starterOutlook";

function difficultyLabel(row: StarterSidCase) {
  if (row.paintingOnly) return "Drawing only";
  if (row.experiments === null) return "Not resolved by this estimate";
  const training = [
    row.defenseTarget === null ? null : `${row.defenseTarget} Defense`,
    row.speedTarget === null ? null : `${row.speedTarget} Speed`,
  ].filter(Boolean);
  return (
    `≈${row.experiments} experiment${row.experiments === 1 ? "" : "s"}` +
    (training.length ? ` · train to ${training.join(" / ")} EVs` : "")
  );
}

export function StarterOutlook({
  outlook,
  onRetry,
}: {
  outlook: StarterSidOutlook;
  onRetry: () => void;
}) {
  const canRetry = outlook.cases.some(
    (row) => row.difficulty === "hard" || row.difficulty === "unknown",
  );
  return (
    <div aria-label="Starter SID preview">
      <div className="table-scroll">
        <table
          className="starter-outlook-table"
          aria-label="SID difficulty near the estimated target"
        >
          <caption>
            Estimated SID-generation target: advance {outlook.target}
          </caption>
          <thead>
            <tr>
              <th scope="col">Advance</th>
              <th scope="col">SID</th>
              <th scope="col">Difficulty</th>
            </tr>
          </thead>
          <tbody>
            {outlook.cases.map((row) => {
              const delta = row.advance - outlook.target,
                target = delta === 0;
              return (
                <tr
                  key={row.advance}
                  className={`starter-outlook-${row.difficulty}${target ? " starter-outlook-target" : ""}`}
                  aria-current={target ? "true" : undefined}
                >
                  <td>
                    {row.advance} ({delta > 0 ? `+${delta}` : delta})
                  </td>
                  <td>
                    <code>{String(row.sid).padStart(5, "0")}</code>
                  </td>
                  <td>{difficultyLabel(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="help">
        Green: drawing only. Yellow: experiments, with EV targets up to 10 per
        stat. Red: an EV target above 10 in either stat.
      </p>
      <p className="help">
        Estimates after the planned route, using known pixels, early items, move
        swaps and manual EV training. The bold row is an estimated target, not a
        verified SID. All {outlook.fullCount} SIDs remain in the full timing
        search.
      </p>
      {canRetry && (
        <>
          <button onClick={onRetry}>Try another starter (+20 advances)</button>
          <p className="help">
            Optional: shift the starter countdown about 0.33 seconds later.
            Calibration stays unchanged; search windows still overlap.
          </p>
        </>
      )}
    </div>
  );
}
