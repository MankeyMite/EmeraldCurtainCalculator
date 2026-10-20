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
  return (
    <>
      <label>
        Current PP
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
        <small>
          Max {maxPp(move, 3) ?? "?"}
          {text.trim() && stages.length === 1 ? ` · PP Ups ${stages[0]}` : ""}
        </small>
      </label>
      {error && (
        <p className="pp-error" id={errorId} role="alert">
          Move {index + 1}: {error}
        </p>
      )}
    </>
  );
}
