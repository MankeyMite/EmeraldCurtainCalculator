import { useMemo, useState, type FormEvent } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import {
  parseHypothesis,
  testHypothesis,
  type HypothesisDraft,
} from "../core/hypotheses";
import { NATURES } from "../core/pokemon";
import species from "../data/species.json";
import { pidSummary } from "../core/pid";
import { hex } from "../core/pokemon";

export function HypothesisChecker({ lab }: { lab: CurtainLab }) {
  const pid = pidSummary(lab.inference);
  const [draft, setDraft] = useState<HypothesisDraft>({});
  const [submitted, setSubmitted] = useState<HypothesisDraft | null>(null);
  const result = useMemo(() => {
    if (!submitted || lab.factError) return null;
    try {
      return testHypothesis(lab.masks, lab.facts, parseHypothesis(submitted));
    } catch (error) {
      return {
        status: "invalid" as const,
        reasons: [(error as Error).message],
      };
    }
  }, [submitted, lab.masks, lab.facts, lab.factError]);
  function edit(key: string, value: string) {
    setDraft((old) => ({ ...old, [key]: value }));
    setSubmitted(null);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted({ ...draft });
  }
  const title =
    result?.status === "possible"
      ? "Possible under current constraints"
      : result?.status === "impossible"
        ? "Impossible under current constraints"
        : result?.status === "baseline-conflict"
          ? "Resolve existing conflicts first"
          : result?.status === "invalid"
            ? "Check trial values"
            : "Enter a hypothesis";
  return (
    <section className="hypothesis-checker" aria-labelledby="hypothesis-title">
      <h3 id="hypothesis-title">PID possibilities</h3>
      <p>
        Choose a remaining PID or type one to check. Trying a value leaves your
        reconstruction and known information unchanged. The count, list and
        fixed digits below use your drawing and known information.
      </p>
      {lab.facts.pid !== undefined && (
        <p className="help">
          You already supplied a known PID. Clear it on Curtain if you want to
          compare alternative PIDs instead of assuming that value is true.
        </p>
      )}
      <form onSubmit={submit}>
        <div className="pid-input-row">
          <label className="trial-pid">
            PID to check
            <input
              list="possible-pids"
              value={draft.pid ?? ""}
              onChange={(e) => edit("pid", e.target.value)}
              placeholder="Decimal or 0xA53FEFE8"
              autoComplete="off"
            />
          </label>
          <strong className="pid-count" role="status">
            {pid.count.toLocaleString()} possible PID
            {pid.count === 1n ? "" : "s"}
          </strong>
        </div>
        <datalist id="possible-pids">
          {pid.values?.map((value) => (
            <option key={value} value={`0x${hex(value, 8)}`} />
          ))}
        </datalist>
        {pid.count > 0n ? (
          <div className="pid-pattern">
            <span>Fixed PID digits: </span>
            <code>
              0x
              {pid.digits.map((digit, i) => (
                <span
                  key={i}
                  title={`Hex digit ${i + 1}: ${digit.values.map((v) => hex(v, 1)).join(", ") || "no values"}`}
                >
                  {digit.digit}
                </span>
              ))}
            </code>
          </div>
        ) : (
          <p className="impossible">
            No PID satisfies the current drawing and known information.
          </p>
        )}
        <p className="help">
          Numeric PID order, highest digit first. ? means no single digit is
          established at that position.
        </p>
        {pid.values && pid.values.length > 0 ? (
          <details className="pid-options" open>
            <summary>
              Choose from {pid.values.length} possible PID
              {pid.values.length === 1 ? "" : "s"}
            </summary>
            <div className="pid-chips">
              {pid.values.map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => {
                    const next = { ...draft, pid: `0x${hex(value, 8)}` };
                    setDraft(next);
                    setSubmitted(next);
                  }}
                >
                  0x{hex(value, 8)}
                </button>
              ))}
            </div>
          </details>
        ) : pid.count > 100n ? (
          <p className="help">
            More than 100 PIDs remain, so the list is hidden. Type any PID to
            check it against the full constraints.
          </p>
        ) : null}
        <details>
          <summary>
            Other trial values <span className="summary-hint">optional</span>
          </summary>
          <p className="help">
            Filled fields are tested together. Leave a field blank to add no
            hypothesis about it. Known information still applies.
          </p>
          <div className="trial-fields">
            {(["tid", "sid"] as const).map((key) => (
              <label key={key}>
                Trial {key.toUpperCase()}
                <input
                  autoComplete="off"
                  placeholder="No trial value"
                  value={draft[key] ?? ""}
                  onChange={(e) => edit(key, e.target.value)}
                />
              </label>
            ))}
            <label>
              Trial nature
              <select
                value={draft.nature ?? ""}
                onChange={(e) => edit("nature", e.target.value)}
              >
                <option value="">No trial value</option>
                {NATURES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trial species
              <select
                value={draft.species ?? ""}
                onChange={(e) => edit("species", e.target.value)}
              >
                <option value="">No trial value</option>
                {species.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {[
              "HP",
              "Attack",
              "Defense",
              "Speed",
              "Sp. Attack",
              "Sp. Defense",
            ].map((name, i) => (
              <label key={name}>
                Trial {name} EV
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="No trial value"
                  value={draft[`ev_${i}`] ?? ""}
                  onChange={(e) => edit(`ev_${i}`, e.target.value)}
                />
              </label>
            ))}
          </div>
        </details>
        <div className="inline-buttons">
          <button type="submit" disabled={!!lab.factError}>
            Check values
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft({});
              setSubmitted(null);
            }}
          >
            Clear trial values
          </button>
        </div>
      </form>
      {lab.factError && (
        <p className="help">
          Fix the invalid known information before testing a hypothesis.
        </p>
      )}
      {result && (
        <div className={`hypothesis-result ${result.status}`} role="status">
          <strong>{title}</strong>
          <ul>
            {result.reasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {result.reasons.length > 4 && (
            <p>{result.reasons.length - 4} further conflicts.</p>
          )}
          {result.status === "possible" && (
            <p>
              {result.pidCount!.toLocaleString()} PID{" "}
              {result.pidCount === 1n ? "possibility" : "possibilities"};{" "}
              {result.headerPairCount!.toLocaleString()} PID / trainer-ID{" "}
              {result.headerPairCount === 1n ? "pair remains" : "pairs remain"}{" "}
              under this trial.
            </p>
          )}
        </div>
      )}
      <p className="help">
        “Possible” means not ruled out by this model. It does not confirm the
        Pokémon or prove RNG reachability. Checks cover pixels, known facts,
        nature, species, supplied gender/ability, IVs, EVs, condition,
        encryption and block order; checksum and legality are not tested. No
        candidate file is used. Summary-stat ranges are compared separately;
        exact IVs you apply are included here.
      </p>
    </section>
  );
}
