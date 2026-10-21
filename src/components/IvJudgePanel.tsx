import { useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { STAT_NAMES } from "../core/facts";
import { JUDGE_STAT_RATINGS, JUDGE_OVERALL_RATINGS } from "../core/ivJudge";

export function IvJudgePanel({ lab }: { lab: CurtainLab }) {
  const [stat, setStat] = useState(""),
    [rating, setRating] = useState("");
  const evidence = lab.facts.ivJudge ?? { best: [] },
    perfect = [
      ...new Set(
        evidence.best.filter((r) => r.rating === 3).map((r) => r.stat),
      ),
    ],
    disabled = !!lab.factError;
  return (
    <section className="iv-judge-panel" aria-labelledby="iv-judge-title">
      <h3 id="iv-judge-title">Battle Frontier IV judge</h3>
      <p>
        If you have reached the Battle Frontier after the Elite Four, show this
        Pokémon to the IV judge in his house. Record his overall assessment, the
        highest stat he names, and his comment about that stat.
      </p>
      <label>
        Overall assessment (optional)
        <select
          aria-label="IV judge overall assessment"
          disabled={disabled}
          value={evidence.overall ?? ""}
          onChange={(event) => {
            const next = {
              ...evidence,
              overall:
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value),
            };
            lab.setIvJudge(
              next.overall === undefined && !next.best.length
                ? undefined
                : next,
            );
          }}
        >
          <option value="">Not recorded</option>
          {JUDGE_OVERALL_RATINGS.map((r, i) => (
            <option key={i} value={i}>
              {r.text} · total IVs {r.min}–{r.max}
            </option>
          ))}
        </select>
      </label>
      <div className="iv-judge-answer">
        <label>
          Highest stat named
          <select
            aria-label="IV judge highest stat"
            value={stat}
            onChange={(e) => setStat(e.target.value)}
          >
            <option value="">Choose the stat he named</option>
            {[0, 1, 2, 4, 5, 3].map((i) => (
              <option key={i} value={i}>
                {STAT_NAMES[i]}
              </option>
            ))}
          </select>
        </label>
        <label>
          His comment about that stat
          <select
            aria-label="IV judge stat comment"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          >
            <option value="">Choose what he said</option>
            {JUDGE_STAT_RATINGS.map((r, i) => (
              <option key={i} value={i}>
                {r.text} · IV {r.min === r.max ? r.min : `${r.min}–${r.max}`}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={
            disabled ||
            stat === "" ||
            rating === "" ||
            evidence.best.length >= 100
          }
          onClick={() => {
            lab.setIvJudge({
              ...evidence,
              best: [
                ...evidence.best,
                { stat: Number(stat), rating: Number(rating) },
              ],
            });
          }}
        >
          Record judge answer
        </button>
      </div>
      {evidence.best.length > 0 && (
        <ul className="iv-judge-records">
          {evidence.best.map((r, i) => (
            <li key={i}>
              {STAT_NAMES[r.stat]}: {JUDGE_STAT_RATINGS[r.rating].text}{" "}
              <button
                disabled={disabled}
                aria-label={`Remove judge answer ${i + 1}`}
                onClick={() => {
                  const best = evidence.best.filter((_, j) => j !== i);
                  lab.setIvJudge(
                    !best.length && evidence.overall === undefined
                      ? undefined
                      : { ...evidence, best },
                  );
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {perfect.length > 0 && (
        <p role="status" className="judge-repeat-guidance">
          Confirmed 31 IVs: {perfect.map((i) => STAT_NAMES[i]).join(", ")}. Talk
          to him a few more times and record any other stat he calls flawless.
          Emerald uses RNG when the highest IVs tie. Seeing the same stat again
          does not rule out other 31s, so unmentioned stats stay possible.
        </p>
      )}
      <p className="help">
        A named stat is one of the highest IVs; other stats may tie it. If his
        highest-stat rating is below 31, all six IVs are below 31. Saved answers
        constrain every observation of this Pokémon. Ranges and counts may
        remain conservative where packed IV, key and checksum correlations are
        unresolved.
      </p>
      {lab.ivEstimates.some((r) => !r.combined.length) && (
        <p role="alert" className="error-text">
          The judge answers conflict with the current IV, summary or curtain
          constraints. Check the selected wording and Pokémon, or remove an
          incorrect answer.
        </p>
      )}
    </section>
  );
}
