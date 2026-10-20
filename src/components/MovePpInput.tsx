import { useId, useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { maxPp, ppInputError, ppUpStages } from "../core/pp";
export function MovePpInput({
  lab,
  index,
}: {
  lab: CurtainLab;
  index: number;
}) {
  const [blurred, setBlurred] = useState(false),
    errorId = useId(),
    key = `pp_${index}`,
    text = lab.factDraft[key] ?? "";
  const move = lab.facts.moves?.[index] ?? undefined,
    error = blurred ? ppInputError(move, text) : "";
  const stages = ppUpStages(
    move,
    text.trim() && /^\d+$/.test(text) ? Number(text) : undefined,
  );
  const stage =
    lab.facts.ppBonuses !== undefined
      ? (lab.facts.ppBonuses >>> (index * 2)) & 3
      : stages.length === 1
        ? stages[0]
        : "";
  const canChooseStage =
    maxPp(move, 0) !== undefined && maxPp(move, 0) !== maxPp(move, 3);
  return (
    <>
      <label className="move-pp-field">
        PP
        <input
          aria-label={`Move ${index + 1} current PP`}
          inputMode="numeric"
          value={text}
          placeholder="Unknown"
          title={
            error ||
            "PC storage restores PP. Enter the maximum shown after storage; its PP Up stage is inferred automatically."
          }
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          className={
            error
              ? "pp-invalid"
              : lab.facts.assumed?.includes(key)
                ? "assumed-input"
                : ""
          }
          onChange={(e) => lab.editFact(key, e.target.value)}
          onFocus={() => setBlurred(false)}
          onBlur={() => setBlurred(true)}
        />
        <small className="pp-limit">Max {maxPp(move, 3) ?? "?"}</small>
      </label>
      <label className="move-pp-ups">
        PP Ups
        <select
          aria-label={`Move ${index + 1} PP Ups`}
          value={stage}
          disabled={!canChooseStage}
          title={
            canChooseStage
              ? "Choose 0–3 PP Ups to set full PP after PC storage. Typing a valid full PP value also selects its stage."
              : "Select a move whose PP can be increased to choose PP Ups."
          }
          className={lab.facts.assumed?.includes(key) ? "assumed-input" : ""}
          onChange={(e) => lab.editMovePpUps(index, Number(e.target.value))}
        >
          <option value="" disabled>
            ?
          </option>
          {[0, 1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="pp-error" id={errorId} role="alert">
          Move {index + 1}: {error}
        </p>
      )}
    </>
  );
}
