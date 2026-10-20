import type { CurtainLab } from "../hooks/useCurtainLab";
import { STAT_NAMES } from "../core/facts";
import { valueRanges } from "../core/stats";

export function IVAnalysis({ lab }: { lab: CurtainLab }) {
  const exact = lab.ivEstimates.filter(
    (row, i) =>
      row.stats !== null &&
      row.combined.length === 1 &&
      lab.facts.ivs?.[i] !== row.combined[0],
  ).length;
  return (
    <section className="iv-analysis" aria-labelledby="iv-analysis-title">
      <h3 id="iv-analysis-title">IV ranges</h3>
      <p className="micro">
        Enter level and summary stats under Known Pokémon information to combine
        a standard IV calculation with curtain data. Each combined range is an
        upper bound; different stats may depend on different keys/PIDs. A single
        remaining value is fixed if the supplied information is correct.
      </p>
      {lab.summaryError && (
        <p className="error-text" role="alert">
          {lab.summaryError}
        </p>
      )}
      <div className="table-scroll">
        <table className="iv-range-table">
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col">Stats only</th>
              <th scope="col">Curtain + known facts</th>
              <th scope="col">Combined</th>
            </tr>
          </thead>
          <tbody>
            {lab.ivEstimates.map((row, i) => (
              <tr key={i}>
                <th scope="row">{STAT_NAMES[i]}</th>
                <td title={row.why || row.note}>
                  {row.stats === null ? "—" : valueRanges(row.stats)}
                  {row.stats === null && <small>{row.why}</small>}
                  {row.note && <small>{row.note}</small>}
                </td>
                <td>{valueRanges(row.curtain)}</td>
                <td
                  className={
                    row.combined.length === 0
                      ? "impossible"
                      : row.combined.length === 1
                        ? "possible"
                        : undefined
                  }
                >
                  {valueRanges(row.combined)}
                  <small>
                    {row.combined.length === 0
                      ? "Conflict: check stats, EVs, level and painting"
                      : row.combined.length === 1
                        ? "1 value"
                        : `≤ ${row.combined.length} values`}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exact > 0 && (
        <button
          onClick={lab.applyEstimatedIVs}
          disabled={
            !!lab.summaryError ||
            !!lab.factError ||
            !lab.inference.consistent ||
            lab.ivEstimates.some(
              (row) => row.stats !== null && row.combined.length === 0,
            )
          }
        >
          Use {exact} exact IV{exact === 1 ? "" : "s"} in reconstruction
        </button>
      )}
      <p className="micro">
        Multi-value stat ranges are not yet propagated jointly into PID counts
        or PID checks. Applied exact IVs are. This is a compatibility
        calculation, not proof of legality or identity.
      </p>
    </section>
  );
}
