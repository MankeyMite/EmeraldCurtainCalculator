import type { StarterTidPreview as Preview } from "../core/starterTidPreview";
import { firstShinyWait, shinyAdvanceColour } from "../core/starterTidPreview";
import { signedAdvanceDifference } from "../core/starterSidPriority";

export function StarterTidPreview({ value }: { value: Preview }) {
  return (
    <div aria-label="Nearby SIDs and first shiny advances">
      <p>
        Estimated SID-generation target: <strong>{value.target}</strong>. First
        shiny starter advance from <strong>{value.minimum}</strong>.
      </p>
      <div className="table-scroll">
        <table aria-label="Nearby SID shiny targets">
          <thead>
            <tr>
              <th>SID-generation advance</th>
              <th>Possible SID</th>
              <th>First shiny advance</th>
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row) => (
              <tr
                key={row.advance}
                aria-current={row.difference === 0 ? "true" : undefined}
                className={`starter-outlook-${shinyAdvanceColour(row.shinyAdvance)}${row.difference === 0 ? " starter-outlook-target" : ""}`}
              >
                <td>
                  {row.advance} ({signedAdvanceDifference(row.difference)})
                  {row.difference === 0 ? " · target" : ""}
                </td>
                <td>
                  {String(row.sid).padStart(5, "0")}{" "}
                  <code>
                    0x{row.sid.toString(16).toUpperCase().padStart(4, "0")}
                  </code>
                </td>
                <td>
                  {row.shinyAdvance ??
                    `None through ${value.limit.toLocaleString("en-US")}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <strong>Weighted Average First Shiny Advance: </strong>
        {value.weightedAverage === null ? (
          <>
            Unavailable: at least one SID has no shiny result through{" "}
            {value.limit.toLocaleString("en-US")} advances.
          </>
        ) : (
          <>
            <strong>
              {Math.round(value.weightedAverage).toLocaleString("en-US")}{" "}
              advances
            </strong>{" "}
            (about {firstShinyWait(value.weightedAverage)})
          </>
        )}
      </p>
      <p className="help">
        <strong>Not sure whether to keep your Trainer ID?</strong>
        <br />
        The weighted average estimates how long you can expect to wait for your
        first shiny frame. Lower is better!
      </p>
      <p className="help">
        An average below 10,000 advances is generally worth keeping. Above
        10,000, consider resetting your Trainer ID to try for shorter waiting
        times.
      </p>
      <p className="help">
        Your actual Secret ID may have a shorter or longer wait.
      </p>
    </div>
  );
}
